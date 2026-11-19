import { EventEmitter } from 'node:events'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import type { ScreenProc } from './liveScreen'

/** the two slides fake mode's call shows, as yogurt-audio screen-live would read them */
export const FAKE_SLIDES = ['Q3 roadmap\nLaunch on Tuesday', 'Budget 40,000 EUR\nOwner: Ann Lee']

/**
 * Fake mode: screen-live without ScreenCaptureKit. A slide is read 300 ms after the start and the next 300 ms later, each
 * with a picture when the frames folder is given; nothing while paused. Screen Recording off: it says so and ends.
 */
export function fakeScreenProc(args: string[], access: () => boolean): ScreenProc {
  const ev = new EventEmitter()
  const stdout = new PassThrough(), stdin = new PassThrough()
  const value = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined }
  const frames = value('--frames')
  let base = Number(value('--start-ms') ?? 0), since: number | null = Date.now(), next = 0, ended = false
  const ms = () => Math.round(base + (since === null ? 0 : Date.now() - since))
  const finish = (code: number | null) => {
    if (ended) return
    ended = true; clearInterval(timer)
    stdout.end()
    setImmediate(() => ev.emit('exit', code))
  }
  const timer = setInterval(() => {
    if (since === null || next >= FAKE_SLIDES.length) return
    const at = ms()
    if (at < (next + 1) * 300) return
    const line: Record<string, unknown> = { ms: at, text: FAKE_SLIDES[next++] }
    if (frames) { mkdirSync(frames, { recursive: true }); writeFileSync(join(frames, `${at}.jpg`), 'fake picture'); line.frame = `${at}.jpg` }
    stdout.write(JSON.stringify(line) + '\n')
  }, 50)
  stdin.on('data', (d: Buffer) => {
    for (const cmd of d.toString().split('\n')) {
      if (cmd === 'pause' && since !== null) { base += Date.now() - since; since = null }
      else if (cmd === 'resume' && since === null) since = Date.now()
      else if (cmd === 'stop') finish(0)
    }
  })
  if (!access()) setImmediate(() => { stdout.write(JSON.stringify({ access: false }) + '\n'); finish(0) })
  return {
    stdout, stdin,
    on: (e: 'exit', fn: (code: number | null) => void) => ev.on(e, fn),
    kill: () => { finish(null); return true },
  }
}
