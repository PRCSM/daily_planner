import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { readFileSync } from 'node:fs'

/**
 * The five flows that matter, against the PRODUCTION build (service worker, precache, real IndexedDB).
 * The clock is frozen inside the plan (Tue 4 Aug 2026, week 4) so tests never depend on the day they run, and the
 * timezone is IST so a UTC-derived date bug would show up here.
 */
const NOW = new Date('2026-08-04T10:00:00+05:30')

test.use({ timezoneId: 'Asia/Kolkata', locale: 'en-IN', serviceWorkers: 'allow' })

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: NOW })
  await page.addInitScript(() => localStorage.setItem('cadence.theme', 'dark'))
})

async function boot(page: Page, path = '/') {
  await page.goto(path)
  await expect(page.locator('h1').first()).toBeVisible()
}

/** Wait until the service worker has installed AND precached the app shell. */
async function swReady(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
    const keys = await caches.keys()
    if (!keys.length) throw new Error('no precache yet')
  })
}

test('1 · log a day in under 30 seconds: topic + Enter, twice, then the day shows what was logged', async ({ page }) => {
  await boot(page)
  await expect(page.getByText('Week 4 · Get presentable')).toBeVisible()
  await page.getByTestId('open-log').click()
  const sheet = page.getByTestId('log-sheet')
  await expect(sheet).toHaveAttribute('data-open', 'true')

  const topic = sheet.getByRole('textbox', { name: 'Topic' })
  await topic.fill('two pointers')
  await topic.press('Enter')
  await expect(sheet.getByTestId('logged-block')).toHaveCount(1)
  await expect(topic).toBeFocused() // ready for the next block
  await sheet.getByRole('button', { name: 'Core CS' }).click()
  await sheet.getByRole('button', { name: '90m' }).click()
  await topic.fill('B+ trees')
  await topic.press('Enter')
  await expect(sheet.getByTestId('logged-block')).toHaveCount(2)

  await sheet.getByLabel('Shipped').fill('the log sheet')
  await sheet.getByRole('button', { name: 'Close' }).click()
  await expect(page.getByTestId('open-log')).toContainText('2h 30m logged')
  await expect(page.getByTestId('week-strip').getByLabel('logged')).toHaveCount(1)

  // the log is for LOCAL 4 Aug (IST), not the UTC date
  await page.getByTestId('open-log').click()
  await expect(page.getByTestId('log-date')).toContainText('Tue 4 Aug')
})

test('2 · tick a block: it persists across a reload, and only that day is marked', async ({ page }) => {
  await boot(page)
  const deepA = page.getByRole('checkbox', { name: /Done: Deep A/ })
  await expect(deepA).toHaveAttribute('aria-checked', 'false')
  await deepA.click()
  await expect(deepA).toHaveAttribute('aria-checked', 'true')
  await page.reload()
  await expect(page.getByRole('checkbox', { name: /Done: Deep A/ })).toHaveAttribute('aria-checked', 'true')
  await page.getByRole('button', { name: 'Wednesday 5 August' }).click()
  await expect(page.getByRole('checkbox', { name: /Done: Deep A/ })).toHaveAttribute('aria-checked', 'false')
})

test('3 · apply: save an application, mark it applied, and walk the legal states only', async ({ page }) => {
  await boot(page)
  await page.getByTestId('fab').click()
  await page.getByRole('menuitem', { name: 'Save application' }).click()
  const sheet = page.getByTestId('application-sheet')
  await expect(sheet).toHaveAttribute('data-open', 'true')
  await sheet.getByLabel('Company').fill('Acme')
  await sheet.getByLabel('Role').fill('SDE-1')
  await sheet.getByRole('button', { name: 'Yes — I applied' }).click()
  await sheet.getByRole('button', { name: 'Add application' }).click()
  await expect(sheet).toHaveAttribute('data-open', 'false') // the sheet closes only AFTER the (atomic) write has committed

  await page.goto('/applications')
  await expect(page.getByTestId('census-APPLIED')).toHaveText('1')
  await expect(page.getByTestId('census-REJECTED')).toHaveText('0') // zeros are shown
  const card = page.getByTestId('application-card').filter({ hasText: 'Acme' })
  await expect(card.getByText('follow up in 7d')).toBeVisible()
  // From APPLIED you can reach OA / INTERVIEW / REJECTED / GHOSTED — never OFFER or SAVED.
  await expect(card.getByTestId('advance-OFFER')).toHaveCount(0)
  await expect(card.getByTestId('advance-SAVED')).toHaveCount(0)
  await card.getByTestId('advance-INTERVIEW').click()
  await expect(page.getByTestId('census-INTERVIEW')).toHaveText('1')
  await expect(card.getByTestId('advance-OFFER')).toBeVisible() // now legal
  await expect(card.getByTestId('advance-APPLIED')).toHaveCount(0) // and no way back
})

test('4 · offline: after the first load, a hard reload with NO network still shows the app and its data — and you can keep logging', async ({ page, context }) => {
  await boot(page)
  await swReady(page)
  await page.getByTestId('open-log').click()
  await page.getByTestId('log-sheet').getByRole('textbox', { name: 'Topic' }).fill('graphs before going offline')
  await page.getByTestId('log-sheet').getByRole('textbox', { name: 'Topic' }).press('Enter')
  await expect(page.getByTestId('logged-block')).toHaveCount(1)
  await page.getByTestId('log-sheet').getByRole('button', { name: 'Close' }).click()

  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'today' })).toBeVisible()
  await expect(page.getByText('Week 4 · Get presentable')).toBeVisible()
  await expect(page.getByText('Deep A — DSA')).toBeVisible()

  // every route chunk was precached, so navigating works too
  await page.getByRole('link', { name: 'Calendar' }).click()
  await expect(page.getByRole('heading', { name: 'calendar' })).toBeVisible()
  await page.getByRole('link', { name: 'Learn' }).click()
  await expect(page.getByTestId('quote')).toBeVisible()

  // full read/write offline
  await page.getByRole('link', { name: 'Today' }).click()
  await page.getByTestId('open-log').click()
  await expect(page.getByTestId('logged-block')).toHaveCount(1) // data from before is there
  await page.getByTestId('log-sheet').getByRole('textbox', { name: 'Topic' }).fill('written while offline')
  await page.getByTestId('log-sheet').getByRole('textbox', { name: 'Topic' }).press('Enter')
  await expect(page.getByTestId('logged-block')).toHaveCount(2)

  // chat is the only thing that needs a connection, and it says so
  await context.setOffline(false)
})

test('4b · the app is installable (manifest + service worker + icons pass the browser’s own check)', async ({ page, context }) => {
  await boot(page)
  await swReady(page)
  const cdp = await context.newCDPSession(page)
  await cdp.send('Page.enable')
  const { installabilityErrors } = (await cdp.send('Page.getInstallabilityErrors')) as { installabilityErrors: { errorId: string }[] }
  // Playwright runs in a throwaway (incognito-like) profile; that is the one error that says nothing about the app.
  expect(installabilityErrors.map((e) => e.errorId).filter((id) => id !== 'in-incognito')).toEqual([])
  const manifest = (await page.evaluate(async () => (await fetch('/manifest.webmanifest')).json())) as { name: string; display: string; start_url: string; icons: { sizes: string }[] }
  expect(manifest).toMatchObject({ name: 'Cadence', display: 'standalone', start_url: '/' })
  expect(manifest.icons.some((i) => i.sizes === '512x512')).toBe(true)
})

test('5 · export → erase → import restores everything', async ({ page }) => {
  await boot(page)
  await page.getByTestId('open-log').click()
  const sheet = page.getByTestId('log-sheet')
  await sheet.getByRole('textbox', { name: 'Topic' }).fill('round-trip topic')
  await sheet.getByRole('textbox', { name: 'Topic' }).press('Enter')
  await expect(sheet.getByTestId('logged-block')).toHaveCount(1)
  await sheet.getByLabel('Problem title').fill('Two Sum')
  await sheet.getByLabel('Problem title').press('Enter')
  await sheet.getByRole('button', { name: 'Close' }).click()

  await page.goto('/settings')
  await page.getByRole('button', { name: 'Export backup' }).click()
  const warning = page.getByTestId('export-warning')
  await expect(warning).toContainText('full history')
  const [download] = await Promise.all([page.waitForEvent('download'), warning.getByRole('button', { name: 'Save the file' }).click()])
  expect(download.suggestedFilename()).toBe('cadence-backup-2026-08-04.json')
  const path = await download.path()
  const file = JSON.parse(readFileSync(path, 'utf8'))
  expect(file).toMatchObject({ app: 'cadence', formatVersion: 1 })
  expect(JSON.stringify(file)).not.toMatch(/gsk_|eyJ[A-Za-z0-9_-]{10,}\./) // no key-shaped string

  // erase everything local, then restore from the file
  await page.getByLabel('Type ERASE to confirm').fill('ERASE')
  await page.getByRole('button', { name: 'Erase local data' }).click()
  await expect(page.getByRole('heading', { name: 'today' })).toBeVisible()
  await expect(page.getByTestId('open-log')).not.toContainText('logged')

  await page.goto('/settings')
  await page.getByLabel('Choose a backup file').setInputFiles(path)
  const preview = page.getByTestId('import-preview')
  await expect(preview).toContainText('logBlocks')
  await expect(preview).toContainText('+1 new')
  await preview.getByRole('button', { name: /^Import \d+ changes?$/ }).click()
  await expect(page.getByRole('status').filter({ hasText: /Imported/ })).toBeVisible()

  await page.goto('/')
  await expect(page.getByTestId('open-log')).toContainText('1h logged')
  await page.getByTestId('open-log').click()
  await expect(page.getByTestId('logged-block')).toContainText('round-trip topic')
  await expect(page.getByLabel('Problems logged today')).toContainText('Two Sum')
})

test.describe('accessibility (axe) — no serious or critical violations on any screen', () => {
  const screens = ['/', '/learn', '/planner', '/calendar', '/more', '/plan', '/opportunities', '/applications', '/progress', '/progress/dsa', '/notes', '/timetable', '/settings']
  for (const path of screens) {
    test(path, async ({ page }) => {
      await boot(page, path)
      await page.waitForTimeout(400)
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
      const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
      expect(bad.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([])
    })
  }
})

test.describe('accessibility (axe) — LIGHT theme', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('cadence.theme', 'light'))
  })
  for (const path of ['/', '/plan', '/calendar', '/opportunities', '/applications', '/progress', '/settings']) {
    test(path, async ({ page }) => {
      await boot(page, path)
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
      await page.waitForTimeout(400)
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
      const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
      expect(bad.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([])
    })
  }
})
