// Pre-generated AI snapshots for the DEMO bundle (示範資料, demo-patient-1).
//
// Why: the demo bundle is frozen, so its AI output is effectively a constant —
// re-generating it for every first-time visitor burns two AI calls per visit
// (and the visitor's free-tier quota) to recompute a known answer, and exposes
// the first impression to transient model failures. These snapshots are REAL
// AI-authored raw outputs (same schema the live models produce), written
// against the catalog keys that buildSourceCatalog() derives from
// public/demo/demo-bundle.json.
//
// They deliberately store the RAW pre-parse shape, NOT the finalized result:
// the hooks feed them through the exact same parse → finalize/verify pipeline
// as a live reply, so citation resolution, verification marking and navigation
// stay honest. If the demo bundle ever changes, stale citations surface as
// amber "unverified" pills — the visible signal to regenerate this file (run
// scripts/validate-demo-snapshots.ts, or just re-author).
//
// Scope guards (enforced by the hooks): demo patient + zh-TW locale + default
// model + no cached result. Switching model or pressing 重新產生 always runs a
// live call.
import type { MedicalSummaryAiResult } from '@/src/core/entities/medical-summary.entity'
import type { SafetyScanResultInput } from '@/src/core/entities/safety-alert.entity'

export const DEMO_PATIENT_ID = 'demo-patient-1'

type Audience = 'medical' | 'patient'

export const demoMedicalSummarySnapshots: Record<Audience, MedicalSummaryAiResult> = {
  medical: {
    headline: '94歲男性，慢性腎臟病第4期合併青光眼、攝護腺增生等多重慢性病，近期肺炎治療後追蹤中。',
    summary: [
      { text: '94歲男性，長期由多家院所共同照護。腎功能持續下降，最近一次', emphasis: false, sources: [] },
      { text: 'eGFR 32', emphasis: true, sources: ['L7'] },
      { text: '（2026-06-02；前值33→32），相當於', emphasis: false, sources: [] },
      { text: 'CKD 第4期', emphasis: true, sources: ['K1'] },
      { text: '，2024年起已納入Pre-ESRD照護計畫，並持續使用碳酸氫鈉與SGLT2抑制劑。', emphasis: false, sources: ['M9', 'M15'] },
      { text: '近一個月因', emphasis: false, sources: [] },
      { text: '肺炎', emphasis: true, sources: ['E3'] },
      { text: '於長青醫院門診治療（6/2胸部X光、口服藥物），5月底曾以虛弱、慢性咳嗽就診，需追蹤吸收情形。', emphasis: false, sources: ['L1', 'E4', 'E5'] },
      { text: '右眼原發性隅角開放性青光眼以', emphasis: false, sources: [] },
      { text: '四種眼藥水', emphasis: true, sources: ['M1', 'M2', 'M3', 'M4'] },
      { text: '控制，定期於嘉恩醫院眼科追蹤。', emphasis: false, sources: ['E1'] },
      { text: '另有良性攝護腺增生（藥局長期調劑）、甲狀腺機能低下（TSH 14.7，補充中）與高尿酸血症。', emphasis: false, sources: ['E6', 'M20', 'M13', 'M14'] },
      { text: '2026年初曾兩度因譫妄就診，目前仍使用抗膽鹼藥物', emphasis: false, sources: ['E10', 'E11'] },
      { text: '得舒妥', emphasis: true, sources: ['M19'] },
      { text: '，於高齡病人需特別留意。心臟方面有主動脈瓣疾患於門診追蹤，2020年曾因心絞痛住院。', emphasis: false, sources: ['E8', 'E18'] },
    ],
    problems: [
      { label: '慢性腎臟病（第4期）', basis: '照護計畫＋檢驗追蹤', kind: 'careplan', sources: ['K1', 'K2', 'L7'] },
      { label: '原發性隅角開放性青光眼', basis: '多次眼科就診及用藥', kind: 'diagnosis', sources: ['E1', 'E7', 'M1'] },
      { label: '良性攝護腺增生', basis: '藥局調劑', kind: 'medication', sources: ['E6', 'M20'] },
      { label: '甲狀腺機能低下', basis: '長期補充甲狀腺素', kind: 'medication', sources: ['M13', 'M27'] },
      { label: '高尿酸血症', basis: '長期降尿酸用藥', kind: 'medication', sources: ['M14', 'L15'] },
      { label: '肺炎（治療後追蹤中）', basis: '近期就診與影像', kind: 'diagnosis', sources: ['E3', 'L1'] },
      { label: '非風濕性主動脈瓣疾患', basis: '心臟科門診追蹤', kind: 'diagnosis', sources: ['E8', 'L29'] },
      { label: '譫妄病史', basis: '2026年初兩次就診', kind: 'diagnosis', sources: ['E10', 'E11'] },
      { label: '胃及十二指腸息肉', basis: '門診追蹤及腹部超音波', kind: 'diagnosis', sources: ['E9', 'L30'] },
    ],
    decisions: [
      {
        text: '進行藥物重整：核對醫院與藥局重複調劑之同成分藥品，並評估抗膽鹼藥物得舒妥之必要性。',
        urgency: 'high',
        rationale: '同成分慢性用藥同時於長青醫院與向陽藥局調劑；病人有譫妄病史仍使用tolterodine。',
        sources: ['M15', 'M29', 'M19', 'E10'],
      },
      {
        text: '持續追蹤腎功能與體液狀態，評估SGLT2抑制劑於CKD第4期之劑量與適應症。',
        urgency: 'high',
        rationale: 'eGFR 32 mL/min/1.73m2（2026-06-02），前值33→32持續下降。',
        sources: ['L7', 'M15', 'K1'],
      },
      {
        text: '安排肺炎治療後胸部影像追蹤，確認病灶吸收。',
        urgency: 'medium',
        rationale: '2026-06-03起門診治療肺炎，6/2胸部X光為治療前影像。',
        sources: ['E3', 'L1'],
      },
      {
        text: '複檢TSH並評估甲狀腺素劑量。',
        urgency: 'medium',
        rationale: 'TSH 14.7 uIU/mL（2026-01-14）偏高，顯示補充可能不足。',
        sources: ['M13'],
      },
      {
        text: '主動脈瓣疾患定期心臟科追蹤。',
        urgency: 'low',
        rationale: '2026-02-10門診追蹤，合併高齡與CKD屬高風險族群。',
        sources: ['E8', 'L29'],
      },
    ],
    timeline: [
      { ref: 'E1', label: '青光眼眼科門診追蹤', category: 'encounter' },
      { ref: 'E3', label: '肺炎門診治療', category: 'diagnosis' },
      { ref: 'L1', label: '胸部X光檢查', category: 'lab' },
      { ref: 'E6', label: '攝護腺增生藥局調劑', category: 'medication' },
      { ref: 'E8', label: '主動脈瓣疾患門診追蹤', category: 'encounter' },
      { ref: 'E10', label: '譫妄就診', category: 'diagnosis' },
      { ref: 'E13', label: '咳血住院', category: 'encounter' },
      { ref: 'E14', label: '肺炎住院', category: 'encounter' },
      { ref: 'E15', label: 'COVID-19住院', category: 'encounter' },
      { ref: 'E18', label: '心絞痛住院', category: 'encounter' },
      { ref: 'K1', label: 'Pre-ESRD照護計畫啟動', category: 'followup' },
      { ref: 'P1', label: '左眼玻璃體切除手術', category: 'procedure' },
    ],
  },
  patient: {
    headline: '您的腎臟功能需要持續照顧，最近的肺炎正在恢復中；這份摘要整理了您在各醫院的就醫紀錄。',
    summary: [
      { text: '您今年94歲，平時在多家醫院和診所看診。您的', emphasis: false, sources: [] },
      { text: '腎臟功能', emphasis: true, sources: ['K1'] },
      { text: '需要長期照顧：最近的抽血顯示腎絲球過濾率（eGFR，代表腎臟過濾血液的能力）約為32，醫院已為您安排腎臟照護計畫。', emphasis: false, sources: ['L7'] },
      { text: '最近您因為', emphasis: false, sources: [] },
      { text: '肺炎', emphasis: true, sources: ['E3'] },
      { text: '在長青醫院治療，之前也有咳嗽和容易疲倦的情況，請記得回診讓醫師確認恢復狀況。', emphasis: false, sources: ['E4', 'E5', 'L1'] },
      { text: '眼睛方面，您的', emphasis: false, sources: [] },
      { text: '青光眼', emphasis: true, sources: ['E1'] },
      { text: '目前用四種眼藥水控制，請按時點藥並定期回眼科檢查。', emphasis: false, sources: ['M1', 'M2', 'M3', 'M4'] },
      { text: '另外您有攝護腺肥大（在藥局領藥）、甲狀腺功能偏低（正在補充藥物）和尿酸偏高，這些都有持續用藥，情況穩定。', emphasis: false, sources: ['E6', 'M20', 'M13', 'M14'] },
      { text: '年初您曾有兩次因為突然意識混亂就醫，家人可以多留意類似情況，若再發生請盡快就醫。', emphasis: false, sources: ['E10', 'E11'] },
    ],
    problems: [
      { label: '慢性腎臟病', basis: '照護計畫追蹤', kind: 'careplan', sources: ['K1', 'K2', 'L7'] },
      { label: '青光眼', basis: '多次眼科就診', kind: 'diagnosis', sources: ['E1', 'E7', 'M1'] },
      { label: '攝護腺肥大', basis: '藥局長期領藥', kind: 'medication', sources: ['E6', 'M20'] },
      { label: '甲狀腺功能偏低', basis: '長期補充藥物', kind: 'medication', sources: ['M13'] },
      { label: '尿酸偏高', basis: '長期用藥', kind: 'medication', sources: ['M14'] },
      { label: '肺炎（恢復中）', basis: '近期就診與X光', kind: 'diagnosis', sources: ['E3', 'L1'] },
    ],
    decisions: [
      {
        text: '下次回診時，請問醫師：我在不同醫院和藥局拿的藥有沒有重複？需要調整嗎？',
        urgency: 'medium',
        rationale: '您同時在醫院與藥局領取成分相同的慢性病藥物。',
        sources: ['M15', 'M29', 'M19'],
      },
      {
        text: '請問醫師：我的腎功能最近的變化代表什麼？平常飲食和喝水需要注意什麼？',
        urgency: 'medium',
        rationale: '腎功能檢驗值顯示需要持續追蹤。',
        sources: ['L7', 'K1'],
      },
      {
        text: '請問醫師：肺炎好了之後，需要再照一次X光確認嗎？',
        urgency: 'low',
        rationale: '近期因肺炎治療，追蹤影像可確認恢復情形。',
        sources: ['E3', 'L1'],
      },
      {
        text: '請問醫師：甲狀腺藥的劑量需要調整嗎？什麼時候要再抽血？',
        urgency: 'low',
        rationale: '目前正在補充甲狀腺素，需要定期檢查。',
        sources: ['M13'],
      },
    ],
    timeline: [
      { ref: 'E1', label: '眼科回診（青光眼）', category: 'encounter' },
      { ref: 'E3', label: '肺炎治療', category: 'diagnosis' },
      { ref: 'L1', label: '胸部X光檢查', category: 'lab' },
      { ref: 'E6', label: '藥局領攝護腺藥', category: 'medication' },
      { ref: 'E8', label: '心臟瓣膜門診', category: 'encounter' },
      { ref: 'E10', label: '意識混亂就醫', category: 'diagnosis' },
      { ref: 'E14', label: '肺炎住院', category: 'encounter' },
      { ref: 'E15', label: '新冠肺炎住院', category: 'encounter' },
      { ref: 'K1', label: '腎臟照護計畫開始', category: 'followup' },
    ],
  },
}

export const demoSafetyScanSnapshots: Record<Audience, SafetyScanResultInput> = {
  medical: {
    scannedCount: 97,
    alerts: [
      {
        severity: 'high',
        title: 'SGLT2抑制劑於CKD第4期使用',
        detail:
          '病人eGFR 32 mL/min/1.73m2（2026-06-02），仍長期調劑福適佳（dapagliflozin）10mg；高齡合併腎功能不佳時需留意脫水、低血壓與腎功能惡化。',
        evidence: [
          'Estimated GFR: 32 mL/min/1.73m2（2026-06-02）',
          '福適佳膜衣錠10毫克（2026-06-02 調劑）',
        ],
        sources: ['L7', 'M15'],
        category: 'renal',
        recommendation: '確認適應症與劑量，監測腎功能、血壓與體液狀態。',
      },
      {
        severity: 'high',
        title: '抗膽鹼藥物用於有譫妄病史之高齡病人',
        detail:
          '94歲病人2026年1–2月兩度因譫妄就診，目前仍調劑得舒妥（tolterodine）4mg；抗膽鹼負荷可能誘發或加重認知混亂與跌倒風險。',
        evidence: [],
        sources: ['M19', 'E10', 'E11'],
        category: 'other',
        recommendation: '評估以其他機轉藥物取代或減量，並與家屬確認認知狀況。',
      },
      {
        severity: 'medium',
        title: '醫院與藥局重複調劑同成分慢性用藥',
        detail:
          '福適佳、福避痛、葉酸、便通樂等同成分藥品近期同時於長青醫院與向陽藥局調劑，領藥時間相近，需確認病人實際服用份量以避免重複。',
        evidence: [],
        sources: ['M15', 'M29', 'M14', 'M28', 'M12', 'M26'],
        category: 'duplicate',
        recommendation: '進行藥物重整，向病人確認實際用藥情形。',
      },
      {
        severity: 'medium',
        title: '發泡錠劑型之鈉負荷',
        detail:
          '愛克痰發泡錠600mg多次調劑；發泡錠含鈉量高，於CKD第4期及主動脈瓣疾患病人可能增加體液與血壓負擔。',
        evidence: [],
        sources: ['M6', 'M8', 'M17'],
        category: 'renal',
        recommendation: '評估改用非發泡劑型。',
      },
      {
        severity: 'low',
        title: '甲狀腺補充治療追蹤',
        detail: 'TSH 14.7 uIU/mL（2026-01-14）偏高，顯示補充可能不足；目前持續使用昂特欣100mcg。',
        evidence: [],
        sources: ['M13'],
        category: 'monitoring',
        recommendation: '安排TSH複檢並評估劑量。',
      },
    ],
  },
  patient: {
    scannedCount: 97,
    alerts: [
      {
        severity: 'high',
        title: '腎臟功能需要密切注意',
        detail:
          '您最近的腎功能檢查（eGFR 32）顯示腎臟過濾能力較低，而您有一種需要配合腎功能使用的藥物（福適佳）。',
        evidence: [],
        sources: ['L7', 'M15'],
        category: 'renal',
        recommendation: '請按時回腎臟科，並詢問醫師這個藥是否需要調整；平時避免自行服用止痛藥或草藥。',
      },
      {
        severity: 'medium',
        title: '有一種藥可能影響記憶與意識',
        detail: '您年初曾兩次因為突然意識混亂就醫，而目前使用的頻尿藥（得舒妥）在年長者可能加重這種情況。',
        evidence: [],
        sources: ['M19', 'E10'],
        category: 'other',
        recommendation: '請帶著藥袋詢問醫師是否需要調整，不要自行停藥。',
      },
      {
        severity: 'medium',
        title: '不同地方領的藥可能重複',
        detail: '您在醫院和藥局都領了成分相同的慢性病藥（例如福適佳、福避痛），如果同時服用可能過量。',
        evidence: [],
        sources: ['M15', 'M29', 'M14', 'M28'],
        category: 'duplicate',
        recommendation: '把所有藥袋帶去給醫師或藥師核對。',
      },
      {
        severity: 'low',
        title: '發泡錠含鹽分較高',
        detail: '您的化痰藥是發泡錠，含鈉（鹽分）較高，對腎臟和血壓可能有影響。',
        evidence: [],
        sources: ['M6', 'M8'],
        category: 'renal',
        recommendation: '可以詢問醫師是否改用一般錠劑。',
      },
    ],
  },
}
