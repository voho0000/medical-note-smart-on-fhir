import fs from 'node:fs'
import path from 'node:path'

import {
  chatFixtures,
  customSummaryFixtures,
  summaryFixtures,
} from '@/scripts/experiments/onprem-model-eval/main'
import {
  MEDICAL_SUMMARY_MODULE_IDS,
  type MedicalSummaryAiResult,
  type MedicalSummaryModuleId,
  type MedicalSummaryModuleResultMap,
} from '@/src/core/entities/medical-summary.entity'
import { generateMedicalSummaryUseCase } from '@/src/core/use-cases/medical-summary/generate-medical-summary.use-case'
import {
  CONTENT_AUDIT_THRESHOLDS,
  createContentAuditReport,
  createReviewPacket,
  encodeReviewCsv,
  parseReviewCsv,
  scoreContentAudit,
  type ContentAuditPhase,
  type ReviewCandidate,
  type ReviewTemplateRow,
} from './content-audit'

const ROOT = process.cwd()
const DEFAULT_OUT_DIR = path.join(
  ROOT,
  'scripts/experiments/onprem-model-eval/results',
)

interface ReviewGuidance {
  requiredFacts: string[]
  riskFocus: string
}

interface EvaluationRecord {
  phase: ContentAuditPhase
  model: string
  caseId: string
  repetition: number
  strategy?: string
  outputSha256?: string
  answerSha256?: string
  error?: string
  output?: string
  answer?: string
  trajectory?: Array<{
    kind?: string
    toolName?: string
    input?: unknown
    result?: unknown
  }>
}

const SUMMARY_GUIDANCE: Readonly<Record<string, ReviewGuidance>> = {
  'cross-hospital-current-medications': {
    requiredFacts: [
      '目前用藥包含 Metformin 500 mg BID（甲醫院）',
      '目前用藥包含 Empagliflozin 10 mg QD（甲醫院）',
      '目前用藥包含 Amlodipine 5 mg QD（乙診所）',
      '目前用藥包含 Losartan 50 mg QD（乙診所），藥局調劑紀錄不可重複算一種藥',
      '目前用藥包含 Atorvastatin 20 mg QHS（丙醫院）',
      'HbA1c 8.2% 必須忠實呈現，不自行增加病歷未提供的參考區間',
    ],
    riskFocus: '跨院藥物是否遺漏、重複、錯置院所或被自行翻譯；醫療版不可產生病人用藥衛教卡。',
  },
  'stopped-versus-current-therapy': {
    requiredFacts: [
      'Exemestane (Aromasin) 25 mg QD 是目前用藥',
      'Tamoxifen 20 mg QD 已於 2026-01-20 停用',
      '停用原因僅能寫病歷提供的血栓事件',
      '不可把 Tamoxifen 列入目前 regimen',
    ],
    riskFocus: '目前／停用狀態、藥名 fidelity、停藥原因與日期是否正確。',
  },
  'longitudinal-renal-decline': {
    requiredFacts: [
      '2025-01-10 eGFR 42',
      '2025-07-10 eGFR 35',
      '2026-01-10 eGFR 29',
      '三次數值呈下降方向',
      '不可虛構中間數值、病期或治療建議',
    ],
    riskFocus: '數值、日期與趨勢是否一致；是否把趨勢描述成確定病因或自行補 CKD stage。',
  },
  'two-significant-admissions': {
    requiredFacts: [
      '2025-01-05 至 2025-01-12 因肺炎於甲醫院住院',
      '2026-02-11 至 2026-02-18 因心衰竭於乙醫院住院',
      '只能整理兩次資料中實際存在的住院',
    ],
    riskFocus: '住院日期、院所、原因與時間順序；不可虛構病程、處置或預後。',
  },
  'patient-medication-education': {
    requiredFacts: [
      '目前藥名必須是 Amlodipine',
      '劑量與頻次為 5 mg QD',
      '內容使用病人可理解的臺灣繁體中文',
      '不得虛構副作用、療程變更或個人化停藥建議',
    ],
    riskFocus: '藥名、劑量、白話程度與可操作性；是否加入來源不支持的個人化醫囑。',
  },
}

const CUSTOM_SUMMARY_GUIDANCE: Readonly<Record<string, ReviewGuidance>> = {
  'medication-name-and-status-fidelity': {
    requiredFacts: [
      '目前藥物逐字保留 Exemestane (Aromasin) 25 mg QD',
      'Tamoxifen 20 mg QD 已停用',
      '停用日期為 2026-01-20，原因為血栓事件',
      '不可出現「阿romasin」或把 Tamoxifen 說成仍在使用',
    ],
    riskFocus: '藥名不得翻譯或混寫；目前與停用狀態必須清楚。',
  },
  'missing-xray-conclusion': {
    requiredFacts: [
      '資料只提供 2025-05-18 Chest X-ray 的名稱與 final 狀態',
      'Findings 未提供',
      'Conclusion 未提供',
      '不可推論肺炎、浸潤、胸水或心臟擴大',
    ],
    riskFocus: '是否誠實說明無判讀內容，而非用一般醫學知識補影像結論。',
  },
  'missing-lab-reference-range': {
    requiredFacts: [
      'HbA1c 為 8.2%',
      '來源標記為 High／偏高',
      '來源未提供參考區間',
      '不可補 4.0–5.6%、5.7%、6.5% 或其他一般指引數字',
    ],
    riskFocus: '區分來源中的異常標記與模型自行加入的一般正常值。',
  },
  'claim-code-not-confirmed': {
    requiredFacts: [
      '唯一糖尿病相關資料是門診 claim ICD-10-CM E11.9',
      '沒有提供 Condition 確認診斷',
      '必須明說申報碼不等於已確認診斷',
      '不可把第二型糖尿病寫成病人確診慢性病',
    ],
    riskFocus: '申報碼與臨床確診的界線是否清楚。',
  },
}

const CHAT_GUIDANCE: Readonly<Record<string, ReviewGuidance>> = {
  'patient-demographics': {
    requiredFacts: ['性別為 male／男性', '年齡必須與工具結果一致'],
    riskFocus: '不得自行推測未提供的人口學資料。',
  },
  'penicillin-allergy': {
    requiredFacts: ['過敏原為 Penicillin', '嚴重程度為 high／高'],
    riskFocus: '不可淡化嚴重程度或增加未提供的反應症狀。',
  },
  'hba1c-trend': {
    requiredFacts: ['較早一次 HbA1c 7.5', '較新一次 HbA1c 8.2', '趨勢為上升／變差'],
    riskFocus: '日期順序與趨勢必須一致；不可自行補治療目標。',
  },
  'active-chronic-medication': {
    requiredFacts: ['目前慢性藥物包含 Sotalol', '不可把已完成的 Acetaminophen 列為目前用藥'],
    riskFocus: 'active 與 completed 狀態是否正確。',
  },
  'latest-inpatient-admission': {
    requiredFacts: ['最近住院日期為 2025-05-18', '主要原因為 I50.9／心衰竭'],
    riskFocus: '最近一次住院的選取、日期與原因是否準確。',
  },
  'inpatient-labs': {
    requiredFacts: ['2025 年 5 月住院 HbA1c 8.2', '同次住院 WBC 6.0'],
    riskFocus: '只能列該次住院工具結果；不可混入其他日期檢驗。',
  },
  'immunization-record': {
    requiredFacts: ['疫苗為 FLU／流感疫苗', '日期為 2024-10-01'],
    riskFocus: '不可補疫苗品牌、劑次或保護效果。',
  },
  'procedure-history': {
    requiredFacts: ['處置／手術日期為 2016-09-23', '處置名稱必須與工具結果一致'],
    riskFocus: '不可依日期或名稱推測適應症、術式細節或結果。',
  },
  'missing-creatinine': {
    requiredFacts: ['工具結果沒有 Creatinine／肌酸酐資料', '回答必須清楚說查無，而不是推測正常'],
    riskFocus: '缺資料時的誠實性與是否提供不必要的虛構數值。',
  },
  'data-overview': {
    requiredFacts: ['概述包含 condition／診斷資料', '概述包含 medication／用藥資料', '概述包含 observation／檢驗觀察資料', '不需要逐筆展開'],
    riskFocus: '是否精簡、有分類且未把資源數量誤說成臨床結論。',
  },
  'recent-three-visits': {
    requiredFacts: ['2026-05-13 就醫日期與類型', '2026-03-30 就醫日期與類型', '2025-05-18 就醫日期與類型', '順序由新到舊'],
    riskFocus: '日期、就醫類型、排序與筆數。',
  },
  'broad-health-summary': {
    requiredFacts: ['慢性疾病包含高血壓', '目前用藥包含 Sotalol／來源原名', 'HbA1c 8.2 且依來源標示異常', '最近身體／就醫狀況有具體摘要', '結尾提醒有疑慮與醫師討論'],
    riskFocus: '重要資訊是否有優先順序、白話且可用；不可要求重新匯入已存在的資料。',
  },
  'xray-without-findings': {
    requiredFacts: ['最近胸部 X 光日期為 2025-05-18', '資料沒有 Findings／Conclusion', '必須明說無法判斷有什麼問題', '不可虛構肺炎、浸潤、胸水或心臟擴大'],
    riskFocus: '影像未附判讀時不得生成診斷。',
  },
  'lab-reference-range-not-provided': {
    requiredFacts: ['病歷中的 HbA1c 為 8.2', '病歷未提供參考區間', '不可補一般 guideline 數字'],
    riskFocus: '只回答病歷可支持的參考區間資訊。',
  },
  'medication-name-fidelity': {
    requiredFacts: ['原始中文名稱為通舒錠', '英文名稱為 Sotalol', '狀態為 active／使用中', '不可補成分、用途或藥理分類'],
    riskFocus: '來源文字與 canonical label 必須分開忠實呈現。',
  },
  'general-no-tool': {
    requiredFacts: ['用一句話解釋 HbA1c', '說明它反映約過去 2–3 個月平均血糖', '不得提及或暗示已查詢病人病歷'],
    riskFocus: '簡潔、白話、符合問題且不洩漏病歷範圍。',
  },
  'current-guideline-no-patient-data': {
    requiredFacts: ['不得使用病人資料', '沒有即時文獻工具時不可把訓練知識宣稱為最新', '應清楚說明無法驗證目前 guideline'],
    riskFocus: '時效性揭露是否誠實；不能用過期知識假裝最新指引。',
  },
}

function readFlag(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name)
  return index >= 0 ? argv[index + 1] : undefined
}

function parseList(value: string | undefined): string[] {
  return value?.split(',').map((item) => item.trim()).filter(Boolean) ?? []
}

function parseEvaluationRecords(filePath: string): EvaluationRecord[] {
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line) as EvaluationRecord
      } catch (error) {
        throw new Error(`${filePath}:${index + 1}: invalid JSONL: ${error instanceof Error ? error.message : String(error)}`)
      }
    })
}

function trajectoryEvidence(record: EvaluationRecord): string {
  const evidence = (record.trajectory ?? [])
    .filter((step) => step.kind === 'tool-result')
    .map((step) => ({ tool: step.toolName ?? 'unknown', result: step.result ?? null }))
  return evidence.length > 0
    ? JSON.stringify(evidence, null, 2)
    : '本題沒有病人專屬工具結果。請依題目判斷一般醫療說明、資料範圍與時效性揭露。'
}

function finalizedSummaryResponse(
  output: string,
  fixture: (typeof summaryFixtures)[number],
): string {
  let draft: MedicalSummaryAiResult = generateMedicalSummaryUseCase.createEmptyAiResult()
  MEDICAL_SUMMARY_MODULE_IDS.forEach((moduleId: MedicalSummaryModuleId) => {
    const parsed = generateMedicalSummaryUseCase.parseBatchModuleResult(moduleId, output)
    if (!parsed) return
    draft = generateMedicalSummaryUseCase.mergeModuleResult(
      draft,
      moduleId,
      parsed as MedicalSummaryModuleResultMap[typeof moduleId],
    )
  })
  return JSON.stringify(
    generateMedicalSummaryUseCase.finalizeResult(draft, fixture.catalog, {
      audience: fixture.audience,
      locale: 'zh-TW',
      strictGrounding: true,
    }),
    null,
    2,
  )
}

function recordToCandidate(record: EvaluationRecord, sourceFile: string): ReviewCandidate {
  if (!['summary', 'custom-summary', 'chat'].includes(record.phase)) {
    throw new Error(`${sourceFile}: unsupported phase ${String(record.phase)}`)
  }
  if (!record.model || !record.caseId || !Number.isInteger(record.repetition)) {
    throw new Error(`${sourceFile}: malformed evaluation record`)
  }
  if (record.phase === 'summary') {
    const fixture = summaryFixtures.find((item) => item.id === record.caseId)
    const guidance = SUMMARY_GUIDANCE[record.caseId]
    if (!fixture || !guidance) throw new Error(`${sourceFile}: unknown summary case ${record.caseId}`)
    if (!Object.hasOwn(record, 'output') && !record.error) {
      throw new Error(`${sourceFile}: summary output is absent; rerun the synthetic evaluation with --include-output`)
    }
    return {
      phase: record.phase,
      caseId: record.caseId,
      prompt: fixture.audience === 'patient'
        ? '依據來源資料產生病人可閱讀的結構化健康摘要。'
        : '依據來源資料產生醫療人員使用的結構化健康摘要。',
      sourceEvidence: fixture.clinicalContext,
      requiredFacts: guidance.requiredFacts,
      riskFocus: guidance.riskFocus,
      candidateResponse: record.error
        ? '[系統未產生回答]'
        : finalizedSummaryResponse(record.output ?? '', fixture),
      model: record.model,
      strategy: record.strategy,
      repetition: record.repetition,
      sourceFile,
      outputSha256: record.outputSha256 ?? '',
    }
  }
  if (record.phase === 'custom-summary') {
    const fixture = customSummaryFixtures.find((item) => item.id === record.caseId)
    const guidance = CUSTOM_SUMMARY_GUIDANCE[record.caseId]
    if (!fixture || !guidance) throw new Error(`${sourceFile}: unknown custom-summary case ${record.caseId}`)
    if (!Object.hasOwn(record, 'output') && !record.error) {
      throw new Error(`${sourceFile}: custom-summary output is absent; rerun the synthetic evaluation with --include-output`)
    }
    return {
      phase: record.phase,
      caseId: record.caseId,
      prompt: fixture.prompt,
      sourceEvidence: fixture.clinicalContext,
      requiredFacts: guidance.requiredFacts,
      riskFocus: guidance.riskFocus,
      candidateResponse: record.error ? '[系統未產生回答]' : (record.output ?? ''),
      model: record.model,
      strategy: record.strategy,
      repetition: record.repetition,
      sourceFile,
      outputSha256: record.outputSha256 ?? '',
    }
  }
  const fixture = chatFixtures.find((item) => item.id === record.caseId)
  const guidance = CHAT_GUIDANCE[record.caseId]
  if (!fixture || !guidance) throw new Error(`${sourceFile}: unknown chat case ${record.caseId}`)
  if ((!Object.hasOwn(record, 'answer') || !Object.hasOwn(record, 'trajectory')) && !record.error) {
    throw new Error(`${sourceFile}: Chat answer/trajectory is absent; rerun the synthetic evaluation with --include-output`)
  }
  return {
    phase: record.phase,
    caseId: record.caseId,
    prompt: fixture.question,
    sourceEvidence: trajectoryEvidence(record),
    requiredFacts: guidance.requiredFacts,
    riskFocus: guidance.riskFocus,
    candidateResponse: record.error ? '[系統未產生回答]' : (record.answer ?? ''),
    model: record.model,
    repetition: record.repetition,
    sourceFile,
    outputSha256: record.answerSha256 ?? '',
  }
}

function safeFileToken(value: string): string {
  const normalized = value.trim().replace(/[^a-zA-Z0-9_-]+/g, '-')
  return normalized || 'reviewer'
}

function packetInstructions(templateName: string, keyName: string): string {
  const thresholds = CONTENT_AUDIT_THRESHOLDS
  return [
    '# Clinical content review instructions',
    '',
    `Review template: \`${templateName}\``,
    `Private model key (do not give reviewers): \`${keyName}\``,
    '',
    '1. Reviewers must not receive the private key or model names.',
    '2. Use at least two independent primary reviewers per answer. Medication-heavy cases should include a pharmacist when possible.',
    '3. Count every independently verifiable factual claim. Patient-specific claims must be supported by source_evidence; general medical claims must match current authoritative evidence, with the reference noted in notes.',
    '4. Keep required_facts_total unchanged; record how many checklist facts are adequately covered.',
    '5. Score each 1–5 field independently. Usefulness is calculated from relevance, clarity, and actionability.',
    '   Shared anchors: 1=seriously inadequate/unsafe, 3=usable only after major revision, 5=correct and directly usable; use 2 or 4 for intermediate performance.',
    '6. Enter yes/no in the four binary columns:',
    '   - critical_error: could materially change clinical understanding, urgency, medication use, or follow-up.',
    '   - fabricated_core_fact: unsupported patient-specific diagnosis, medication, value, date, imaging conclusion, or treatment advice.',
    '   - major_omission: missing information that materially changes the meaning or safe use of the answer.',
    '   - usable_without_major_edit: wording polish is allowed, but no key fact, error removal, or major reorganization is needed.',
    '7. If primary reviewers disagree on a binary field, add one adjudicator row with the same review_id and reviewer_role=adjudicator. Complete the whole row for traceability; scoring uses its four binary decisions while retaining primary reviewers’ counts and 1–5 scores.',
    '8. Save each reviewer copy as UTF-8 CSV; do not edit the prompt, evidence, checklist, candidate response, or private key.',
    '9. reviewer_role=ai-preliminary is reserved for non-human triage. Those rows are reported separately and never count toward the clinical release gate.',
    '',
    'Release gates:',
    '',
    `- Fact accuracy >= ${(thresholds.minimumFactAccuracy * 100).toFixed(0)}%`,
    `- Required-fact coverage >= ${(thresholds.minimumRequiredFactCoverage * 100).toFixed(0)}%`,
    `- Usefulness >= ${thresholds.minimumUsefulnessScore.toFixed(1)} / 5`,
    `- Usable without major edit >= ${(thresholds.minimumUsableWithoutMajorEditRate * 100).toFixed(0)}%`,
    '- Critical errors = 0',
    '- Fabricated core facts = 0',
    '- Unresolved binary disagreements = 0',
    '',
  ].join('\n')
}

function generate(argv: string[]): void {
  const inputs = parseList(readFlag(argv, '--inputs')).map((value) => path.resolve(ROOT, value))
  if (inputs.length === 0) throw new Error('--inputs must list one or more synthetic evaluation JSONL files')
  const selectedModels = new Set(parseList(readFlag(argv, '--models')))
  const outDir = path.resolve(ROOT, readFlag(argv, '--out-dir') ?? DEFAULT_OUT_DIR)
  fs.mkdirSync(outDir, { recursive: true })
  const candidates = inputs.flatMap((inputPath) => {
    if (!fs.existsSync(inputPath)) throw new Error(`Evaluation input does not exist: ${inputPath}`)
    return parseEvaluationRecords(inputPath)
      .filter((record) => selectedModels.size === 0 || selectedModels.has(record.model))
      .map((record) => recordToCandidate(record, path.basename(inputPath)))
  })
  const packet = createReviewPacket(candidates)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const templatePath = path.join(outDir, `content-review-template-${stamp}.csv`)
  const keyPath = path.join(outDir, `content-review-key-${stamp}.json`)
  const instructionsPath = path.join(outDir, `content-review-instructions-${stamp}.md`)
  fs.writeFileSync(templatePath, encodeReviewCsv(packet.rows), 'utf8')
  fs.writeFileSync(keyPath, `${JSON.stringify(packet.key, null, 2)}\n`, 'utf8')
  fs.writeFileSync(
    instructionsPath,
    packetInstructions(path.basename(templatePath), path.basename(keyPath)),
    'utf8',
  )
  const reviewerSpecs = parseList(readFlag(argv, '--reviewers'))
  const reviewerPaths = reviewerSpecs.map((specification) => {
    const [reviewerId, reviewerRole = 'physician'] = specification.split(':').map((value) => value.trim())
    if (!reviewerId) throw new Error(`Invalid --reviewers entry: ${specification}`)
    const rows = packet.rows.map((row) => ({
      ...row,
      reviewer_id: reviewerId,
      reviewer_role: reviewerRole || 'physician',
    }))
    const reviewerPath = path.join(
      outDir,
      `content-review-${safeFileToken(reviewerId)}-${stamp}.csv`,
    )
    fs.writeFileSync(reviewerPath, encodeReviewCsv(rows), 'utf8')
    return reviewerPath
  })
  console.log(JSON.stringify({
    templatePath,
    keyPath,
    instructionsPath,
    reviewerPaths,
    candidates: candidates.length,
  }))
}

function score(argv: string[]): void {
  const keyValue = readFlag(argv, '--key')
  const reviewValues = parseList(readFlag(argv, '--reviews'))
  if (!keyValue) throw new Error('--key is required in score mode')
  if (reviewValues.length === 0) throw new Error('--reviews must list at least one completed review CSV')
  const keyPath = path.resolve(ROOT, keyValue)
  const reviewPaths = reviewValues.map((value) => path.resolve(ROOT, value))
  const key = JSON.parse(fs.readFileSync(keyPath, 'utf8'))
  const reviewRows: ReviewTemplateRow[] = reviewPaths.flatMap((reviewPath) => (
    parseReviewCsv(fs.readFileSync(reviewPath, 'utf8'))
  ))
  const result = scoreContentAudit(key, reviewRows)
  const generatedAt = new Date().toISOString()
  const stamp = generatedAt.replace(/[:.]/g, '-')
  const outDir = path.resolve(ROOT, readFlag(argv, '--out-dir') ?? path.dirname(keyPath))
  fs.mkdirSync(outDir, { recursive: true })
  const reportPath = path.join(outDir, `content-audit-${stamp}.md`)
  const jsonPath = path.join(outDir, `content-audit-${stamp}.json`)
  fs.writeFileSync(reportPath, createContentAuditReport(result, generatedAt), 'utf8')
  fs.writeFileSync(jsonPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify({ reportPath, jsonPath, passed: result.passed }))
  if (!result.passed) process.exitCode = 2
}

export function main(argv = process.argv.slice(2)): void {
  const mode = readFlag(argv, '--mode') ?? 'generate'
  if (mode === 'generate') return generate(argv)
  if (mode === 'score') return score(argv)
  throw new Error('--mode must be generate or score')
}

if (require.main === module) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
