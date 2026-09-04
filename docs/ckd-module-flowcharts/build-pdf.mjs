/**
 * Lays the flowchart document out one module per page and prints the PDF.
 *
 * CSS cannot measure, so page breaks cannot be written by hand: a module that
 * grows by two lines silently starts spilling, and the next module inherits a
 * half-empty sheet. This lays every top-level block out once under print media
 * at the exact content box, packs consecutive blocks into pages greedily, then
 * writes the breaks back into the document as a class before printing.
 *
 * Re-run after any content change — the grouping is only correct for the
 * heights it was computed from.
 *
 *   node docs/ckd-module-flowcharts/build-pdf.mjs
 */

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const APP_ROOT = resolve(HERE, '../..')
const HTML = resolve(HERE, 'ckd-flowcharts.html')
const PACK_SOURCE = resolve(
  APP_ROOT,
  '../mediprisma-personalization/packages/personalized-care/src/guideline-packs/ckd-pack.ts',
)

// Playwright is a devDependency of the app, not of this document.
const { chromium } = createRequire(resolve(APP_ROOT, 'package.json'))('playwright')

// The document quotes the guideline by hand while the app renders from the
// evidence index, so the two drift silently and a reader comparing them finds
// the PDF short. Refuse to print a document that has fallen behind.
execFileSync(process.execPath, [resolve(HERE, 'check-citations.mjs')], { stdio: 'inherit' })

// The pack's own declared version, so the filename can never claim a version
// the rules were not built from.
const packVersion = readFileSync(PACK_SOURCE, 'utf8')
  .match(/id: 'ckd-cdss',[\s\S]{0,200}?version: '([^']+)'/)?.[1]
if (!packVersion) throw new Error(`Could not read the pack version from ${PACK_SOURCE}`)
const PDF = resolve(HERE, `CKD模組決策流程_v${packVersion}.pdf`)

// A4 with 10 mm margins, in CSS px at 96 dpi.
const MARGIN_MM = 10
const MM_PER_INCH = 25.4
const DPI = 96
const mmToPx = (mm) => (mm / MM_PER_INCH) * DPI
const CONTENT_WIDTH = Math.floor(mmToPx(210 - MARGIN_MM * 2))
const CONTENT_HEIGHT = Math.floor(mmToPx(297 - MARGIN_MM * 2))

const browser = await chromium.launch()
const page = await browser.newPage({
  viewport: { width: CONTENT_WIDTH, height: CONTENT_HEIGHT },
})
await page.goto(`file://${HTML}`)
await page.emulateMedia({ media: 'print' })

// Measure with every break removed, so a block's height is its own and not the
// consequence of where a previous run happened to put it.
const blocks = await page.evaluate(() => {
  const wrap = document.querySelector('.wrap')
  const children = [...wrap.children]
  for (const child of children) child.classList.remove('pb')
  return children.map((child, index) => {
    const style = getComputedStyle(child)
    const rect = child.getBoundingClientRect()
    return {
      index,
      hidden: style.display === 'none' || rect.height === 0,
      height: Math.round(rect.height),
      id: child.id || child.className.split(' ')[0],
      label: (child.querySelector('h1, h2, h3')?.textContent ?? '').trim().slice(0, 24),
    }
  })
})

const visible = blocks.filter((block) => !block.hidden)
const pages = []
let current = []
let used = 0
for (const block of visible) {
  // A block taller than the sheet gets its own page and spills; nothing can be
  // packed after it without leaving a gap.
  const startsPage = current.length === 0
  if (!startsPage && used + block.height > CONTENT_HEIGHT) {
    pages.push(current)
    current = []
    used = 0
  }
  current.push(block)
  used += block.height
  if (block.height > CONTENT_HEIGHT) {
    pages.push(current)
    current = []
    used = 0
  }
}
if (current.length > 0) pages.push(current)

for (const [number, group] of pages.entries()) {
  const line = group
    .map((block) => `${block.id} ${block.label} (${block.height})`)
    .join('  +  ')
  const spills = group.some((block) => block.height > CONTENT_HEIGHT) ? '  <- spills' : ''
  console.log(`p${String(number + 1).padStart(2)}  ${line}${spills}`)
}

// Write the breaks back: the first block of every page but the first carries
// `pb`, and nothing else does.
const starts = new Set(pages.slice(1).map((group) => group[0].index))
const html = readFileSync(HTML, 'utf8')
const updated = await page.evaluate((indices) => {
  const wrap = document.querySelector('.wrap')
  const children = [...wrap.children]
  children.forEach((child, index) => {
    child.classList.toggle('pb', indices.includes(index))
  })
  return wrap.outerHTML
}, [...starts])

const wrapStart = html.indexOf('<div class="wrap"')
const wrapEnd = html.lastIndexOf('</div>') + '</div>'.length
writeFileSync(HTML, html.slice(0, wrapStart) + updated + html.slice(wrapEnd))

await page.goto(`file://${HTML}`)
await page.emulateMedia({ media: 'print' })
await page.pdf({
  path: PDF,
  format: 'A4',
  printBackground: true,
  margin: {
    top: `${MARGIN_MM}mm`,
    right: `${MARGIN_MM}mm`,
    bottom: `${MARGIN_MM}mm`,
    left: `${MARGIN_MM}mm`,
  },
})
await browser.close()

console.log(`\ncontent box ${CONTENT_WIDTH}x${CONTENT_HEIGHT}px · ${pages.length} laid-out pages`)
console.log(PDF)
