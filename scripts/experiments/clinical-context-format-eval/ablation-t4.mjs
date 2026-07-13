// Controlled single-variable ablation for the performed-vs-recommended error in T4.
//
// Raw clinical contexts and model answers are written only to the gitignored
// results/ directory. Live calls require --allow-external-clinical-data.
//
// Usage:
//   node ablation-t4.mjs --input /absolute/path/to/pasted-text.txt --dry-run
//   node ablation-t4.mjs --input /absolute/path/to/pasted-text.txt \
//     --repetitions 9 --concurrency 3 --allow-external-clinical-data

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.join(HERE, 'results')
const DEFAULT_MODELS = {
  gemini: 'gemini-3.1-flash-lite',
  openai: 'gpt-5.4-nano',
  anthropic: 'claude-haiku-4-5-20251001',
}

const TOP_LEVEL_HEADINGS = [
  'Patient Information',
  'Body Height',
  'Body Weight',
  'BMI',
  'Waist Circumference',
  'Blood Pressure',
  'Care Plans',
  'Visits & Treatment History',
  'Imaging Reports',
  "Patient's Medications",
  "Patient's Conditions",
  "Patient's Allergies",
  'Procedures',
  'Immunizations',
  'Documents',
]

const QUESTION = '2025-05-18 至 05-22 住院時，出血來源最後判斷為何？胃鏡與後續建議各是什麼？'
const SYSTEM = [
  '你是臨床資料閱讀助理。只能根據提供的病歷內容回答。',
  '不可把就診層級的申報 ICD 自動當成確診；不可把缺席的 section 當成陰性事實。',
  '同一天的多筆 Encounter 必須分開。若清單被截斷，必須坦白無法得出完整或不重複總數。',
  '每個答案都要指出日期與來源區塊；資料不足時明確說明。回答簡短但完整。',
].join('\n')

const FULL_FLAGS = {
  rootHeading: true,
  topLevelHeadings: true,
  visitHeadings: true,
  visitHandles: true,
  labHeadings: true,
  labHandles: true,
  documentHeadings: true,
  documentHandles: true,
  documentTags: true,
  imagingHandles: true,
  tableFix: true,
  blankBulletFix: true,
  whitespaceNormalization: true,
}

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

function isTopLevelHeading(line) {
  if (/^Lab Reports \(.+\):$/.test(line)) return true
  return TOP_LEVEL_HEADINGS.some((heading) => line === `${heading}:`)
}

function transform(source, flags = {}) {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const out = flags.rootHeading ? ['# Clinical record context'] : []
  let visit = 0
  let image = 0
  let document = 0
  let inDocuments = false
  let documentOpen = false
  let currentSection = ''

  const closeDocument = () => {
    if (!documentOpen) return
    out.push('</clinical_document>')
    documentOpen = false
  }

  for (const raw of lines) {
    const matchLine = raw.replace(/[ \t]+$/g, '')
    const outputLine = flags.whitespaceNormalization ? matchLine : raw

    if (isTopLevelHeading(matchLine)) {
      if (inDocuments && flags.documentTags) closeDocument()
      const title = matchLine.slice(0, -1)
      currentSection = title
      inDocuments = title === 'Documents'
      if (flags.topLevelHeadings) out.push('', `## ${title}`)
      else out.push(outputLine)
      continue
    }

    const visitMatch = matchLine.match(/^- ▶\s*(.+)$/)
    if (visitMatch) {
      visit++
      const handle = `[VISIT-${String(visit).padStart(2, '0')}]`
      if (flags.visitHeadings) out.push('', `### ${flags.visitHandles ? `${handle} ` : ''}${visitMatch[1]}`)
      else if (flags.visitHandles) out.push(`- ▶ ${handle} ${visitMatch[1]}`)
      else out.push(outputLine)
      continue
    }

    const panelMatch = matchLine.match(/^- \[([^\]]+)\]$/)
    if (panelMatch) {
      const handle = `[LAB-${panelMatch[1].toUpperCase()}]`
      if (flags.labHeadings) out.push('', `### ${flags.labHandles ? `${handle} ` : ''}${panelMatch[1]}`)
      else if (flags.labHandles) out.push(`- ${handle} [${panelMatch[1]}]`)
      else out.push(outputLine)
      continue
    }

    if (flags.labHeadings && /^- Key trends/.test(matchLine)) {
      out.push('', `### ${matchLine.slice(2)}`)
      continue
    }
    if (flags.labHeadings && /^- Other results:/.test(matchLine)) {
      out.push('', '### Other results')
      continue
    }

    const documentMatch = inDocuments ? matchLine.match(/^- (出院病摘[^\n]*)$/) : null
    if (documentMatch) {
      if (flags.documentTags) closeDocument()
      document++
      const id = `DOC-${String(document).padStart(2, '0')}`
      const handle = `[${id}]`
      if (flags.documentHeadings) out.push('', `### ${flags.documentHandles ? `${handle} ` : ''}${documentMatch[1]}`)
      else if (flags.documentHandles) out.push(`- ${handle} ${documentMatch[1]}`)
      else out.push(outputLine)
      if (flags.documentTags) {
        out.push(`<clinical_document id="${id}">`)
        documentOpen = true
      }
      continue
    }

    if (flags.tableFix && /^- \|/.test(matchLine)) {
      out.push(matchLine.slice(2))
      continue
    }
    if (flags.blankBulletFix && (matchLine === '-' || matchLine === '- ')) {
      out.push('')
      continue
    }

    if (flags.imagingHandles && currentSection === 'Imaging Reports' && /^- \S/.test(matchLine)) {
      image++
      out.push(`- [IMG-${String(image).padStart(2, '0')}] ${matchLine.slice(2)}`)
      continue
    }

    out.push(outputLine)
  }
  if (flags.documentTags) closeDocument()
  const joined = out.join('\n')
  if (flags.whitespaceNormalization) return `${joined.replace(/\n{3,}/g, '\n\n').trim()}\n`
  return joined
}

function buildArms(source) {
  const atomic = (flag) => transform(source, { [flag]: true })
  const eventSource = 'Fiberscopy found trachea blood-tinged sputum+, no active bleeding or fresh blood noted from carina. Chest man suggested bronchoscopy evaluation, but his family hesitated.'
  if (!source.includes(eventSource)) throw new Error('找不到 T4 event source；不可在未確認來源文字時建立 event ablation')
  const eventBoundaries = source.replace(
    eventSource,
    '[EVENT-1] Fiberscopy found trachea blood-tinged sputum+, no active bleeding or fresh blood noted from carina.\n[EVENT-2] Chest man suggested bronchoscopy evaluation, but his family hesitated.',
  )
  const eventStatus = source.replace(
    eventSource,
    '[EVENT-1 status=performed] Fiberscopy found trachea blood-tinged sputum+, no active bleeding or fresh blood noted from carina.\n[EVENT-2 status=recommended_not_performed] Chest man suggested bronchoscopy evaluation, but his family hesitated.',
  )
  const procedureIdentity = source.replace(
    eventSource,
    '[EVENT-1 procedure_name_as_recorded="Fiberscopy" normalized_procedure=unknown do_not_merge_with=EVENT-2] Fiberscopy found trachea blood-tinged sputum+, no active bleeding or fresh blood noted from carina.\n[EVENT-2 procedure_name_as_recorded="bronchoscopy evaluation" do_not_merge_with=EVENT-1] Chest man suggested bronchoscopy evaluation, but his family hesitated.',
  )
  const eventStatusAndIdentity = source.replace(
    eventSource,
    '[EVENT-1 status=performed procedure_name_as_recorded="Fiberscopy" normalized_procedure=unknown do_not_merge_with=EVENT-2] Fiberscopy found trachea blood-tinged sputum+, no active bleeding or fresh blood noted from carina.\n[EVENT-2 status=recommended_not_performed procedure_name_as_recorded="bronchoscopy evaluation" do_not_merge_with=EVENT-1] Chest man suggested bronchoscopy evaluation, but his family hesitated.',
  )
  const withoutDocumentStructure = {
    ...FULL_FLAGS,
    documentHeadings: false,
    documentHandles: false,
    documentTags: false,
  }
  return {
    current_a: source,
    current_b: source,
    root_heading_only: atomic('rootHeading'),
    section_headings_only: atomic('topLevelHeadings'),
    visit_headings_only: atomic('visitHeadings'),
    visit_handles_only: atomic('visitHandles'),
    lab_headings_only: atomic('labHeadings'),
    lab_handles_only: atomic('labHandles'),
    document_headings_only: atomic('documentHeadings'),
    document_handles_only: atomic('documentHandles'),
    document_tags_only: atomic('documentTags'),
    imaging_handles_only: atomic('imagingHandles'),
    table_fix_only: atomic('tableFix'),
    blank_bullet_fix_only: atomic('blankBulletFix'),
    whitespace_only: atomic('whitespaceNormalization'),
    event_boundaries_only: eventBoundaries,
    event_status_only: eventStatus,
    procedure_identity_only: procedureIdentity,
    event_status_and_identity: eventStatusAndIdentity,
    document_bundle: transform(source, {
      documentHeadings: true,
      documentHandles: true,
      documentTags: true,
    }),
    full_except_document_structure: transform(source, withoutDocumentStructure),
    full_semantic: transform(source, FULL_FLAGS),
  }
}

function grade(answer) {
  const required = [
    /2025[-/]0?5[-/](18|22)/,
    /無.*活動.*出血|no active bleeder|未見.*出血|未.*活動性?.*出血/i,
    /肺|pulmonary|血痰|hemoptysis/i,
    /支氣管鏡|bronchoscopy/i,
    /家屬.*(?:猶豫|保留)|family.*hesitat|未做.*支氣管鏡/i,
  ]
  const hits = required.map((pattern) => pattern.test(answer))
  const conflation = /支氣管鏡(?:檢查)?(?:發現|顯示|看到)|bronchoscopy.{0,24}(?:found|showed|revealed)/is.test(answer)
  const ratio = hits.filter(Boolean).length / hits.length
  const correctness = !conflation && ratio === 1 ? 2 : ratio >= 0.5 ? 1 : 0
  return {
    correctness,
    complete: correctness === 2,
    conflation,
    requiredHits: hits.filter(Boolean).length,
    requiredTotal: hits.length,
  }
}

function hash(text) {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 12)
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
    '| arm | n | complete | conflation | conflation 95% CI | chars | hash |',
    '|---|---:|---:|---:|---:|---:|---|',
  ]
  for (const arm of Object.keys(arms)) {
    const selected = rows.filter((row) => row.arm === arm && row.verdict)
    const complete = selected.filter((row) => row.verdict.complete).length
    const conflation = selected.filter((row) => row.verdict.conflation).length
    const [low, high] = wilson(conflation, selected.length)
    lines.push(`| ${arm} | ${selected.length} | ${complete}/${selected.length} | ${conflation}/${selected.length} | ${(100 * low).toFixed(0)}–${(100 * high).toFixed(0)}% | ${arms[arm].length} | ${hash(arms[arm])} |`)
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

async function callModel(provider, model, context) {
  const urls = {
    gemini: process.env.NEXT_PUBLIC_GEMINI_URL,
    openai: process.env.NEXT_PUBLIC_CHAT_URL,
    anthropic: process.env.NEXT_PUBLIC_CLAUDE_URL,
  }
  const url = urls[provider]
  if (!url) throw new Error(`缺 ${provider} proxy URL`)
  const headers = {
    'content-type': 'application/json',
    authorization: `Bearer ${await getAnonToken()}`,
  }
  if (process.env.NEXT_PUBLIC_PROXY_KEY) headers['x-proxy-key'] = process.env.NEXT_PUBLIC_PROXY_KEY
  const user = `以下是病人的病歷內容：\n\n${context}\n\n---\n問題：${QUESTION}`
  const body = provider === 'anthropic'
    ? {
        model,
        max_tokens: 1000,
        temperature: 0,
        stream: false,
        system: SYSTEM,
        messages: [{ role: 'user', content: user }],
      }
    : {
        model,
        stream: false,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: user },
        ],
      }
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`${provider} proxy ${response.status}: ${(await response.text()).slice(0, 300)}`)
  const json = await response.json()
  if (provider === 'anthropic') return (json.content ?? []).map((part) => part.text ?? '').join('')
  if (provider === 'openai') return json.message ?? json.choices?.[0]?.message?.content ?? ''
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
      results[index] = await worker(tasks[index], index)
    }
  }
  await Promise.all(Array.from({ length: concurrency }, consume))
  return results
}

async function main() {
  const input = arg('--input')
  if (!input) throw new Error('請提供 --input /absolute/path/to/pasted-text.txt')
  const repetitions = Number(arg('--repetitions', '9'))
  const concurrency = Number(arg('--concurrency', '3'))
  const provider = arg('--provider', 'gemini')
  if (!(provider in DEFAULT_MODELS)) throw new Error(`未知 provider: ${provider}`)
  const model = arg('--model', DEFAULT_MODELS[provider])
  const selectedNames = arg('--arms')?.split(',').map((name) => name.trim()).filter(Boolean)
  const dryRun = process.argv.includes('--dry-run')
  const allowExternal = process.argv.includes('--allow-external-clinical-data')
  const source = fs.readFileSync(input, 'utf8').replace(/\r\n/g, '\n')
  const allArms = buildArms(source)
  const arms = selectedNames
    ? Object.fromEntries(selectedNames.map((name) => {
        if (!(name in allArms)) throw new Error(`未知 arm: ${name}`)
        return [name, allArms[name]]
      }))
    : allArms

  fs.mkdirSync(OUT_DIR, { recursive: true })
  const manifest = Object.fromEntries(Object.entries(arms).map(([name, text]) => [name, {
    chars: text.length,
    hash: hash(text),
    identicalToCurrent: text === source,
  }]))
  console.log(JSON.stringify({ repetitions, concurrency, provider, model, arms: manifest }, null, 2))
  if (dryRun) return
  if (!allowExternal) throw new Error('取得明確同意後才可加上 --allow-external-clinical-data')
  loadEnvLocal()

  const names = Object.keys(arms)
  const tasks = []
  for (let repetition = 0; repetition < repetitions; repetition++) {
    const offset = repetition % names.length
    const rotated = names.slice(offset).concat(names.slice(0, offset))
    if (repetition % 2 === 1) rotated.reverse()
    for (const arm of rotated) tasks.push({ arm, repetition: repetition + 1 })
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const base = path.join(OUT_DIR, `ablation-t4-${provider}-${stamp}`)
  fs.writeFileSync(`${base}.arms.json`, JSON.stringify(manifest, null, 2))
  let completed = 0
  let quotaExceeded = false
  const rows = await runPool(tasks, concurrency, async (task) => {
    if (quotaExceeded) return { ...task, provider, model, skipped: 'quota-exceeded' }
    const started = Date.now()
    let row
    try {
      const answer = await withRetry(() => callModel(provider, model, arms[task.arm]))
      const verdict = grade(answer)
      completed++
      console.log(`${completed}/${tasks.length} rep=${task.repetition} arm=${task.arm} complete=${verdict.complete} conflation=${verdict.conflation}`)
      row = { ...task, provider, model, answer, verdict, latencyMs: Date.now() - started }
    } catch (error) {
      completed++
      console.log(`${completed}/${tasks.length} rep=${task.repetition} arm=${task.arm} ERROR=${String(error).slice(0, 180)}`)
      if (/quota exceeded/i.test(String(error))) quotaExceeded = true
      row = { ...task, provider, model, error: String(error), latencyMs: Date.now() - started }
    }
    fs.appendFileSync(`${base}.partial.jsonl`, `${JSON.stringify(row)}\n`)
    return row
  })

  fs.writeFileSync(`${base}.jsonl`, rows.map((row) => JSON.stringify(row)).join('\n'))
  const report = summarize(rows, arms)
  fs.writeFileSync(`${base}.md`, report)
  console.log(`\n${report}\nresults: ${base}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
