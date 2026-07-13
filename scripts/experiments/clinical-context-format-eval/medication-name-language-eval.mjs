// Single-variable medication-name language experiment.
//
// Builds two otherwise byte-equivalent medication snapshots from the public
// synthetic demo bundle:
//   zh_name — MedicationCodeableConcept.text (current zh-TW patient context)
//   en_name — MedicationCodeableConcept.coding[0].display
//
// Dose, status, record order, dates, billing reasons and prompts are identical.
// Raw contexts/answers are written only to the gitignored results/ directory.
// Live calls require the explicit --allow-external-clinical-data flag.
//
// Usage:
//   node medication-name-language-eval.mjs --dry-run
//   node medication-name-language-eval.mjs --repetitions 3 --concurrency 2 \
//     --allow-external-clinical-data

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.join(HERE, 'results')
const DEFAULT_BUNDLE = path.join(process.cwd(), 'public/demo/demo-bundle.json')
const DEFAULT_MODEL = 'gemini-3.1-flash-lite'
const DEFAULT_AS_OF = '2026-07-12'

const SYSTEM = [
  '你是臨床藥物資料閱讀助理。只能把清單中實際存在的 medication record 當成病人用藥。',
  '你可以使用一般藥理知識辨識商品名、學名與藥物類別，但不可捏造清單中不存在的藥。',
  'reason 欄是申報/開藥紀錄，不等於已確認的適應症。重複 record 不等於不同藥品。',
  '回答問題要求的藥名時，必須同時引用 [Mxx] handle；不確定時明確說不確定。',
  '回答簡短、具體，不要提供治療指示。',
].join('\n')

const QUESTIONS = [
  {
    id: 'M1-alpha-blocker',
    text: '清單中哪一筆是 α1-blocker／tamsulosin 類藥物？請列出 handle、清單藥名、學名或類別。',
    facts: [
      [/\[M\d+\]/],
      [/Harnalidge|活路利淨/i],
      [/tamsulosin|α\s*1|alpha\s*-?1|alpha blocker/i],
    ],
  },
  {
    id: 'M2-sglt2',
    text: '哪一筆是 SGLT2 inhibitor（dapagliflozin）？請列出 handle、清單藥名與學名/類別。',
    facts: [
      [/\[M\d+\]/],
      [/Forxiga|福適佳/i],
      [/dapagliflozin|SGLT\s*2/i],
    ],
  },
  {
    id: 'M3-thyroid',
    text: '哪一筆是甲狀腺素補充藥？請列出 handle、清單藥名與學名。',
    facts: [
      [/\[M\d+\]/],
      [/Eltroxin|昂特欣/i],
      [/levothyroxine|thyroxine|甲狀腺素/i],
    ],
  },
  {
    id: 'M4-gout',
    text: '哪一筆是 febuxostat／xanthine oxidase inhibitor？請列出 handle、清單藥名與藥理類別。',
    facts: [
      [/\[M\d+\]/],
      [/Feburic|福避痛/i],
      [/febuxostat|xanthine oxidase|黃嘌呤氧化酶/i],
    ],
  },
  {
    id: 'M5-gi-map',
    text: '請把下列五類各配對到清單中的 record（handle + 清單藥名）：simethicone、sennosides、domperidone、famotidine、mosapride。不可漏項。',
    facts: [
      [/KASCOAL|加斯克兒/i], [/simethicone|dimethylpolysiloxane|聚二甲矽烷/i],
      [/THROUGH|便通樂/i], [/sennosides?|番瀉/i],
      [/NIDOLIUM|吐寧/i], [/domperidone|多普利杜/i],
      [/VOKER|非潰/i], [/famotidine|啡莫替定/i],
      [/Mosapin|順胃暢/i], [/mosapride/i],
      [/(?:\[M\d+\][^\n]*){5}|\[M\d+\][\s\S]*\[M\d+\][\s\S]*\[M\d+\][\s\S]*\[M\d+\][\s\S]*\[M\d+\]/],
    ],
  },
  {
    id: 'M6-geriatric-cns',
    text: '從清單找出 imipramine/TCA 與 clonazepam/benzodiazepine 兩筆，列出各自 handle 與清單藥名，並只說明一個高齡者共同要留意的風險。',
    facts: [
      [/IMIMINE|益伊神/i], [/imipramine|tricyclic|TCA|三環/i],
      [/RIVOTRIL|利福全/i], [/clonazepam|benzodiazepine|BZD|苯二氮/i],
      [/跌倒|嗜睡|鎮靜|意識|姿勢性低血壓|fall|sedat|drows|orthostatic/i],
      [/\[M\d+\][\s\S]*\[M\d+\]/],
    ],
  },
  {
    id: 'M7-glaucoma-drops',
    text: '清單中 Brimonin、Xalatan、Cosopt 對應哪些 record？請逐筆列出 handle、清單藥名，並寫出可辨識的學名或藥物類別。',
    facts: [
      [/BRIMONIN|必目寧/i], [/brimonidine|alpha.*agonist|α.*致效/i],
      [/XALATAN|舒而坦/i], [/latanoprost|prostaglandin|前列腺素/i],
      [/COSOPT|康舒目/i], [/(dorzolamide|carbonic anhydrase|碳酸酐酶)[\s\S]*(timolol|beta.*block|β.*阻斷)|(?:timolol|beta.*block|β.*阻斷)[\s\S]*(?:dorzolamide|carbonic anhydrase|碳酸酐酶)/i],
      [/\[M\d+\][\s\S]*\[M\d+\][\s\S]*\[M\d+\]/],
    ],
  },
  {
    id: 'M8-duplicate-control',
    text: '目前供藥窗內有哪個完全相同藥名出現兩筆？請列出兩個 handles，並說明這是兩筆 record，不能直接算成兩種不同藥。',
    facts: [
      [/THROUGH|便通樂/i],
      [/兩筆|2\s*(?:筆|records?)|two records|(?:這|此|以上)?兩者[^。\n]*(?:紀錄|records?)/i],
      [/重複|相同|duplicate|same drug/i],
      [/\[M\d+\][\s\S]*\[M\d+\]/],
      [/不能.*兩種|不是.*兩種|不等於.*兩種|not.*two.*drugs/i],
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

function durationDays(duration) {
  const value = Number(duration?.value)
  if (!Number.isFinite(value) || value <= 0) return undefined
  const unit = String(duration?.unit || duration?.code || '').toLowerCase()
  const factor = unit.startsWith('w') ? 7 : unit.startsWith('mo') ? 30 : unit.startsWith('y') ? 365 : 1
  return Math.round(value * factor)
}

function supplyEnd(record) {
  const days = durationDays(record.dispenseRequest?.expectedSupplyDuration)
  if (!record.authoredOn || !days) return undefined
  const date = new Date(record.authoredOn)
  if (Number.isNaN(date.getTime())) return undefined
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

function isCurrentSupplyRecord(record, asOf) {
  if (!['active', 'completed'].includes(String(record.status || '').toLowerCase())) return false
  const end = supplyEnd(record)
  return record.status === 'active' && !end ? true : !!end && end >= asOf
}

function bundleResources(bundle, resourceType) {
  return (bundle.entry ?? []).map((entry) => entry.resource).filter((resource) => resource?.resourceType === resourceType)
}

function medicationName(record, arm) {
  const concept = record.medicationCodeableConcept ?? {}
  if (arm === 'en_name') return concept.coding?.find((coding) => coding.display?.trim())?.display?.trim() || concept.text || 'Unknown medication'
  return concept.text?.trim() || concept.coding?.find((coding) => coding.display?.trim())?.display?.trim() || 'Unknown medication'
}

function buildSnapshot(records, arm, asOf) {
  const lines = [
    '# Medication record snapshot',
    `as_of: ${asOf}`,
    `record_count_in_current_supply_window: ${records.length}`,
    'count_semantics: records, not unique drugs',
    'reason_semantics: billing/prescribing record, not a confirmed indication',
    '',
  ]
  records.forEach((record, index) => {
    const handle = `M${String(index + 1).padStart(2, '0')}`
    const reason = record.reasonCode?.[0]?.text || record.reasonCode?.[0]?.coding?.[0]?.display || 'not recorded'
    const sig = record.dosageInstruction?.[0]?.text || 'not recorded'
    lines.push(
      `- [${handle}] ${medicationName(record, arm)} | status=${record.status || 'unknown'} | authored=${String(record.authoredOn || 'unknown').slice(0, 10)} | supply_end=${supplyEnd(record) || 'unknown'} | sig=${sig} | reason(billing)=${reason}`,
    )
  })
  return `${lines.join('\n')}\n`
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
  const forbidden = (question.forbid ?? []).filter((pattern) => pattern.test(answer)).length
  const ratio = hitCount / hits.length
  return {
    correctness: forbidden === 0 && ratio === 1 ? 2 : ratio >= 0.5 ? 1 : 0,
    complete: forbidden === 0 && ratio === 1,
    factHits: hitCount,
    factTotal: hits.length,
    forbidden,
  }
}

function wilson(successes, total) {
  if (!total) return [0, 0]
  const z = 1.96
  const p = successes / total
  const denominator = 1 + z ** 2 / total
  const center = (p + z ** 2 / (2 * total)) / denominator
  const margin = z * Math.sqrt((p * (1 - p) + z ** 2 / (4 * total)) / total) / denominator
  return [Math.max(0, center - margin), Math.min(1, center + margin)]
}

function summarize(rows, arms) {
  const lines = [
    '| arm | n | score | complete | complete 95% CI | forbidden | approx context tokens |',
    '|---|---:|---:|---:|---:|---:|---:|',
  ]
  for (const [arm, context] of Object.entries(arms)) {
    const selected = rows.filter((row) => row.arm === arm && row.verdict)
    const score = selected.reduce((sum, row) => sum + row.verdict.correctness, 0)
    const complete = selected.filter((row) => row.verdict.complete).length
    const forbidden = selected.reduce((sum, row) => sum + row.verdict.forbidden, 0)
    const [low, high] = wilson(complete, selected.length)
    lines.push(`| ${arm} | ${selected.length} | ${score}/${selected.length * 2} | ${complete}/${selected.length} | ${(100 * low).toFixed(0)}–${(100 * high).toFixed(0)}% | ${forbidden} | ${estimateTokens(context)} |`)
  }
  lines.push('', '## By question', '', '| question | zh_name score / complete | en_name score / complete |', '|---|---:|---:|')
  for (const question of QUESTIONS) {
    const cell = (arm) => {
      const selected = rows.filter((row) => row.arm === arm && row.questionId === question.id && row.verdict)
      const score = selected.reduce((sum, row) => sum + row.verdict.correctness, 0)
      const complete = selected.filter((row) => row.verdict.complete).length
      return `${score}/${selected.length * 2} · ${complete}/${selected.length}`
    }
    lines.push(`| ${question.id} | ${cell('zh_name')} | ${cell('en_name')} |`)
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
        { role: 'user', content: `以下是病人的用藥紀錄：\n\n${context}\n---\n問題：${question.text}` },
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
  const bundleFile = arg('--bundle', DEFAULT_BUNDLE)
  const repetitions = Number(arg('--repetitions', '3'))
  const concurrency = Number(arg('--concurrency', '2'))
  const model = arg('--model', DEFAULT_MODEL)
  const asOf = arg('--as-of', DEFAULT_AS_OF)
  const regradeFile = arg('--regrade')
  const dryRun = process.argv.includes('--dry-run')
  const allowExternal = process.argv.includes('--allow-external-clinical-data')

  const bundle = JSON.parse(fs.readFileSync(bundleFile, 'utf8'))
  const records = bundleResources(bundle, 'MedicationRequest')
    .filter((record) => isCurrentSupplyRecord(record, asOf))
    .sort((a, b) => String(a.authoredOn || '').localeCompare(String(b.authoredOn || '')) || String(a.id || '').localeCompare(String(b.id || '')))
  if (records.length === 0) throw new Error('選取後沒有 current medication records')
  const missingEnglish = records.filter((record) => !record.medicationCodeableConcept?.coding?.some((coding) => coding.display?.trim()))
  const arms = {
    zh_name: buildSnapshot(records, 'zh_name', asOf),
    en_name: buildSnapshot(records, 'en_name', asOf),
  }

  fs.mkdirSync(OUT_DIR, { recursive: true })
  for (const [arm, context] of Object.entries(arms)) {
    fs.writeFileSync(path.join(OUT_DIR, `medication-language-${arm}.md`), context)
  }
  fs.writeFileSync(
    path.join(OUT_DIR, 'medication-language-questions.json'),
    JSON.stringify(QUESTIONS.map(({ facts, forbid, ...question }) => question), null, 2),
  )

  console.log(`records=${records.length}; english_name_coverage=${records.length - missingEnglish.length}/${records.length}`)
  for (const [arm, context] of Object.entries(arms)) {
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
      // Counterbalance the arm order across repetition and question index.
      const armOrder = (repetition + questionIndex) % 2 === 0
        ? ['zh_name', 'en_name']
        : ['en_name', 'zh_name']
      for (const arm of armOrder) tasks.push({ repetition, questionIndex, arm })
    }
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const output = path.join(OUT_DIR, `medication-language-${timestamp}.jsonl`)
  const rows = await runPool(tasks, concurrency, async (task) => {
    const question = QUESTIONS[task.questionIndex]
    try {
      const answer = await withRetry(() => callModel(model, arms[task.arm], question))
      const row = {
        ...task,
        questionId: question.id,
        model,
        answer,
        verdict: grade(question, answer),
      }
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
