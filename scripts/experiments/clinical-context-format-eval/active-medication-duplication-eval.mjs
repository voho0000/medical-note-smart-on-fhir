// Single-variable experiment: should Visits repeat the full current-medication
// list when Patient's Medications already contains the authoritative list?
//
// Arms:
//   duplicated    — current production representation
//   single_source — removes only the top-level active list under Visits;
//                   visit chronology remains represented by the same marker
//
// Raw contexts and answers stay in the gitignored results/ directory.
// Live calls require --allow-external-clinical-data.

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.join(HERE, 'results')
const DEFAULT_MODEL = 'gemini-3.1-flash-lite'

const SYSTEM = [
  '你是臨床用藥資料閱讀助理。只能根據提供的 context 回答。',
  'record 數與不重複藥名數是不同概念；相同 record 若在不同 section 重複顯示，不可重複計數。',
  '藥局 dispensing 不等於另一個 prescriber。回答要簡短、具體，不提供治療指示。',
].join('\n')

const QUESTIONS = [
  {
    id: 'D1-current-record-count',
    text: '目前 Currently in use 共有幾筆 medication records？只回答一個數字。',
    facts: [[/\b18\b|十八/]],
  },
  {
    id: 'D2-unique-name-count',
    text: '這 18 筆 Currently in use records 共有幾個不同的藥名？同名的 THROUGH 只能算一個名稱。請回答數字並指出重複藥名。',
    facts: [
      [/\b17\b|十七/],
      [/THROUGH F\.C\. TABLETS|SENNOSIDES/i],
    ],
  },
  {
    id: 'D3-duplicate-semantics',
    text: '完全相同的 THROUGH F.C. TABLETS 藥名出現幾筆？這應算幾個不同藥名？',
    facts: [
      [/兩筆|2[^\d\n]{0,8}筆|two records/i],
      [/一個|1[^\d\n]{0,8}個|one (?:unique )?(?:name|drug)/i],
    ],
  },
  {
    id: 'D4-earliest-supply-end',
    text: 'Currently in use 中 supply_end 最早的是哪兩個藥名？請列出兩個完整清單藥名與日期。',
    facts: [
      [/IMIMINE S\.C\. TABLETS 25MG/i],
      [/Harnalidge OCAS prolonged release tablets 0\.4 mg/i],
      [/2026-07-15/],
    ],
  },
  {
    id: 'D5-eye-drops',
    text: '請列出 Currently in use 中供藥至 2026-07-28 的四個眼藥名稱，不可漏項。',
    facts: [
      [/PATEAR EYE LOTIONS/i],
      [/BRIMONIN OPHTHALMIC SOLUTION/i],
      [/XALATAN/i],
      [/COSOPT OPHTHALMIC SOLUTION/i],
    ],
  },
  {
    id: 'D6-gi-medications',
    text: '目前清單中 reason(billing)=K317 的五個不同胃腸用藥名稱是哪些？不可漏項。',
    facts: [
      [/KASCOAL TABLETS/i],
      [/THROUGH F\.C\. TABLETS/i],
      [/NIDOLIUM TABLETS/i],
      [/VOKER FILM COATED TABLETS/i],
      [/Mosapin F\.C\. Tablet/i],
    ],
  },
  {
    id: 'D7-drug-recognition-control',
    text: 'Currently in use 中哪個藥是 dapagliflozin／SGLT2 inhibitor？請回答清單藥名與類別。',
    facts: [
      [/Forxiga Film-coated Tablets 10mg/i],
      [/dapagliflozin|SGLT\s*2/i],
    ],
  },
]

function arg(flag, fallback) {
  const index = process.argv.indexOf(flag)
  return index >= 0 ? process.argv[index + 1] : fallback
}

function loadEnvLocal() {
  const filename = path.join(process.cwd(), '.env.local')
  if (!fs.existsSync(filename)) return
  for (const line of fs.readFileSync(filename, 'utf8').split('\n')) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (match && !(match[1] in process.env)) process.env[match[1]] = match[2].trim()
  }
}

function buildVisitActiveBlock(input) {
  const lines = input.split('\n')
  const start = lines.findIndex((line) => /^- Currently in use \(\d+\):/.test(line))
  let count
  let rows
  if (start >= 0) {
    const end = lines.findIndex((line, index) => index > start && /^- Recently ended /.test(line))
    if (end < 0) throw new Error('Input lacks a complete Currently in use block')
    count = lines[start].match(/\((\d+)\)/)?.[1]
    rows = lines.slice(start + 1, end)
      .filter((line) => /^-\s+•\s+/.test(line))
      .map((line) => line
        .replace(/^-\s+•\s+/, '- • ')
        .replace(/ \(給藥總量.*\) — until /, ' — until ')
        .replace(/ \[(?:開立 by|藥局領藥).*\]$/, ''))
  } else {
    count = lines.find((line) => line.startsWith('record_count_in_current_supply_window:'))
      ?.split(':')[1]?.trim()
    rows = lines
      .filter((line) => /^- \[M\d+\] /.test(line))
      .map((line) => {
        const fields = line.split(' | ')
        const name = fields[0].replace(/^- \[M\d+\] /, '')
        const status = fields.find((field) => field.startsWith('status='))?.slice('status='.length) || 'unknown'
        const supplyEnd = fields.find((field) => field.startsWith('supply_end='))?.slice('supply_end='.length) || 'unknown'
        return `- • ${name} — until ${supplyEnd} [status: ${status}]`
      })
  }
  if (!count) throw new Error('Input lacks a current medication record count')
  if (rows.length !== Number(count)) {
    throw new Error(`Expected ${count} current rows, parsed ${rows.length}`)
  }
  return [`- Currently active medication records (${count}; may include duplicate medications):`, ...rows].join('\n')
}

function buildArms(input) {
  const chronology = '- Recent visit chronology is unchanged; visit-linked medication rows remain under their individual visits.'
  const visitActive = buildVisitActiveBlock(input)
  return {
    // Match production section order: Visits precedes the later authoritative
    // Patient's Medications section. This avoids giving the duplicated arm an
    // artificial recency advantage by appending its repeated rows last.
    duplicated: `Visits & Treatment History:\n${visitActive}\n${chronology}\n\n${input.trim()}\n`,
    single_source: `Visits & Treatment History:\n${chronology}\n\n${input.trim()}\n`,
  }
}

function estimateTokens(text) {
  const ascii = (text.match(/[\x00-\x7F]/g) ?? []).length
  return Math.ceil(ascii / 4 + (text.length - ascii) / 1.5)
}

function hash(text) {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 12)
}

function grade(question, answer) {
  const hits = question.facts.map((alternatives) => alternatives.some((pattern) => pattern.test(answer)))
  const hitCount = hits.filter(Boolean).length
  const ratio = hitCount / hits.length
  return {
    correctness: ratio === 1 ? 2 : ratio >= 0.5 ? 1 : 0,
    complete: ratio === 1,
    factHits: hitCount,
    factTotal: hits.length,
  }
}

function summarize(rows, arms) {
  const lines = [
    '| arm | n | score | complete | approx context tokens |',
    '|---|---:|---:|---:|---:|',
  ]
  for (const [arm, context] of Object.entries(arms)) {
    const selected = rows.filter((row) => row.arm === arm && row.verdict)
    const score = selected.reduce((sum, row) => sum + row.verdict.correctness, 0)
    const complete = selected.filter((row) => row.verdict.complete).length
    lines.push(`| ${arm} | ${selected.length} | ${score}/${selected.length * 2} | ${complete}/${selected.length} | ${estimateTokens(context)} |`)
  }
  lines.push('', '## By question', '', '| question | duplicated score / complete | single_source score / complete |', '|---|---:|---:|')
  for (const question of QUESTIONS) {
    const cell = (arm) => {
      const selected = rows.filter((row) => row.arm === arm && row.questionId === question.id && row.verdict)
      const score = selected.reduce((sum, row) => sum + row.verdict.correctness, 0)
      const complete = selected.filter((row) => row.verdict.complete).length
      return `${score}/${selected.length * 2} · ${complete}/${selected.length}`
    }
    lines.push(`| ${question.id} | ${cell('duplicated')} | ${cell('single_source')} |`)
  }
  return `${lines.join('\n')}\n`
}

let authToken
async function getAnonToken() {
  if (authToken) return authToken
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY
  if (!apiKey) throw new Error('缺 NEXT_PUBLIC_FIREBASE_API_KEY (.env.local)')
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ returnSecureToken: true }),
  })
  if (!response.ok) throw new Error(`anonymous sign-up ${response.status}: ${(await response.text()).slice(0, 200)}`)
  authToken = (await response.json()).idToken
  return authToken
}

async function callModel(model, context, question) {
  const url = process.env.NEXT_PUBLIC_GEMINI_URL
  if (!url) throw new Error('缺 NEXT_PUBLIC_GEMINI_URL')
  const headers = {
    'content-type': 'application/json',
    authorization: `Bearer ${await getAnonToken()}`,
  }
  if (process.env.NEXT_PUBLIC_PROXY_KEY) headers['x-proxy-key'] = process.env.NEXT_PUBLIC_PROXY_KEY
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      stream: false,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `以下是病人的用藥 context：\n\n${context}\n---\n問題：${question.text}` },
      ],
    }),
  })
  if (!response.ok) throw new Error(`gemini proxy ${response.status}: ${(await response.text()).slice(0, 300)}`)
  const json = await response.json()
  return json.message ?? (json.candidates?.[0]?.content?.parts ?? []).map((part) => part.text ?? '').join('')
}

async function withRetry(operation, attempts = 4) {
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** (attempt - 1)))
    }
  }
  throw lastError
}

async function runPool(tasks, concurrency, worker) {
  const results = new Array(tasks.length)
  let next = 0
  async function consume() {
    while (true) {
      const index = next++
      if (index >= tasks.length) return
      results[index] = await worker(tasks[index])
    }
  }
  await Promise.all(Array.from({ length: concurrency }, consume))
  return results
}

async function main() {
  const inputFile = arg('--input')
  const repetitions = Number(arg('--repetitions', '3'))
  const concurrency = Number(arg('--concurrency', '2'))
  const model = arg('--model', DEFAULT_MODEL)
  const regradeFile = arg('--regrade')
  const dryRun = process.argv.includes('--dry-run')
  const allowExternal = process.argv.includes('--allow-external-clinical-data')
  if (!inputFile) throw new Error('Usage: --input /absolute/path/to/context.txt')

  const arms = buildArms(fs.readFileSync(inputFile, 'utf8'))
  fs.mkdirSync(OUT_DIR, { recursive: true })
  for (const [arm, context] of Object.entries(arms)) {
    fs.writeFileSync(path.join(OUT_DIR, `active-medication-duplication-${arm}.md`), context)
    console.log(`${arm}: chars=${context.length}; approxTokens=${estimateTokens(context)}; hash=${hash(context)}`)
  }
  if (dryRun) {
    console.log('[dry-run] contexts written; no API called')
    return
  }
  if (regradeFile) {
    const rows = fs.readFileSync(regradeFile, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .map((row) => {
        if (!row.answer) return row
        const question = QUESTIONS.find((candidate) => candidate.id === row.questionId)
        if (!question) throw new Error(`Unknown question in regrade input: ${row.questionId}`)
        return { ...row, verdict: grade(question, row.answer) }
      })
    const report = regradeFile.replace(/\.jsonl$/, '.regraded.md')
    const summary = summarize(rows, arms)
    fs.writeFileSync(report, summary)
    console.log(`\n${summary}\nregraded=${report}`)
    return
  }
  if (!allowExternal) throw new Error('拒絕外傳：需加 --allow-external-clinical-data')
  loadEnvLocal()

  const tasks = []
  for (let repetition = 1; repetition <= repetitions; repetition++) {
    for (let questionIndex = 0; questionIndex < QUESTIONS.length; questionIndex++) {
      const armOrder = (repetition + questionIndex) % 2 === 0
        ? ['duplicated', 'single_source']
        : ['single_source', 'duplicated']
      for (const arm of armOrder) tasks.push({ repetition, questionIndex, arm })
    }
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const output = path.join(OUT_DIR, `active-medication-duplication-${timestamp}.jsonl`)
  const rows = await runPool(tasks, concurrency, async (task) => {
    const question = QUESTIONS[task.questionIndex]
    try {
      const answer = await withRetry(() => callModel(model, arms[task.arm], question))
      const row = { ...task, questionId: question.id, model, answer, verdict: grade(question, answer) }
      fs.appendFileSync(output, `${JSON.stringify(row)}\n`)
      console.log(`rep=${task.repetition} ${task.arm} ${question.id}: score=${row.verdict.correctness} facts=${row.verdict.factHits}/${row.verdict.factTotal}`)
      return row
    } catch (error) {
      const row = { ...task, questionId: question.id, model, error: String(error) }
      fs.appendFileSync(output, `${JSON.stringify(row)}\n`)
      console.log(`rep=${task.repetition} ${task.arm} ${question.id}: ERROR`)
      return row
    }
  })
  const report = output.replace(/\.jsonl$/, '.md')
  const summary = summarize(rows, arms)
  fs.writeFileSync(report, summary)
  console.log(`\n${summary}\nresults=${output}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
