import { createInterface } from 'node:readline'
import type { Readable, Writable } from 'node:stream'
import { join } from 'node:path'
import { createCrashPolicy } from './crashPolicy'

/** The call's window to read (picked on the "Take notes?" card): its app, the tab or window title seen with the call, a browser? */
export type ScreenTarget = { appId: string; title: string; browser: boolean }
/** A new text on the call's window, at meeting time; frame: its picture in the meeting's screen folder */
export type LiveScreenLine = { ms: number; text: string; frame?: string }
/** where a meeting's pictures of the call's screen are kept (What Yogurt keeps: video) */
export const SCREEN_FRAMES = 'screen'

/** The parts of yogurt-audio screen-live this uses, so tests and fake mode can stand in */
export interface ScreenProc {
  stdout: Readable
  stdin: Writable
  on(e: 'exit', fn: (code: number | null) => void): unknown
  kill(signal?: NodeJS.Signals): boolean
}

export const liveScreenArgs = (t: ScreenTarget, o: { startMs: number; frames: string | null }): string[] =>
  ['screen-live', '--app', t.appId, ...(t.title ? ['--title', t.title] : []), ...(t.browser ? ['--browser'] : []), '--start-ms', String(Math.max(0, Math.round(o.startMs))), ...(o.frames ? ['--frames', o.frames] : [])]

/** One line from screen-live: a new text, or Screen Recording is off; anything else is left out */
export function readLiveLine(row: string): LiveScreenLine | 'no-access' | null {
  let o: { ms?: unknown; text?: unknown; frame?: unknown; access?: unknown }
  try { o = JSON.parse(row) } catch { return null }
  if (o.access === false) return 'no-access'
  if (typeof o.ms !== 'number' || !Number.isFinite(o.ms) || o.ms < 0 || typeof o.text !== 'string' || !o.text.trim()) return null
  return { ms: Math.round(o.ms), text: o.text.trim(), ...(typeof o.frame === 'string' && /^\d+\.jpg$/.test(o.frame) ? { frame: o.frame } : {}) }
}

/**
 * Reads the call's window while a meeting records, when the person chose it on the card (next, just before the meeting
 * starts). Starts and stops with the recording, pauses with it, and starts again if the helper dies (crashPolicy) at the
 * meeting time reached; a crash loop only ends the screen reading, never the recording.
 */
export function hookLiveScreen(d: {
  dirOf: (id: string) => string
  onStart: (fn: (m: { id: string }) => void) => unknown
  onStop: (fn: (m: { id: string }) => void) => unknown
  onPaused: (fn: (meetingId: string, paused: boolean) => void) => unknown
  /** meeting time now, where a restarted reader carries on */
  meetingMs: () => number
  /** the pictures read are kept with the meeting (What Yogurt keeps: video, unless it is Don't keep it) */
  keepFrames: () => boolean
  line: (meetingId: string, l: LiveScreenLine) => void
  /** Screen Recording is off: the meeting records its sound only */
  noAccess: (meetingId: string) => void
  start: (args: string[]) => ScreenProc
}) {
  type Session = { id: string; target: ScreenTarget; proc: ScreenProc | null; paused: boolean; over: boolean }
  /** id and until: the card's call already had a note, which resumes from the note a moment later */
  let pending: { target: ScreenTarget; id?: string; until?: number } | null = null
  let session: Session | null = null

  const send = (p: ScreenProc, cmd: string) => {
    if (p.stdin.destroyed || !p.stdin.writable) return
    try { p.stdin.write(cmd + '\n') } catch { /* gone */ }
  }
  const run = (s: Session, startMs: number, policy: ReturnType<typeof createCrashPolicy>) => {
    const frames = d.keepFrames() ? join(d.dirOf(s.id), SCREEN_FRAMES) : null
    const p = d.start(liveScreenArgs(s.target, { startMs, frames }))
    s.proc = p
    p.stdin.on('error', () => {})
    if (s.paused) send(p, 'pause')
    let refused = false
    createInterface({ input: p.stdout }).on('line', (row) => {
      const l = readLiveLine(row)
      if (l === 'no-access') { refused = true; d.noAccess(s.id) }
      else if (l && !s.over) d.line(s.id, l)
    })
    p.on('exit', (code) => {
      if (s.proc !== p) return
      s.proc = null
      if (s.over || refused) return
      console.error('reading the call screen ended unexpectedly', s.id, code)
      policy.ended({ crashed: true })
    })
  }

  d.onStart((m) => {
    const p = pending
    pending = null
    const target = p && (!p.id || (p.id === m.id && Date.now() < (p.until ?? 0))) ? p.target : null
    if (!target || session) return
    const s: Session = { id: m.id, target, proc: null, paused: false, over: false }
    session = s
    const policy = createCrashPolicy({
      restart: () => run(s, d.meetingMs(), policy),
      hiccup: () => {},
      giveUp: () => { s.over = true; console.error('reading the call screen stopped after repeated crashes', s.id) },
    })
    // a resumed note carries on after its earlier part
    run(s, d.meetingMs(), policy)
  })
  d.onPaused((id, paused) => {
    if (session?.id !== id || session.paused === paused) return
    session.paused = paused
    if (session.proc) send(session.proc, paused ? 'pause' : 'resume')
  })
  d.onStop((m) => {
    const s = session
    if (s?.id !== m.id) return
    session = null
    s.over = true
    const p = s.proc
    if (!p) return
    send(p, 'stop')
    // a reader stuck in a capture is ended after 5 s; what it saved is already on disk
    const timer = setTimeout(() => p.kill('SIGKILL'), 5_000)
    p.on('exit', () => clearTimeout(timer))
  })

  return {
    /** the next meeting to start reads this call's window (null: none); set just before it starts. resuming: only that
     *  meeting, within a minute (its note resumes it) */
    next(t: ScreenTarget | null, resuming?: string) { pending = t && { target: t, ...(resuming ? { id: resuming, until: Date.now() + 60_000 } : {}) } },
    /** for tests: the meeting whose call screen is being read */
    reading: (): string | null => (session && !session.over ? session.id : null),
  }
}
