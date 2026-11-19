import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { existsSync, mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const main = join(import.meta.dirname, '../out/main/index.js')
const zoom = { bundleId: 'us.zoom.xos', name: 'zoom.us' }
const SCREEN = '\u001fscreen'

async function launch() {
  const userData = mkdtempSync(join(tmpdir(), 'yogurt-live-screen-'))
  const app = await electron.launch({ args: [main], env: { ...process.env, YOGURT_FAKE: '1', YOGURT_USER_DATA: userData } })
  const page = await app.firstWindow()
  await expect(page.getByTestId('home')).toBeVisible()
  return { app, page, userData }
}
const fake = <T = unknown>(app: ElectronApplication, fn: string, arg?: unknown) =>
  app.evaluate((_e, [fn, arg]) => (globalThis as unknown as Record<string, Record<string, (a?: unknown) => unknown>>).__fake__[fn as string](arg), [fn, arg] as const) as Promise<T>
const card = async (app: ElectronApplication): Promise<Page> => {
  for (let i = 0; i < 100; i++) {
    const w = app.windows().find((p) => p.url().includes('#prompt'))
    if (w) return w
    await new Promise((r) => setTimeout(r, 50))
  }
  throw new Error('no prompt card')
}
const screenLines = (page: Page, id: string) =>
  page.evaluate(id => window.yogurt.transcript.get(id).then(lines => lines.filter(l => l.speaker === '\u001fscreen').map(l => l.text)), id)
const meetingId = async (app: ElectronApplication) => (await fake<{ route: string }>(app, 'main')).route.match(/note\/([^/?]+)/)![1]

test.skip(process.platform !== 'darwin', "a call's window is read on a Mac")

test("the card offers to read the call's screen; its lines arrive while it records, and its pictures follow What Yogurt keeps", async () => {
  const { app, page, userData } = await launch()
  try {
    await fake(app, 'signals', { micApps: [zoom], events: [] })
    const p = await card(app)
    const toggle = p.getByTestId('prompt-screen')
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await expect(toggle).toHaveAttribute('aria-label', "Also read the call's screen")
    await expect(p.getByTestId('prompt-take-notes')).toHaveText('Start recording')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await expect(p.getByTestId('prompt-take-notes')).toHaveText('Record with screen')
    // the card keeps its size with the extra button
    expect(await p.evaluate(() => ({ width: innerWidth, height: innerHeight }))).toEqual({ width: 381, height: 60 })
    await p.getByTestId('prompt-take-notes').click()
    await expect(page.getByTestId('note-state')).toHaveAttribute('data-state', 'recording')
    const id = await meetingId(app)
    await page.getByRole('tab', { name: 'Transcript', exact: true }).click()
    // shown as it is read, before the meeting ends
    await expect(page.getByTestId('transcript-turn').filter({ hasText: 'Q3 roadmap' }).getByTestId('transcript-who')).toHaveText('Screen')
    await expect.poll(() => screenLines(page, id)).toEqual(['Q3 roadmap\nLaunch on Tuesday', 'Budget 40,000 EUR\nOwner: Ann Lee'])
    const frames = join(userData, 'meetings', id, 'screen')
    expect(readdirSync(frames).filter(f => f.endsWith('.jpg'))).toHaveLength(2)
    await page.getByTestId('note-stop').click()
    await expect(page.getByTestId('note-state')).not.toHaveAttribute('data-state', 'recording')
    // Delete video after a week: the pictures go, the lines read from them stay
    await fake(app, 'endedDaysAgo', [id, 8])
    await page.evaluate(() => window.yogurt.settings.setRetention('video', 7))
    await expect.poll(() => existsSync(frames)).toBe(false)
    expect(await screenLines(page, id)).toHaveLength(2)
  } finally { await app.close() }
})

test("Start recording alone reads no screen; with Screen Recording off the note says so and the call is still recorded", async () => {
  const { app, page } = await launch()
  try {
    await fake(app, 'signals', { micApps: [zoom], events: [] })
    await (await card(app)).getByTestId('prompt-take-notes').click()
    await expect(page.getByTestId('note-state')).toHaveAttribute('data-state', 'recording')
    const plain = await meetingId(app)
    await page.waitForTimeout(1000)
    expect(await screenLines(page, plain)).toEqual([])
    await page.getByTestId('note-stop').click()
    await expect(page.getByTestId('note-state')).not.toHaveAttribute('data-state', 'recording')

    await fake(app, 'permission', ['screen', 'denied'])
    await fake(app, 'signals', { micApps: [zoom], events: [] })
    const p = await card(app)
    await p.getByTestId('prompt-screen').click()
    await p.getByTestId('prompt-take-notes').click()
    await expect(page.getByTestId('note-state')).toHaveAttribute('data-state', 'recording')
    const id = await meetingId(app)
    expect(id).not.toBe(plain)
    await expect(page.getByTestId('rec-hint')).toContainText("Yogurt can't read the call's screen. Allow screen recording in System Settings.")
    await expect(page.getByTestId('rec-hint-fix')).toHaveAttribute('data-kind', 'screen')
    await expect(page.getByTestId('note-state')).toHaveAttribute('data-state', 'recording')
    expect(await screenLines(page, id)).toEqual([])
  } finally { await app.close() }
})
