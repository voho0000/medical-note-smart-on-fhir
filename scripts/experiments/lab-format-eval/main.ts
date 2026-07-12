// Lab-format eval — 檢驗資料餵 AI:樞紐表 (pivot) vs 現行趨勢行 (trend) A/B 實驗
//
// 研究問題:AI context 的檢驗段用「日期×項目 markdown 樞紐表」(同 匯出 tab 的
// ips-markdown)是否比現行「per-analyte 趨勢行」讓模型答得更準、引用更可靠?
//
// 設計:
//  • 同一位病人、同一批 Observations,只有檢驗段的「格式」不同(其餘 prompt 全同)。
//  • 題目由資料確定性生成(8 個模板),gold 由同一批資料確定性計算 — 不靠人工。
//  • 受測模型走 app 自己的 Firebase 代理(.env.local 的 NEXT_PUBLIC_*_URL +
//    NEXT_PUBLIC_PROXY_KEY),auth 用匿名 Firebase session(同 app 免費層),
//    每個 model×arm 開一個新 session(26 呼叫 < 匿名 50/日額度)。不需要任何
//    provider API key。temp=0(OpenAI 不送 temp)。
//  • 評分:確定性比對(gold 由資料確定性計算,答案抽 數值+日期 對 gold 與來源
//    點集合;引用有效性=答案中的數值都能在來源找到)。邊界案例人工複審。
//  • 已知混淆:trend 臂每項目截 16 點,pivot 臂含全部日期 — 這是兩格式的真實
//    涵蓋差異,由 T6/T8(深歷史)題型「刻意」度量,報告分開列。
//
// 用法:
//   npx tsx scripts/experiments/lab-format-eval/main.ts --dry-run          # 只建 context/題目/gold + token 統計
//   npx tsx scripts/experiments/lab-format-eval/main.ts                    # 全跑(受測+judge)
//   npx tsx scripts/experiments/lab-format-eval/main.ts --patients P12074XXXX --models gemini # 縮小範圍
import * as fs from 'node:fs'
import * as path from 'node:path'

import { FhirMapper } from '@/src/infrastructure/fhir/mappers/fhir.mapper'
import { labReportsCategory } from '@/src/core/categories/lab-reports.category'
import { formatClinicalContext } from '@/src/application/hooks/clinical-context/formatters'
import { buildLabPivots, type LabPivot, type LabRow } from '@/features/clinical-summary/reports/hooks/useLabPivot'
import { estimateTokens } from '@/src/shared/utils/token-estimator'

// ── config ──────────────────────────────────────────────────────────────────
const FIXTURE_DIR = process.env.LAB_EVAL_FIXTURES ||
  '/Users/kuoyihsin/My Drive/2工作/VGH/FHIR/50cases/NHI-FHIR-BRIDGE/fixtures/local/golden'
const DEFAULT_PATIENTS = ['P12074XXXX', 'F22154XXXX', 'M20047XXXX', 'H12113XXXX']
const OUT_DIR = path.join(__dirname, 'results')

interface ModelSpec { id: string; provider: 'openai' | 'gemini' | 'anthropic' }
const MODELS: ModelSpec[] = [
  { id: 'gemini-3-flash-preview', provider: 'gemini' },   // app 預設
  { id: 'gpt-5.4-nano', provider: 'openai' },             // 免費 GPT 層(大 context 已知偏弱)
  { id: 'claude-haiku-4-5-20251001', provider: 'anthropic' },
]
// ── env（.env.local 慣例;不覆蓋既有 process.env)───────────────────────────
function loadEnvLocal(): void {
  const p = path.join(process.cwd(), '.env.local')
  if (!fs.existsSync(p)) return
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim()
  }
}

// ── fixture → ClinicalDataCollection-ish(只需 labs 相關欄位)────────────────
interface Loaded {
  pid: string
  observations: any[]
  diagnosticReports: any[]
  collection: any
}

function loadPatient(pid: string): Loaded {
  const file = path.join(FIXTURE_DIR, `${pid}.bundle.digest.json`)
  const bundle = JSON.parse(fs.readFileSync(file, 'utf8'))
  const byType = new Map<string, any[]>()
  for (const e of bundle.entry ?? []) {
    const r = e.resource
    if (!r?.resourceType) continue
    if (!byType.has(r.resourceType)) byType.set(r.resourceType, [])
    byType.get(r.resourceType)!.push(r)
  }
  const observations = (byType.get('Observation') ?? []).map((o) => FhirMapper.toObservation(o))
  const diagnosticReports = (byType.get('DiagnosticReport') ?? []).map((d) =>
    FhirMapper.toDiagnosticReport(d, observations),
  )
  const vitalSigns = observations.filter((o: any) =>
    (o.category ?? []).some((c: any) => (c.coding ?? []).some((x: any) => x.code === 'vital-signs')),
  )
  const collection = { observations, diagnosticReports, vitalSigns }
  return { pid, observations, diagnosticReports, collection }
}

/** Lab observations(排除 vitals),同時餵 pivot 與 gold。 */
function labObservations(loaded: Loaded): any[] {
  return loaded.observations.filter((o: any) => {
    const cats = (o.category ?? []).flatMap((c: any) => (c.coding ?? []).map((x: any) => x.code))
    return cats.includes('laboratory')
  })
}

// ── 兩個 context 臂 ──────────────────────────────────────────────────────────
const TREND_FILTERS = { labReportVersion: 'all', labReportTimeRange: 'all', labTrendPoints: '16', labPanelIds: '' }

function buildTrendArm(loaded: Loaded): string {
  const data = labReportsCategory.extractData(loaded.collection)
  const section = labReportsCategory.getContextSection(data as any[], TREND_FILTERS as any, loaded.collection)
  const sections = Array.isArray(section) ? section : section ? [section] : []
  return formatClinicalContext(sections)
}

function cellText(row: LabRow, date: string): string {
  const cell = row.values.get(date)
  if (!cell) return '-'
  if (!cell.isAbnormal) return cell.value
  return `${cell.value} ${cell.interpretationCode || '*'}`
}

function renderPivot(pivot: LabPivot): string {
  const rows = pivot.rows.filter((r) => r.values.size > 0)
  if (!rows.length) return ''
  const dates = pivot.dates.filter((d) => rows.some((r) => r.values.has(d)))
  const header = `| Date | ${rows.map((r) => (r.unit ? `${r.displayName} (${r.unit})` : r.displayName)).join(' | ')} |`
  const sep = `| ${Array(rows.length + 1).fill('---').join(' | ')} |`
  const body = dates.map((d) => `| ${d} | ${rows.map((r) => cellText(r, d)).join(' | ')} |`)
  return [`### ${pivot.category.id}`, '', header, sep, ...body].join('\n')
}

function buildPivotArm(loaded: Loaded): string {
  const pivots = buildLabPivots(labObservations(loaded))
  const tables = Object.values(pivots).map(renderPivot).filter(Boolean)
  return ['Lab Reports (date × test pivot; abnormal flagged H/L/*)', '', ...tables].join('\n\n')
}

// ── gold:canonical 點列(來自 pivot rows,格式無關的事實庫)──────────────────
interface GoldPoint { analyte: string; date: string; value: string; abnormal: boolean; unit?: string }

function goldPoints(loaded: Loaded): GoldPoint[] {
  const out: GoldPoint[] = []
  for (const pivot of Object.values(buildLabPivots(labObservations(loaded)))) {
    for (const row of pivot.rows) {
      for (const [date, cell] of row.values) {
        out.push({ analyte: row.displayName, date, value: cell.value, abnormal: !!cell.isAbnormal, unit: row.unit })
      }
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

// ── 題目模板(由資料實例化;缺條件的模板跳過)────────────────────────────────
interface Question {
  id: string
  kind: string
  text: string
  gold: string
  /** judge 需要的來源事實(該題相關 analytes 的全部點)。 */
  goldPoints: GoldPoint[]
  /** 深歷史題:trend 臂(16 點截斷)預期看不到 → 分開統計。 */
  coverageSensitive: boolean
}

function numeric(points: GoldPoint[]): (GoldPoint & { n: number })[] {
  return points
    .map((p) => ({ ...p, n: Number(String(p.value).replace(/[^\d.eE+-]/g, '')) }))
    .filter((p) => Number.isFinite(p.n))
}

function seriesByAnalyte(points: GoldPoint[]): Map<string, GoldPoint[]> {
  const m = new Map<string, GoldPoint[]>()
  for (const p of points) {
    if (!m.has(p.analyte)) m.set(p.analyte, [])
    m.get(p.analyte)!.push(p)
  }
  return m
}

function buildQuestions(pid: string, points: GoldPoint[]): Question[] {
  const qs: Question[] = []
  const byAnalyte = seriesByAnalyte(points)
  const series = [...byAnalyte.entries()].sort((a, b) => b[1].length - a[1].length)
  const pts = (analyte: string) => byAnalyte.get(analyte) ?? []
  const push = (kind: string, text: string, gold: string, analytes: string[], coverageSensitive = false) =>
    qs.push({
      id: `${pid}-${kind}`,
      kind,
      text,
      gold,
      goldPoints: analytes.flatMap(pts),
      coverageSensitive,
    })

  // T1 單點事實:點數最多 analyte 的倒數第 2 個(最近 16 點內,兩臂皆看得到)
  const t1 = series.find(([, s]) => s.length >= 3)
  if (t1) {
    const s = t1[1]
    const p = s[s.length - 2]
    push('T1-point', `${p.analyte} 在 ${p.date} 的數值是多少?`, `${p.value}${p.unit ? ' ' + p.unit : ''}`, [t1[0]])
  }

  // T2 最近採檢日的異常項目
  const lastDate = points[points.length - 1]?.date
  if (lastDate) {
    const dayAbn = points.filter((p) => p.date === lastDate && p.abnormal)
    const dayAll = points.filter((p) => p.date === lastDate)
    push(
      'T2-abnormal-day',
      `${lastDate} 這次採檢中,哪些檢驗項目異常?請列出項目、數值與日期。`,
      dayAbn.length
        ? dayAbn.map((p) => `${p.analyte}=${p.value}`).join('; ')
        : '該日無標記異常的項目',
      [...new Set(dayAll.map((p) => p.analyte))],
    )
  }

  // T3 趨勢首末(最近 16 點內)
  const t3 = series.find(([, s]) => s.length >= 5)
  if (t3) {
    const s = t3[1].slice(-16)
    push(
      'T3-trend',
      `${t3[0]} 的數值隨時間如何變化?請給出你看到的最早與最新的數值及日期。`,
      `最早(視窗內) ${s[0].date}=${s[0].value};最新 ${s[s.length - 1].date}=${s[s.length - 1].value}`,
      [t3[0]],
    )
  }

  // T4 最低值(最近 16 點內,避免涵蓋混淆)
  const t4 = series.find(([, s]) => numeric(s).length >= 4)
  if (t4) {
    const s = numeric(t4[1]).slice(-16)
    const min = s.reduce((a, b) => (b.n < a.n ? b : a))
    push('T4-min', `${t4[0]} 最低的一次是哪一天、數值多少?`, `${min.date}=${min.value}`, [t4[0]])
  }

  // T5 同日 panel 對齊(找同一天 ≥3 個電解質/生化)
  const dayCount = new Map<string, GoldPoint[]>()
  for (const p of points) {
    if (!dayCount.has(p.date)) dayCount.set(p.date, [])
    dayCount.get(p.date)!.push(p)
  }
  const t5day = [...dayCount.entries()].filter(([, s]) => s.length >= 4).sort((a, b) => b[1].length - a[1].length)[0]
  if (t5day) {
    const sample = t5day[1].slice(0, 4)
    push(
      'T5-panel',
      `${t5day[0]} 當天的 ${sample.map((p) => p.analyte).join('、')} 各是多少?`,
      sample.map((p) => `${p.analyte}=${p.value}`).join('; '),
      sample.map((p) => p.analyte),
    )
  }

  // T6 深歷史:>16 點 analyte 的「最早一筆」(trend 臂被截斷 → coverage 題)
  const t6 = series.find(([, s]) => s.length > 16)
  if (t6) {
    const first = t6[1][0]
    push(
      'T6-deep-history',
      `${t6[0]} 最早的一筆紀錄是哪一天、數值多少?`,
      `${first.date}=${first.value}`,
      [t6[0]],
      true,
    )
  }

  // T7 不存在誘餌(hallucination bait)
  const baitCandidates = ['Troponin-I', 'Procalcitonin', 'NT-proBNP', 'CEA', 'CA19-9', 'Ammonia']
  const bait = baitCandidates.find((b) => ![...byAnalyte.keys()].some((k) => k.toLowerCase().includes(b.toLowerCase().split('-')[0])))
  if (bait) {
    push('T7-absence', `這位病人有驗過 ${bait} 嗎?若有,數值與日期?`, `資料中沒有 ${bait} 的紀錄`, [])
  }

  // T8 次數(>16 點 analyte → coverage 題;否則用最多點的)
  const t8 = t6 ?? series[0]
  if (t8) {
    push(
      'T8-count',
      `資料中 ${t8[0]} 總共有幾筆紀錄?`,
      `${t8[1].length} 筆`,
      [t8[0]],
      t8[1].length > 16,
    )
  }

  return qs
}

// ── prompt 組裝(兩臂唯一差異=檢驗段)────────────────────────────────────────
function buildPrompt(labBlock: string, question: string): { system: string; user: string } {
  return {
    system: [
      '你是臨床資料助理。僅根據提供的檢驗資料回答,不得使用外部知識推測數值。',
      '每個聲稱都必須附上引用:日期 + 數值(照資料原樣)。',
      '若資料中沒有,明確說「資料中沒有」。回答保持簡短。',
    ].join('\n'),
    user: `以下是病人的檢驗資料:\n\n${labBlock}\n\n---\n問題:${question}`,
  }
}

// ── 代理呼叫(同 app 合約:x-proxy-key + Firebase 匿名 ID token)──────────────
const anonTokenCache = new Map<string, string>()

async function getAnonToken(bucket: string): Promise<string> {
  const hit = anonTokenCache.get(bucket)
  if (hit) return hit
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY
  if (!apiKey) throw new Error('缺 NEXT_PUBLIC_FIREBASE_API_KEY(.env.local)')
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ returnSecureToken: true }),
  })
  if (!res.ok) throw new Error(`anon signUp ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const j = await res.json()
  anonTokenCache.set(bucket, j.idToken)
  return j.idToken
}

function proxyHeaders(token: string): Record<string, string> {
  const h: Record<string, string> = {
    'content-type': 'application/json',
    authorization: `Bearer ${token}`,
  }
  if (process.env.NEXT_PUBLIC_PROXY_KEY) h['x-proxy-key'] = process.env.NEXT_PUBLIC_PROXY_KEY
  return h
}

async function callModel(spec: ModelSpec, system: string, user: string, bucket: string): Promise<string> {
  const token = await getAnonToken(bucket)
  if (spec.provider === 'openai') {
    const url = process.env.NEXT_PUBLIC_CHAT_URL
    if (!url) throw new Error('缺 NEXT_PUBLIC_CHAT_URL')
    const res = await fetch(url, {
      method: 'POST',
      headers: proxyHeaders(token),
      body: JSON.stringify({
        model: spec.id,
        stream: false,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      }),
    })
    if (!res.ok) throw new Error(`openai-proxy ${res.status}: ${(await res.text()).slice(0, 300)}`)
    const j = await res.json()
    // 非串流 proxy 回 {message, openAiResponse};直呼 OpenAI 則是 choices[]。
    return j.message ?? j.choices?.[0]?.message?.content ?? ''
  }
  if (spec.provider === 'gemini') {
    const url = process.env.NEXT_PUBLIC_GEMINI_URL
    if (!url) throw new Error('缺 NEXT_PUBLIC_GEMINI_URL')
    // legacy `messages` 形狀(非 native body):handler 走 normalize 路徑,
    // 會自己組 systemInstruction/contents 並套 model 白名單。注意:proxy 對
    // flash 系列強制 temperature=1(app 的真實行為)— 報告需註記非 temp=0。
    const res = await fetch(url, {
      method: 'POST',
      headers: proxyHeaders(token),
      body: JSON.stringify({
        model: spec.id,
        stream: false,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      }),
    })
    if (!res.ok) throw new Error(`gemini-proxy ${res.status}: ${(await res.text()).slice(0, 300)}`)
    const j = await res.json()
    // 非串流 proxy 回 {message, geminiResponse};直呼 Google 則是 candidates[]。
    return j.message ?? (j.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? '').join('')
  }
  const url = process.env.NEXT_PUBLIC_CLAUDE_URL
  if (!url) throw new Error('缺 NEXT_PUBLIC_CLAUDE_URL')
  const res = await fetch(url, {
    method: 'POST',
    headers: proxyHeaders(token),
    body: JSON.stringify({
      model: spec.id,
      max_tokens: 1000,
      temperature: 0,
      stream: false,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  })
  if (!res.ok) throw new Error(`claude-proxy ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const j = await res.json()
  return (j.content ?? []).map((c: any) => c.text ?? '').join('')
}

// ── 確定性評分(gold 與來源皆確定性;數值+日期比對,不看格式)──────────────────
interface Verdict {
  correctness: 0 | 1 | 2
  citationsValid: boolean
  hallucinatedFacts: number
  notes: string
}

const DATE_RE = /\d{4}[-/年]\d{1,2}[-/月]\d{1,2}/g

function normDates(text: string): Set<string> {
  return new Set(
    [...text.matchAll(DATE_RE)].map((m) =>
      m[0]
        .replace(/[年月]/g, '-')
        .replace(/\//g, '-')
        .split('-')
        .map((x, i) => (i === 0 ? x : x.padStart(2, '0')))
        .join('-'),
    ),
  )
}

/** 答案中的「非日期」數值(去掉日期字串後再抽數字)。 */
function answerNumbers(text: string): string[] {
  const noDates = text.replace(DATE_RE, ' ')
  return [...noDates.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => m[0])
}

const numEq = (a: string, b: string): boolean => {
  const na = Number(a), nb = Number(b)
  return Number.isFinite(na) && Number.isFinite(nb) && Math.abs(na - nb) < 1e-9
}

function saysAbsent(answer: string): boolean {
  return /資料中沒有|沒有.{0,6}(紀錄|記錄|資料|驗過)|未.{0,4}(驗|檢驗|提供)|no record|not (present|available|found)|沒有此/i.test(answer)
}

function grade(q: Question, answer: string): Verdict {
  const ansNums = answerNumbers(answer)
  const ansDates = normDates(answer)
  const srcValues = q.goldPoints.map((p) => String(p.value))
  const srcDates = new Set(q.goldPoints.map((p) => p.date))
  const goldNums = answerNumbers(q.gold)
  const goldDates = normDates(q.gold)

  // 引用有效性:答案中的每個數值都能在來源找到;幻覺=找不到的數值個數。
  // (T7 無來源點:正確=聲明沒有且不編數值。)
  const unmatched = ansNums.filter((n) => !srcValues.some((v) => numEq(n, v)) && ![...srcDates].some((d) => d.includes(n)))
  const hallucinatedFacts = unmatched.length
  const datesOk = [...ansDates].every((d) => srcDates.has(d))
  const hasAnyCitation = ansNums.length > 0 || ansDates.size > 0

  let correctness: 0 | 1 | 2 = 0
  if (q.kind === 'T7-absence') {
    correctness = saysAbsent(answer) && ansNums.length === 0 ? 2 : saysAbsent(answer) ? 1 : 0
  } else if (q.kind === 'T2-abnormal-day' && goldNums.length === 0) {
    // gold=該日無異常
    correctness = saysAbsent(answer) || /無異常|沒有異常|均正常|皆正常|all normal|no abnormal/i.test(answer) ? 2 : 0
  } else {
    const valueHits = goldNums.filter((g) => ansNums.some((n) => numEq(n, g))).length
    const dateHits = [...goldDates].filter((d) => ansDates.has(d)).length
    const valueFrac = goldNums.length ? valueHits / goldNums.length : 1
    const dateFrac = goldDates.size ? dateHits / goldDates.size : 1
    if (valueFrac === 1 && dateFrac === 1 && hallucinatedFacts === 0) correctness = 2
    else if (valueFrac >= 0.5) correctness = 1
    else correctness = 0
  }

  const citationsValid = q.kind === 'T7-absence'
    ? saysAbsent(answer) && ansNums.length === 0
    : hasAnyCitation && hallucinatedFacts === 0 && datesOk

  return {
    correctness,
    citationsValid,
    hallucinatedFacts,
    notes: `vals=${ansNums.length} halluc=${hallucinatedFacts} datesOk=${datesOk}`,
  }
}

// ── main ─────────────────────────────────────────────────────────────────────
interface RunRow {
  pid: string
  model: string
  arm: 'trend' | 'pivot'
  qid: string
  kind: string
  coverageSensitive: boolean
  answer: string
  verdict?: Verdict
  latencyMs: number
  contextTokens: number
}

async function main(): Promise<void> {
  loadEnvLocal()
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const pick = (flag: string): string[] | null => {
    const i = args.indexOf(flag)
    return i >= 0 && args[i + 1] ? args[i + 1].split(',') : null
  }
  const patients = pick('--patients') ?? DEFAULT_PATIENTS
  const modelFilter = pick('--models')
  const models = MODELS.filter(
    (m) => !modelFilter || modelFilter.some((f) => m.id.includes(f) || m.provider.includes(f)),
  )
  fs.mkdirSync(OUT_DIR, { recursive: true })

  const rows: RunRow[] = []
  for (const pid of patients) {
    const loaded = loadPatient(pid)
    const points = goldPoints(loaded)
    const questions = buildQuestions(pid, points)
    const arms: Record<'trend' | 'pivot', string> = {
      trend: buildTrendArm(loaded),
      pivot: buildPivotArm(loaded),
    }
    const tokens = { trend: estimateTokens(arms.trend), pivot: estimateTokens(arms.pivot) }
    console.log(`\n== ${pid}: labPoints=${points.length} questions=${questions.length}` +
      ` trendTokens=${tokens.trend} pivotTokens=${tokens.pivot} (pivot/trend=${(tokens.pivot / Math.max(1, tokens.trend)).toFixed(2)}×)`)
    for (const q of questions) console.log(`   ${q.id} [${q.kind}${q.coverageSensitive ? ' ⚠coverage' : ''}] ${q.text} → gold: ${q.gold.slice(0, 80)}`)

    fs.writeFileSync(path.join(OUT_DIR, `${pid}.trend.md`), arms.trend)
    fs.writeFileSync(path.join(OUT_DIR, `${pid}.pivot.md`), arms.pivot)
    fs.writeFileSync(path.join(OUT_DIR, `${pid}.questions.json`), JSON.stringify(questions, null, 2))

    if (dryRun) continue

    for (const model of models) {
      for (const arm of ['trend', 'pivot'] as const) {
        // 每個 model×arm 一個匿名 session:26 題 ≪ 匿名 50/日 chat 額度。
        const bucket = `${model.id}|${arm}`
        for (const q of questions) {
          const { system, user } = buildPrompt(arms[arm], q.text)
          const t0 = Date.now()
          let answer = ''
          try {
            answer = await callModel(model, system, user, bucket)
          } catch (e) {
            answer = `[ERROR] ${String(e).slice(0, 200)}`
          }
          const latencyMs = Date.now() - t0
          const verdict = answer.startsWith('[ERROR]') ? undefined : grade(q, answer)
          rows.push({
            pid, model: model.id, arm, qid: q.id, kind: q.kind,
            coverageSensitive: q.coverageSensitive, answer, verdict, latencyMs,
            contextTokens: tokens[arm],
          })
          console.log(`   ${model.id} ${arm} ${q.kind}: c=${verdict?.correctness ?? 'ERR'} cite=${verdict?.citationsValid ?? '-'} hall=${verdict?.hallucinatedFacts ?? '-'} ${latencyMs}ms${answer.startsWith('[ERROR]') ? ' ' + answer.slice(0, 120) : ''}`)
          await new Promise((r) => setTimeout(r, 250)) // 溫和節流
        }
      }
    }
  }

  if (dryRun) {
    console.log(`\n[dry-run] contexts/questions/gold 已寫入 ${OUT_DIR}(未呼叫任何 API)`)
    return
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  fs.writeFileSync(path.join(OUT_DIR, `runs-${stamp}.jsonl`), rows.map((r) => JSON.stringify(r)).join('\n'))

  // ── aggregate ──
  const agg = new Map<string, { n: number; c: number; c2: number; cite: number; hall: number }>()
  for (const r of rows) {
    if (!r.verdict) continue
    const buckets = [
      `${r.model} | ${r.arm} | ${r.coverageSensitive ? 'coverage' : 'core'}`,
      `ALL | ${r.arm} | ${r.coverageSensitive ? 'coverage' : 'core'}`,
    ]
    for (const key of buckets) {
      const a = agg.get(key) ?? { n: 0, c: 0, c2: 0, cite: 0, hall: 0 }
      a.n++
      a.c += r.verdict.correctness
      a.c2 += r.verdict.correctness === 2 ? 1 : 0
      a.cite += r.verdict.citationsValid ? 1 : 0
      a.hall += r.verdict.hallucinatedFacts
      agg.set(key, a)
    }
  }
  const lines = ['| model | arm | slice | n | 平均正確(0-2) | 全對率 | 引用有效率 | 幻覺數/題 |', '|---|---|---|---|---|---|---|---|']
  for (const [key, a] of [...agg.entries()].sort()) {
    lines.push(`| ${key} | ${a.n} | ${(a.c / a.n).toFixed(2)} | ${((a.c2 / a.n) * 100).toFixed(0)}% | ${((a.cite / a.n) * 100).toFixed(0)}% | ${(a.hall / a.n).toFixed(2)} |`)
  }
  const summary = lines.join('\n')
  console.log('\n' + summary)
  fs.writeFileSync(path.join(OUT_DIR, `summary-${stamp}.md`), summary)
  console.log(`\n結果:${OUT_DIR}/runs-${stamp}.jsonl + summary-${stamp}.md`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
