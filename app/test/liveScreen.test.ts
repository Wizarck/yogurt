import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { decide, useCallApps } from '../src/main/detect'
import { hookLiveScreen, liveScreenArgs, readLiveLine, type ScreenProc } from '../src/main/liveScreen'
import { WidgetModel } from '../src/main/widgetModel'

/** a stand-in screen-live: what it was given on stdin, and a way to make it print or die */
function proc() {
  const ev = new EventEmitter(), stdout = new PassThrough(), stdin = new PassThrough(), got: string[] = []
  stdin.on('data', (d: Buffer) => got.push(...d.toString().split('\n').filter(Boolean)))
  const p: ScreenProc & { got: string[]; say(o: unknown): void; exit(code: number | null): void } = {
    stdout, stdin, got,
    on: (e: 'exit', fn: (code: number | null) => void) => ev.on(e, fn),
    kill: vi.fn(() => true),
    say: (o) => stdout.write(JSON.stringify(o) + '\n'),
    exit: (code) => ev.emit('exit', code),
  }
  return p
}
const tick = () => new Promise((r) => setTimeout(r, 0))

function setup(o: { keepFrames?: boolean } = {}) {
  const starts: Array<(m: { id: string }) => void> = [], stops: Array<(m: { id: string }) => void> = [], pauses: Array<(id: string, p: boolean) => void> = []
  const procs: ReturnType<typeof proc>[] = [], args: string[][] = [], lines: unknown[] = [], refused: string[] = []
  let ms = 0
  const hook = hookLiveScreen({
    dirOf: (id) => `/meetings/${id}`, onStart: (fn) => starts.push(fn), onStop: (fn) => stops.push(fn), onPaused: (fn) => pauses.push(fn),
    meetingMs: () => ms, keepFrames: () => o.keepFrames ?? true,
    line: (id, l) => lines.push([id, l]), noAccess: (id) => refused.push(id),
    start: (a) => { args.push(a); const p = proc(); procs.push(p); return p },
  })
  return {
    hook, procs, args, lines, refused, at: (n: number) => { ms = n },
    start: (id: string) => starts.forEach((f) => f({ id })), stop: (id: string) => stops.forEach((f) => f({ id })),
    pause: (id: string, p: boolean) => pauses.forEach((f) => f(id, p)),
  }
}

describe('reading a call window while it records', () => {
  it('starts only for the meeting the card chose it for, with the call app, its title and the frames folder', () => {
    const s = setup()
    s.start('plain')
    expect(s.args).toEqual([])
    s.stop('plain')
    s.hook.next({ appId: 'com.google.Chrome', title: 'Meet - abc-defg-hij', browser: true })
    s.start('m1')
    expect(s.args).toEqual([['screen-live', '--app', 'com.google.Chrome', '--title', 'Meet - abc-defg-hij', '--browser', '--start-ms', '0', '--frames', '/meetings/m1/screen']])
    expect(s.hook.reading()).toBe('m1')
    // the choice is for that one meeting: the next one reads nothing
    s.stop('m1'); s.start('m2')
    expect(s.args).toHaveLength(1)
  })

  it("What Yogurt keeps set to Don't keep it: the window is still read, its pictures are not saved", () => {
    const s = setup({ keepFrames: false })
    s.hook.next({ appId: 'us.zoom.xos', title: '', browser: false })
    s.start('m1')
    expect(s.args[0]).toEqual(['screen-live', '--app', 'us.zoom.xos', '--start-ms', '0'])
  })

  it("each new text becomes a line of the meeting; Screen Recording off says so once and doesn't restart", async () => {
    const s = setup()
    s.hook.next({ appId: 'us.zoom.xos', title: '', browser: false })
    s.start('m1')
    s.procs[0].say({ ms: 4000, text: ' Q3 roadmap ', frame: '4000.jpg' })
    s.procs[0].say({ ms: 6000, text: '   ' })
    s.procs[0].say({ access: false })
    await tick()
    s.procs[0].exit(0)
    expect(s.lines).toEqual([['m1', { ms: 4000, text: 'Q3 roadmap', frame: '4000.jpg' }]])
    expect(s.refused).toEqual(['m1'])
    expect(s.procs).toHaveLength(1)
  })

  it('pauses and resumes with the recording, and stops with it', () => {
    const s = setup()
    s.hook.next({ appId: 'us.zoom.xos', title: '', browser: false })
    s.start('m1')
    s.pause('other', true); s.pause('m1', true); s.pause('m1', true); s.pause('m1', false)
    s.stop('m1')
    expect(s.procs[0].got).toEqual(['pause', 'resume', 'stop'])
    expect(s.hook.reading()).toBeNull()
  })

  it('a crash starts it again at the meeting time reached (paused if the recording is); a crash loop ends only the screen reading', async () => {
    const s = setup()
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    s.hook.next({ appId: 'us.zoom.xos', title: '', browser: false })
    s.start('m1')
    s.pause('m1', true)
    s.at(65_400); s.procs[0].exit(null)
    expect(s.args[1]).toContain('65400')
    expect(s.procs[1].got).toEqual(['pause'])
    s.procs[1].exit(1)
    expect(s.procs).toHaveLength(3)
    s.procs[2].exit(1)
    expect(s.procs).toHaveLength(3)
    s.procs[2].say({ ms: 70_000, text: 'late' })
    await tick()
    expect(s.lines).toEqual([])
    expect(err).toHaveBeenCalled()
    err.mockRestore()
  })

  it('reads only well-formed lines', () => {
    expect(readLiveLine('{"ms":12.4,"text":"a\\nb","frame":"12.jpg"}')).toEqual({ ms: 12, text: 'a\nb', frame: '12.jpg' })
    expect(readLiveLine('{"ms":5,"text":"x","frame":"../x.jpg"}')).toEqual({ ms: 5, text: 'x' })
    expect(readLiveLine('{"access":false}')).toBe('no-access')
    for (const bad of ['', 'nope', '{"ms":-1,"text":"x"}', '{"ms":"1","text":"x"}', '{"ms":1}']) expect(readLiveLine(bad)).toBeNull()
    expect(liveScreenArgs({ appId: 'a', title: '', browser: false }, { startMs: -3, frames: null })).toEqual(['screen-live', '--app', 'a', '--start-ms', '0'])
  })
})

describe('the card knows the call window', () => {
  beforeEach(() => useCallApps('darwin'))
  afterEach(() => useCallApps('darwin'))
  it("a call names its app's window: the app itself for a helper, and a browser with the tab's title", () => {
    const sig = (micApps: { bundleId: string; name: string; title?: string }[], runningApps: string[] = []) => ({ micApps, events: [], recording: false, runningApps })
    expect(decide(sig([{ bundleId: 'us.zoom.xos', name: 'zoom.us' }]), 0, new Set())?.screen).toEqual({ appId: 'us.zoom.xos', title: '', browser: false })
    expect(decide(sig([{ bundleId: 'com.google.Chrome.helper', name: 'Chrome', title: 'Meet - abc-defg-hij' }], ['com.google.Chrome']), 0, new Set())?.screen)
      .toEqual({ appId: 'com.google.Chrome', title: 'Meet - abc-defg-hij', browser: true })
  })
})

describe('the recording note', () => {
  it("says the call's screen can't be read while Screen Recording is off", () => {
    const m = new WidgetModel('darwin')
    m.start({ id: 'm1', title: 'Sync', startedAt: 0 })
    m.warn('no-screen-access')
    expect(m.view(1000)?.note).toEqual({ tone: 'hint', text: "Yogurt can't read the call's screen. Allow screen recording in System Settings." })
  })
})

describe('the Take notes card', () => {
  beforeEach(() => { vi.resetModules() })
  it("offers to read the call's window only where it can, and passes the choice on with Start recording", async () => {
    const handlers = new Map<string, (...a: unknown[]) => unknown>()
    vi.doMock('electron', () => ({
      BrowserWindow: class {
        on() {} once() {} destroy() {} isDestroyed() { return false } loadFile() { return Promise.resolve() } setBackgroundColor() {}
      },
      ipcMain: { handle: (name: string, fn: (...a: unknown[]) => unknown) => handlers.set(name, fn) },
      Notification: { isSupported: () => false },
      nativeTheme: { shouldUseDarkColors: false, on() {}, removeListener() {} },
      screen: { getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1200, height: 800 } }) },
    }))
    vi.doMock('../src/main/float', () => ({ floatingType: () => undefined, floatOverFullScreen: () => {} }))
    vi.stubEnv('YOGURT_BACKGROUND', '1')
    const { createPrompts } = await import('../src/main/prompts')
    const takeNotes = vi.fn(), dismissed = vi.fn()
    let mac = true
    const prompts = createPrompts({ windowVisible: () => true, takeNotes, stop: vi.fn(), dismissed, keepGoing: vi.fn(), open: vi.fn(), screen: () => mac })
    const p = { key: 'app:us.zoom.xos', app: 'Zoom', title: '', event: null, screen: { appId: 'us.zoom.xos', title: '', browser: false } }
    prompts.offer(p)
    expect(await handlers.get('prompt:state')!()).toMatchObject({ kind: 'start', screen: true })
    handlers.get('prompt:act')!({}, 'take-notes-screen')
    expect(takeNotes).toHaveBeenLastCalledWith(p, true)
    prompts.offer(p)
    handlers.get('prompt:act')!({}, 'take-notes')
    expect(takeNotes).toHaveBeenLastCalledWith(p, false)
    // off a Mac, or a call with no window to read: no offer, and asking for it anyway records sound only
    mac = false
    prompts.offer(p)
    expect(await handlers.get('prompt:state')!()).not.toHaveProperty('screen')
    handlers.get('prompt:act')!({}, 'take-notes-screen')
    expect(takeNotes).toHaveBeenLastCalledWith(p, false)
    vi.unstubAllEnvs(); vi.doUnmock('electron'); vi.doUnmock('../src/main/float')
  })
})
