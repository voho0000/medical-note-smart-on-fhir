/**
 * Compares the document's quotations with the evidence indexes the packs run on.
 *
 * The document is written by hand and the app renders from the index, so the two
 * drift silently: a statement added to a module's entry appears in the app and
 * never reaches the PDF. That happened four times before this check existed,
 * each time caught by a human noticing one absent quote.
 *
 * It compares the *text* of each quotation rather than its label, because the
 * document merges statements a reader would otherwise see split ("Practice
 * Points 2.2.1–2.2.4" over one blockquote) and adds page numbers the index keeps
 * elsewhere. Text is what a reader checks the guideline against.
 *
 * Only KDIGO sources are compared: the document deliberately quotes KDIGO alone
 * so a reader needs one PDF open, and the Taiwan entries the packs also carry
 * are named in prose instead.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const HTML = resolve(HERE, 'ckd-flowcharts.html')

/**
 * The indexes, preferring the package sources next door over the copy installed
 * in node_modules. Authoring adds a statement to the source first, and checking
 * against the installed build would report the document behind until the next
 * release. Falling back keeps the check working from a worktree, where the
 * sibling checkout is not there.
 */
function evidenceIndexDir() {
  const override = process.env.CKD_EVIDENCE_INDEX_DIR
  const candidates = [
    ...(override ? [override] : []),
    resolve(HERE, '../../../mediprisma-personalization/packages/personalized-care/src/knowledge-packs/evidence-indexes'),
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  const require = createRequire(resolve(HERE, '../../package.json'))
  return resolve(
    dirname(require.resolve('@voho0000/personalized-care/package.json')),
    'dist/knowledge-packs/evidence-indexes',
  )
}

const INDEX_DIR = evidenceIndexDir()

/** Letters and digits only, so punctuation and spacing cannot cause a miss. */
function normalize(text) {
  return text
    // A bracketed provenance note ("[Data from Think Kidneys...]") records who
    // supplied a table, not the statement a reader checks against the PDF.
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .toLowerCase()
}

/**
 * The same, for markup. Tag stripping belongs on this side only: the index
 * stores plain guideline prose, and `eGFR <30 ml/min ... fall in GFR of >20%`
 * looks exactly like a tag to a regex, so running it there deletes half the
 * sentence and reports a mismatch that does not exist.
 */
function normalizeHtml(html) {
  return normalize(
    html
      .replace(/<[^>]+>/g, ' ')
      // Every entity here stands for punctuation or a symbol -- &ge;, &lt;,
      // &mdash; -- which normalize() drops anyway. Removing them whole stops
      // `&ge;` surviving as the letters "ge".
      .replace(/&[#a-zA-Z0-9]+;/g, ' '),
  )
}

function documentModules(html) {
  const modules = []
  const pattern = /<span class="mid">([a-z0-9-]+)<\/span>([\s\S]*?)(?=<span class="mid">|$)/g
  for (const match of html.matchAll(pattern)) {
    const [, id, body] = match
    const quotes = [...body.matchAll(/<blockquote>([\s\S]*?)<\/blockquote>/g)]
      .map((hit) => normalizeHtml(hit[1].replace(/<span class="lab">[\s\S]*?<\/span>/, '')))
    modules.push({ id, quotes })
  }
  return modules
}

function kdigoStatements() {
  const byModule = new Map()
  for (const file of readdirSync(INDEX_DIR).filter((name) => name.endsWith('.json'))) {
    const index = JSON.parse(readFileSync(resolve(INDEX_DIR, file), 'utf8'))
    if (!String(index.sourceId ?? '').startsWith('kdigo')) continue
    const entryById = new Map((index.entries ?? []).map((entry) => [entry.id, entry]))
    for (const [moduleId, entryIds] of Object.entries(index.modules ?? {})) {
      const statements = entryIds.flatMap((entryId) => (
        (entryById.get(entryId)?.citedStatements ?? []).map((statement) => ({
          label: statement.label.trim(),
          text: normalize(statement.text),
        }))
      ))
      byModule.set(moduleId, [...(byModule.get(moduleId) ?? []), ...statements])
    }
  }
  return byModule
}

const html = readFileSync(HTML, 'utf8')
const indexed = kdigoStatements()
const problems = []
let compared = 0

for (const { id, quotes } of documentModules(html)) {
  const expected = indexed.get(id)
  if (!expected || expected.length === 0) continue
  compared += 1
  const joined = quotes.join(' ')
  const missing = expected.filter((statement) => !joined.includes(statement.text))
  if (missing.length > 0) problems.push({ id, missing })
}

if (problems.length === 0) {
  console.log(`citations: all ${compared} module(s) quote every KDIGO statement their pack cites`)
  process.exit(0)
}

console.error(`\ncitations: ${problems.length} of ${compared} module(s) are missing a quotation the pack cites\n`)
for (const problem of problems) {
  console.error(`  ${problem.id}`)
  for (const statement of problem.missing) console.error(`    - ${statement.label}`)
}
console.error('')
process.exit(1)
