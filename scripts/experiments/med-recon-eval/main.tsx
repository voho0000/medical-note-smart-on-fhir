// 跨院用藥整合卡（medicationReview）品質驗證 — 用 NHI-FHIR-Bridge 的真實病人
// golden fixtures 走「與 app 相同」的產生管線，檢查新 prompt 在真實資料上的表現。
//
// 管線對齊方式:
//  • bundle → LocalBundleService.parse（app 匯入同路徑）
//  • context → 真正的 clinical-context hooks，經 react-dom/server renderToString
//    在 Node 執行（providers 的 localStorage 都在 useEffect，SSR 不觸發，預設
//    audience=medical / locale=zh-TW 正是摘要醫療版所需）
//  • prompt → generateMedicalSummaryUseCase.buildMessages（含 scrubFreeText 與
//    longitudinal investigation block），與 use-medical-summary.hook 同組裝
//  • 模型 → app 自己的 Firebase proxy（匿名 session；與 lab-format-eval 同法）
//  • 驗證 → parseResult/finalizeResult 全套，再對 medicationReview 跑
//    確定性紅旗掃描（prompt 規則的機器可查違規）
//
// ⚠️ fixtures 是真實 PHI:結果一律寫到 bridge 的 fixtures/local/（gitignored），
//    不落在本 repo。
//
// 用法:
//   npx tsx scripts/experiments/med-recon-eval/main.tsx --dry-run
//   npx tsx scripts/experiments/med-recon-eval/main.tsx
//   npx tsx scripts/experiments/med-recon-eval/main.tsx --patients M20047XXXX --models gemini-3.1-flash-lite
import fs from 'node:fs'
import path from 'node:path'
import React from 'react'
import { renderToString } from 'react-dom/server'

import { AudienceProvider } from '@/src/application/providers/audience.provider'
import { LanguageProvider } from '@/src/application/providers/language.provider'
import { useEncountersContext } from '@/src/application/hooks/clinical-context/useEncountersContext'
import { useMedicationsContext } from '@/src/application/hooks/clinical-context/useMedicationsContext'
import { useAllergiesContext } from '@/src/application/hooks/clinical-context/useAllergiesContext'
import { useProceduresContext } from '@/src/application/hooks/clinical-context/useProceduresContext'
import { useVitalSignsContext } from '@/src/application/hooks/clinical-context/useVitalSignsContext'
import { useImmunizationsContext } from '@/src/application/hooks/clinical-context/useImmunizationsContext'
import { useProblemListContext } from '@/src/application/hooks/clinical-context/useProblemListContext'
import { formatClinicalContext } from '@/src/application/hooks/clinical-context/formatters'
import { dataCategoryRegistry } from '@/src/core/registry/data-category.registry'
// registry 由 app 啟動時註冊;CLI 需自己觸發
import { ensureCategoriesInitialized } from '@/src/core/categories/init'
ensureCategoriesInitialized()
import {
  listClinicalDocuments,
  resolveSelectedDocuments,
  formatDocumentsSection,
} from '@/src/core/utils/clinical-documents.utils'
import { DEFAULT_DATA_FILTERS } from '@/src/shared/constants/data-selection.constants'
import type { ClinicalContextSection } from '@/src/core/entities/clinical-context.entity'
import {
  generateMedicalSummaryUseCase,
  buildSourceCatalog,
  buildLongitudinalInvestigationContext,
  MEDICAL_SUMMARY_MODEL_ID,
} from '@/src/core/use-cases/medical-summary/generate-medical-summary.use-case'
import { estimateTokens } from '@/src/shared/utils/token-estimator'

// ── config ──────────────────────────────────────────────────────────────────
const FIXTURE_DIR = process.env.MED_RECON_FIXTURES ||
  '/Users/kuoyihsin/My Drive/2工作/VGH/FHIR/50cases/NHI-FHIR-BRIDGE/fixtures/local/golden'
const OUT_DIR = process.env.MED_RECON_OUT ||
  '/Users/kuoyihsin/My Drive/2工作/VGH/FHIR/50cases/NHI-FHIR-BRIDGE/fixtures/local/med-recon-eval'
const DEFAULT_PATIENTS = ['P12074XXXX', 'F22154XXXX', 'M20047XXXX', 'H12113XXXX']
const DEFAULT_MODELS = [MEDICAL_SUMMARY_MODEL_ID] // app 摘要預設

interface ModelSpec { id: string; provider: 'openai' | 'gemini' | 'anthropic' }
function toSpec(id: string): ModelSpec {
  if (id.startsWith('gemini')) return { id, provider: 'gemini' }
  if (id.startsWith('claude')) return { id, provider: 'anthropic' }
  return { id, provider: 'openai' }
}

// ── env（.env.local 慣例;不覆蓋既有 process.env）────────────────────────────
function loadEnvLocal(): void {
  const p = path.join(process.cwd(), '.env.local')
  if (!fs.existsSync(p)) return
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim()
  }
}

// ── context 建構:真 hooks 走 SSR 一次性執行 ─────────────────────────────────
function buildSections(collection: any): ClinicalContextSection[] {
  const captured: Record<string, ClinicalContextSection | ClinicalContextSection[] | null> = {}

  function Collector(): null {
    captured.encounters = useEncountersContext(true, collection, 'all')
    captured.medications = useMedicationsContext(true, collection, DEFAULT_DATA_FILTERS, true)
    captured.allergies = useAllergiesContext(true, collection)
    captured.procedures = useProceduresContext(true, collection, DEFAULT_DATA_FILTERS, true)
    captured.vitals = useVitalSignsContext(true, collection, DEFAULT_DATA_FILTERS)
    captured.immunizations = useImmunizationsContext(true, collection, DEFAULT_DATA_FILTERS)
    captured.problemList = useProblemListContext(true, collection, DEFAULT_DATA_FILTERS)
    return null
  }

  renderToString(
    <AudienceProvider>
      <LanguageProvider>
        <Collector />
      </LanguageProvider>
    </AudienceProvider>,
  )

  const push = (
    sections: ClinicalContextSection[],
    section: ClinicalContextSection | ClinicalContextSection[] | null | undefined,
  ) => {
    if (!section) return
    if (Array.isArray(section)) sections.push(...section)
    else sections.push(section)
  }

  // Patient Information（usePatientContext 需要整個 bundle-store provider 樹，
  // 但它的輸出只有 Gender/Age 兩行 — 直接以相同格式重建）
  const patient = collection.patient
  const patientItems: string[] = []
  if (patient?.gender) patientItems.push(`Gender: ${patient.gender.charAt(0).toUpperCase()}${patient.gender.slice(1)}`)
  if (patient?.birthDate) {
    const age = Math.floor((Date.now() - new Date(patient.birthDate).getTime()) / (365.25 * 86400000))
    if (Number.isFinite(age)) patientItems.push(`Age: ${age}`)
  }

  const documents = resolveSelectedDocuments(listClinicalDocuments(collection), 'latestAdmission', [])

  // 與 use-clinical-context.hook getClinicalContext 相同的段落順序
  const sections: ClinicalContextSection[] = []
  if (patientItems.length) sections.push({ title: 'Patient Information', items: patientItems })
  push(sections, captured.vitals)
  push(sections, captured.problemList)
  push(sections, dataCategoryRegistry.getCategoryContext('advanceDirectives', collection, DEFAULT_DATA_FILTERS))
  push(sections, dataCategoryRegistry.getCategoryContext('medicalDevices', collection, DEFAULT_DATA_FILTERS))
  push(sections, dataCategoryRegistry.getCategoryContext('carePlans', collection, DEFAULT_DATA_FILTERS))
  push(sections, captured.encounters)
  push(sections, dataCategoryRegistry.getCategoryContext('labReports', collection, DEFAULT_DATA_FILTERS))
  push(sections, dataCategoryRegistry.getCategoryContext('imagingReports', collection, DEFAULT_DATA_FILTERS))
  push(sections, captured.procedures)
  push(sections, captured.medications)
  push(sections, captured.allergies)
  push(sections, captured.immunizations)
  push(sections, formatDocumentsSection(documents))
  return sections
}

// ── proxy 呼叫（同 lab-format-eval;匿名 session）────────────────────────────
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
  const h: Record<string, string> = { 'content-type': 'application/json', authorization: `Bearer ${token}` }
  if (process.env.NEXT_PUBLIC_PROXY_KEY) h['x-proxy-key'] = process.env.NEXT_PUBLIC_PROXY_KEY
  return h
}

async function callModel(spec: ModelSpec, system: string, user: string, bucket: string): Promise<string> {
  const token = await getAnonToken(bucket)
  if (spec.provider === 'gemini') {
    const url = process.env.NEXT_PUBLIC_GEMINI_URL
    if (!url) throw new Error('缺 NEXT_PUBLIC_GEMINI_URL')
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
    return j.message ?? (j.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? '').join('')
  }
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
    return j.message ?? j.choices?.[0]?.message?.content ?? ''
  }
  const url = process.env.NEXT_PUBLIC_CLAUDE_URL
  if (!url) throw new Error('缺 NEXT_PUBLIC_CLAUDE_URL')
  const res = await fetch(url, {
    method: 'POST',
    headers: proxyHeaders(token),
    body: JSON.stringify({
      model: spec.id,
      max_tokens: 8000,
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

// ── 紅旗掃描:prompt 規則中機器可查的違規 ────────────────────────────────────
interface RedFlag { rule: string; where: string; text: string }

function scanRedFlags(review: any, catalog: any[]): RedFlag[] {
  const flags: RedFlag[] = []
  const medKeys = new Set(catalog.filter((c) => c.resourceType.startsWith('Medication')).map((c) => c.key))
  const push = (rule: string, where: string, text: string) => flags.push({ rule, where, text: text.slice(0, 120) })

  for (const item of review.regimen ?? []) {
    if (/同次慢箋|慢箋用藥|近期用藥|same chronic/i.test(item.group ?? '')) {
      push('禁止批次式分組', `regimen:${item.name}`, item.group)
    }
    if (/平均每日|給藥總量|給藥日數/.test(item.sig ?? '')) {
      push('sig 不得為調劑演算', `regimen:${item.name}`, item.sig)
    }
    if (/依醫囑|遵醫囑|as directed/i.test(item.sig ?? '')) {
      push('sig 不得為填充詞', `regimen:${item.name}`, item.sig)
    }
    // 多藥合併列必須逐一點名:「多種抗生素」這類 roll-up 無法核對
    if (/多種|等藥物|類藥物$|及其他/.test(item.name ?? '') && !/[A-Za-z]{3}/.test(item.name ?? '')) {
      push('regimen 合併列未點名藥品', `regimen:${item.group}`, item.name)
    }
  }
  for (const item of review.changes ?? []) {
    if (/僅代表|不等同|不一定|無法確定是否/.test(item.summary ?? '')) {
      push('changes 不得帶逐項免責 hedge', `changes:${item.medication}`, item.summary)
    }
  }
  for (const item of review.reconciliation ?? []) {
    const text = item.text ?? ''
    if (/(應|建議|考慮)(加|開立|使用|給予|開始)|是否需要(加|開|使用|給予)|需(考慮|評估)(加|開)/.test(text) &&
        /ACEI|ARB|statin|他汀|抗凝|保護|SGLT2|beta|阻斷/i.test(text)) {
      push('guideline 開藥建議混入待核對', `reconciliation:${item.reason}`, text)
    }
    if (/確認(目前實際|是否仍(在|全部))/.test(text) && !/\d{4}-\d{2}|\d+ ?天|供藥|重疊|中斷/.test(text)) {
      push('泛用句(無具體紀錄錨點)', `reconciliation:${item.reason}`, text)
    }
    const cited = (item.sourceKeys ?? []).length
    if (cited === 0) push('無來源引用', `reconciliation:${item.reason}`, text)
    if (item.reason !== 'condition-without-therapy' &&
        !(item.sourceKeys ?? []).some((k: string) => medKeys.has(k))) {
      push('非 condition-without-therapy 卻無 M key', `reconciliation:${item.reason}`, text)
    }
  }
  if ((review.overview ?? '').length > 0 && (review.overview ?? '').length < 20) {
    push('overview 過短', 'overview', review.overview)
  }
  return flags
}

// ── main ─────────────────────────────────────────────────────────────────────
function pick(flag: string): string[] | null {
  const i = process.argv.indexOf(flag)
  if (i < 0 || !process.argv[i + 1]) return null
  return process.argv[i + 1].split(',').map((s) => s.trim()).filter(Boolean)
}

async function main() {
  loadEnvLocal()
  const dryRun = process.argv.includes('--dry-run')
  const patients = pick('--patients') ?? DEFAULT_PATIENTS
  const models = (pick('--models') ?? DEFAULT_MODELS).map(toSpec)
  fs.mkdirSync(OUT_DIR, { recursive: true })

  const { LocalBundleService } = await import('@/src/infrastructure/fhir/services/local-bundle.service')

  for (const pid of patients) {
    const file = path.join(FIXTURE_DIR, `${pid}.bundle.digest.json`)
    if (!fs.existsSync(file)) { console.error(`✗ ${pid}: fixture 不存在`); continue }
    const bundle = JSON.parse(fs.readFileSync(file, 'utf8'))
    const parsedBundle = await LocalBundleService.parse(bundle)
    if (!parsedBundle) { console.error(`✗ ${pid}: bundle parse 失敗`); continue }
    const { collection } = parsedBundle

    const sections = buildSections(collection)
    const catalog = buildSourceCatalog(collection)
    const clinicalContext = [
      formatClinicalContext(sections),
      buildLongitudinalInvestigationContext(collection, catalog),
    ].filter(Boolean).join('\n\n')

    const messages = generateMedicalSummaryUseCase.buildMessages({
      clinicalContext,
      catalog,
      locale: 'zh-TW',
      audience: 'medical',
    })
    const [system, user] = [messages[0].content, messages[1].content]
    const meds = collection.medications?.length ?? 0
    console.log(`\n■ ${pid}: meds=${meds} sections=${sections.length} contextTokens≈${estimateTokens(user)}`)
    fs.writeFileSync(path.join(OUT_DIR, `${pid}.context.txt`), user)
    if (dryRun) continue

    for (const spec of models) {
      const t0 = Date.now()
      let raw = ''
      try {
        raw = await callModel(spec, system, user, `${spec.id}|${pid}`)
      } catch (e) {
        console.error(`  ✗ ${spec.id}: ${(e as Error).message.slice(0, 200)}`)
        continue
      }
      const parsed = generateMedicalSummaryUseCase.parseResult(raw)
      if (!parsed) {
        fs.writeFileSync(path.join(OUT_DIR, `${pid}.${spec.id}.raw.txt`), raw)
        console.error(`  ✗ ${spec.id}: parseResult 失敗（raw 已存）`)
        continue
      }
      const finalized = generateMedicalSummaryUseCase.finalizeResult(parsed, catalog, {
        clinicalData: collection,
        audience: 'medical',
        locale: 'zh-TW',
      })
      const review = finalized.medicationReview
      const flags = scanRedFlags(review, catalog)
      const out = {
        pid,
        model: spec.id,
        latencyMs: Date.now() - t0,
        redFlags: flags,
        medicationReview: review,
        sourceIndex: finalized.sourceIndex.filter((s) =>
          [...(review.regimen ?? []), ...(review.changes ?? []), ...(review.reconciliation ?? [])]
            .some((item: any) => (item.sourceKeys ?? []).includes(s.key))),
        problems: finalized.problems,
      }
      fs.writeFileSync(path.join(OUT_DIR, `${pid}.${spec.id}.json`), JSON.stringify(out, null, 2))
      console.log(
        `  ✓ ${spec.id}: regimen=${review.regimen.length} changes=${review.changes.length} ` +
        `recon=${review.reconciliation.length} overview=${review.overview ? 'yes' : 'NO'} ` +
        `redFlags=${flags.length} ${Date.now() - t0}ms`,
      )
      for (const f of flags) console.log(`     🚩 [${f.rule}] ${f.where}: ${f.text}`)
    }
  }
  console.log(`\n結果在 ${OUT_DIR}（gitignored 的 PHI 區,不進 repo）`)
}

main().catch((e) => { console.error(e); process.exit(1) })
