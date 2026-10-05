// Renders public/icon.svg to the PNG sizes the PWA manifest needs. Run once: node scripts/make-icons.mjs
import { chromium } from '@playwright/test'
import { readFileSync, existsSync } from 'node:fs'

const svg = readFileSync(new URL('../public/icon.svg', import.meta.url), 'utf8')
const candidates = [process.env.PW_CHROMIUM, '/opt/pw-browsers/chromium/chrome-linux/chrome', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].filter(Boolean)
const executablePath = candidates.find((p) => existsSync(p))
const browser = await chromium.launch({ executablePath })
const page = await browser.newPage()
for (const [size, name] of [[192, 'icon-192.png'], [512, 'icon-512.png'], [180, 'apple-touch-icon.png']]) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(`<body style="margin:0;background:#1C1C1A">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body>`)
  await page.screenshot({ path: new URL(`../public/${name}`, import.meta.url).pathname, clip: { x: 0, y: 0, width: size, height: size } })
}
await browser.close()
console.log('icons written')
