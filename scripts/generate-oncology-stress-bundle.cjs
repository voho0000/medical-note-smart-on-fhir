#!/usr/bin/env node
// Entirely fabricated data: never reads a real/demo patient, uses a network,
// or writes into public/. This is a volume fixture, NOT a treatment reference.
const fs = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')

const AS_OF = '2026-09-03T00:00:00Z'
const PATIENT_ID = 'synthetic-oncology-million-token-v1'
const BASE_URL = 'https://synthetic.example.invalid/fhir'
const SUBJECT = { reference: `Patient/${PATIENT_ID}` }
const WARNING = 'SYNTHETIC PERFORMANCE FIXTURE. No real person or source chart. Not for clinical decisions.'
const TAG = { system: `${BASE_URL}/tags`, code: 'synthetic-test-data', display: WARNING }
const LOINC = 'http://loinc.org'
const ICD = 'http://hl7.org/fhir/sid/icd-10-cm'
const RXNORM = 'http://www.nlm.nih.gov/research/umls/rxnorm'
const UCUM = 'http://unitsofmeasure.org'
const cc = (system, code, display) => ({ coding: [{ system, code, display }], text: display })
const ref = (resourceType, id) => ({ reference: `${resourceType}/${id}` })
const day = (offset) => new Date(Date.parse('2018-04-01T08:00:00Z') + offset * 86_400_000).toISOString()
// Dates anchored to AS_OF, for the outpatient medication mix. The encounter
// grid above is anchored to 2018-04-01 instead, so a "days before asOf" offset
// is the only way to place a record at a known recency.
const beforeAsOf = (days) => new Date(Date.parse(AS_OF) - days * 86_400_000).toISOString()
const escape = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
const narrative = (paragraphs) => ({ status: 'generated', div: `<div xmlns="http://www.w3.org/1999/xhtml">${paragraphs.map(p => `<p>${escape(p)}</p>`).join('')}</div>` })

// Kept dependency-free for the generator; verification compares this with the
// application's actual estimator on decoded document bodies, NOT raw JSON.
function estimateTokens(text) {
  const cjk = (text.match(/[\u4e00-\u9fa5]/g) || []).length
  return Math.ceil(cjk / 1.5 + (text.length - cjk) / 4)
}

const REASONS = [
  ['D70.9', 'Neutropenia with fever'], ['C50.919', 'Metastatic breast cancer reassessment'],
  ['J18.9', 'Pneumonia'], ['N17.9', 'Acute kidney injury'],
  ['D64.9', 'Symptomatic anemia'], ['R11.2', 'Nausea and vomiting'],
  ['G89.3', 'Cancer-related pain'], ['J90', 'Pleural effusion'],
]
const LABS = [
  ['718-7', 'Hemoglobin', 'g/dL', 7.2, 12.8, 12, 16],
  ['6690-2', 'Leukocytes', '10*3/uL', 0.7, 14, 4, 10],
  ['751-8', 'Neutrophils absolute', '10*3/uL', 0.2, 8, 1.5, 7.5],
  ['777-3', 'Platelets', '10*3/uL', 35, 340, 150, 400],
  ['4544-3', 'Hematocrit', '%', 23, 38, 36, 46],
  ['2951-2', 'Sodium', 'mmol/L', 128, 143, 135, 145],
  ['2823-3', 'Potassium', 'mmol/L', 2.8, 5.4, 3.5, 5.1],
  ['2075-0', 'Chloride', 'mmol/L', 92, 109, 98, 107],
  ['2160-0', 'Creatinine', 'mg/dL', 0.7, 2.6, 0.5, 1.1],
  ['3094-0', 'Urea nitrogen', 'mg/dL', 12, 49, 7, 20],
  ['1742-6', 'Alanine aminotransferase', 'U/L', 16, 146, 7, 35],
  ['1920-8', 'Aspartate aminotransferase', 'U/L', 18, 160, 10, 35],
  ['1975-2', 'Total bilirubin', 'mg/dL', 0.4, 2.8, 0.2, 1.2],
  ['1751-7', 'Albumin', 'g/dL', 2.4, 3.9, 3.5, 5],
  ['17861-6', 'Calcium', 'mg/dL', 7.9, 11.4, 8.6, 10.2],
  ['1988-5', 'C reactive protein', 'mg/L', 2, 140, 0, 5],
  ['2345-7', 'Glucose', 'mg/dL', 75, 235, 70, 99],
  ['2093-3', 'Cholesterol', 'mg/dL', 110, 240, 0, 200],
]
// Outpatient medication mix, invented for this fixture. The 768 encounter-linked
// orders below are all `completed` historical inpatient courses; on their own
// they leave the "currently evidenced" and "recently ended" medication groups
// permanently empty, so a chronic outpatient layer is generated as well.
// [RxNorm ingredient code, display, sig, days before asOf the original chronic
//  order was authored (14-30 months), days before asOf the latest refill claim].
const LONG_TERM_MEDICATIONS = [
  ['17767', 'Amlodipine', '5 mg PO daily', 912, 12],
  ['83367', 'Atorvastatin', '20 mg PO at night', 806, 12],
  ['1364430', 'Apixaban', '5 mg PO twice daily', 700, 19],
  ['40790', 'Pantoprazole', '40 mg PO daily', 610, 19],
  ['10582', 'Levothyroxine sodium', '75 mcg PO every morning', 520, 26],
  ['72965', 'Letrozole', '2.5 mg PO daily', 430, 26],
]
// Short supportive-care courses authored inside the last three months whose
// recorded days supply ran out 11-38 days before asOf.
// [RxNorm ingredient code, display, sig, days before asOf authored, days supply].
const RECENTLY_ENDED_MEDICATIONS = [
  ['3264', 'Dexamethasone', '4 mg PO twice daily with systemic treatment', 52, 14],
  ['2551', 'Ciprofloxacin', '500 mg PO twice daily', 35, 7],
  ['68442', 'Filgrastim', '300 mcg SC daily', 26, 7],
  ['26225', 'Ondansetron', '8 mg PO twice daily as needed', 25, 14],
]
const CONTINUOUS_THERAPY = cc('http://terminology.hl7.org/CodeSystem/medicationrequest-course-of-therapy',
  'continuous', 'Continuous long term therapy')
const supplyDays = (value) => ({ expectedSupplyDuration: { value, unit: 'd', system: UCUM, code: 'd' } })

const TREATMENT_ERAS = [
  'endocrine-based systemic treatment after metastatic recurrence',
  'a subsequent endocrine and targeted treatment phase',
  'single-agent cytotoxic treatment after documented progression',
  'another systemic treatment phase with recurrent toxicity-related interruptions',
  'late-line systemic treatment assessment with increasing supportive-care needs',
]
function era(index) { return TREATMENT_ERAS[Math.min(4, Math.floor(index / 20))] }
// Hoisted so the discharge-summary template can name the same institution the
// Encounter's serviceProvider carries. The deduplication key is still resolved
// from the Encounter (serviceProvider + first ICD), never from this text.
const ORGANIZATIONS = ['合成測試腫瘤中心Ａ', '合成測試區域醫院Ｂ', '合成測試支持照護中心Ｃ']
const ORGANIZATION_DEPARTMENTS = ['腫瘤內科', '血液腫瘤科', '安寧共同照護科']
function labValue(admission, dateIndex, labIndex) {
  const [, , , low, high] = LABS[labIndex]
  const phase = ((admission * 37 + dateIndex * 19 + labIndex * 11) % 101) / 100
  return Number((low + phase * (high - low)).toFixed(labIndex < 5 ? 1 : 2))
}

// Discharge summaries follow the Taiwanese NHI 出院病摘 layout so the fixture
// exercises the application's key-section extractor the same way a real
// 出院病摘 does: an administrative header block of tab-separated `欄位：值`
// table rows, then the standard section headers. Long 病史 / 理學檢查發現 /
// 檢驗 / 特殊檢查 / 醫療影像檢查 blocks are the bulk the extractor is expected
// to drop; 診斷 / 手術 / 病理 / 住院治療經過 / 出院指示 are what it keeps.
// Only the FORM STRUCTURE is modelled — every value below is fabricated and no
// real or de-identified chart text was copied.
//
// One line per array element: `narrative()` wraps each in <p>, and the
// application's stripHtmlToText turns that back into one text line, preserving
// the interior tabs that make a table row parse as `header\tvalue`.
function dischargeSummaryLines(admission) {
  const organization = ORGANIZATIONS[admission % ORGANIZATIONS.length]
  const department = ORGANIZATION_DEPARTMENTS[admission % ORGANIZATION_DEPARTMENTS.length]
  const [icdCode, reason] = REASONS[admission % REASONS.length]
  const episode = String(admission + 1).padStart(3, '0')
  const admitDate = day(admission * 32).slice(0, 10)
  const dischargeDate = day(admission * 32 + 13).slice(0, 10)
  const procedureDate = day(admission * 32 + 5).slice(0, 10)
  const imagingDate = day(admission * 32 + 2).slice(0, 10)
  const endoscopyDate = day(admission * 32 + 4).slice(0, 10)
  const invasive = admission % 2 === 0
  const oncologyAdmission = admission % REASONS.length === 1
  const sites = admission < 40 ? '骨轉移' : admission < 70 ? '骨及肝轉移' : '骨、肝及肋膜轉移'
  const sitesEn = admission < 40 ? 'bone only' : admission < 70 ? 'bone and liver' : 'bone, liver and pleura'
  const hb = labValue(admission, 13, 0)
  const anc = labValue(admission, 13, 2)
  const platelet = labValue(admission, 13, 3)
  const creatinine = labValue(admission, 13, 8)
  const albumin = labValue(admission, 13, 13)
  const crp = labValue(admission, 13, 15)
  const pain = 2 + (admission % 6)
  const lesion = (12 + admission * 0.3).toFixed(1)
  const weight = (52 + (admission % 9) * 0.7).toFixed(1)
  const height = (155 + (admission % 5)).toFixed(1)
  const labDates = [1, 6, 13].map(d => day(admission * 32 + d).slice(5, 10))
  // Tab-separated rows, the shape the NHI form renders as a table.
  const labRow = (labIndex) => {
    const [, display, unit] = LABS[labIndex]
    return [`${display} ${unit}`, ...[1, 6, 13].map(d => labValue(admission, d, labIndex))].join('\t')
  }
  const dischargeMedications = [
    ['Ondansetron 8mg/tab', 7, '1 tab', 'BID PRN'],
    ['Acetaminophen 500mg/tab', 14, '1 tab', 'QID PRN'],
    ['Sennoside 12mg/tab', 14, '2 tab', 'HS'],
    ['Pantoprazole 40mg/tab', 14, '1 tab', 'QD'],
    [invasive ? 'Cefuroxime 500mg/tab' : 'Gabapentin 100mg/cap', 5, '1 tab', 'TID'],
  ]
  return [
    organization,
    '出院病摘',
    `${WARNING} 合成癌症壓力測試；非真實病人。 Encounter SYN-${episode}; discharge summary; ${admitDate} to ${dischargeDate}.`,
    `病患姓名：合成癌症測試病人（非真人）\t身分證字號：SYNTHETIC-NOT-A-NATIONAL-ID\t性別：女`,
    `出生日期：1968-06-15\t病歷號碼：SYN-${episode}\t住院日期：${admitDate}`,
    `出院日期：${dischargeDate}\t出院科別：${department}\t病房床號：SYN-${episode}A`,
    `醫療機構名稱：${organization}\t醫療機構代碼：SYN-ORG-${admission % 3}\t記錄日期：${dischargeDate}`,
    `醫事人員：SYNTHETIC TEST CLINICIAN\t轉入醫院：\t轉出醫院：`,
    '住院臆斷',
    `1.${reason} (ICD-10-CM ${icdCode}), suspected on admission and re-evaluated during this stay`,
    '[underlying disease]',
    `. Hormone-receptor-positive, HER2-negative breast carcinoma; metastatic sites before this admission: ${sitesEn}`,
    '. Type 2 diabetes mellitus; hypertension; chronic anemia of malignancy',
    '出院診斷',
    `1.${reason} (ICD-10-CM ${icdCode})`,
    '2.Breast carcinoma with metastatic recurrence (ICD-10-CM C50.919)',
    `3.${sites} (影像追蹤中，本次住院未新增轉移部位)`,
    '[underlying disease]',
    '. Type 2 diabetes mellitus, ICD-10-CM E11.9',
    '. Hypertension, ICD-10-CM I10',
    '癌症期別',
    `原發部位 Breast；本次住院未重新分期，轉移範圍：${sites}。合成資料，不得作為臨床分期依據。`,
    '主訴',
    `${reason} for the past few days before this admission.`,
    '病史',
    'This is a fabricated 50-something female with hormone-receptor-positive, HER2-negative breast carcinoma and metastatic recurrence documented before the start of this longitudinal test chart.',
    `The record follows ${era(admission)}. Prior breast surgery and adjuvant radiation are historical events and were not repeated here.`,
    `She was admitted through the emergency department because of ${reason.toLowerCase()}, with reduced oral intake and fatigue.`,
    `Pain over a previously involved bone site was graded ${pain} out of 10 on arrival and was worse with activity. She denied haemoptysis, melena, syncope and new focal weakness.`,
    'Past history includes type 2 diabetes mellitus, hypertension and chronic anemia; the only recorded allergy is an unconfirmed contrast-associated rash.',
    '理學檢查發現',
    `身高: ${height}`,
    `體重: ${weight}`,
    `BMI: ${(Number(weight) / ((Number(height) / 100) ** 2)).toFixed(2)}`,
    'Physical examination:',
    'General appearance: chronically ill-looking but conversational, cooperative, oriented to person, place and time',
    'HEENT:',
    '- Eyes: conjunctiva pale(+), sclera anicteric, pupils isocoric and reactive',
    '- Mouth, Throat and Neck: dry mucosa, ulceration(-), supple, lymphadenopathy(-), goiter(-)',
    'Chest:',
    '- Inspection: symmetric expansion, implanted port over the right anterior chest wall, skin intact',
    '- Auscultation: breath sounds symmetric, crackles(-), wheezes(-), rhonchi(-), stridor(-)',
    'Heart: regular heart beat, murmur(-), gallop(-), pericardial friction rub(-)',
    'Abdomen: flat, normoactive bowel sounds, soft, tenderness(-), guarding(-), palpable mass(-)',
    'Back: knocking tenderness right(-)/left(-), focal thoracolumbar tenderness(+)',
    'Extremities: freely movable, pulses intact, pitting edema(-), calf tenderness(-)',
    'Neurologic: no new focal deficit, muscle power 5/5, reflexes symmetric',
    'Skin: fair turgor, rash(-), jaundice(-), petechiae(-)',
    '檢驗',
    '血液及生化（合成數值；同一列為三個住院採檢日）',
    `Name\t${labDates.join('\t')}`,
    // A representative panel, not all 18 analytes: the full series already
    // exists as structured Observations for every hospital day.
    ...LABS.slice(0, 8).map((_, index) => labRow(index)),
    '細菌培養：Blood culture x 2 sets - no growth in 5 days. Urine culture - no growth.',
    '尿液檢查：protein trace, WBC 0-2/HPF, RBC 0-2/HPF, nitrite negative. 凝血功能：PT 11.8 sec, INR 1.05, APTT 30.6 sec.',
    '所有檢驗值同時以結構化 Observation 保存；此段僅為表單完整性，不得作為判讀依據。',
    '特殊檢查',
    `檢查日期：${endoscopyDate}　檢查項目：${invasive ? 'Central venous access device assessment' : 'Rehabilitation functional assessment'}`,
    '--------------------------------',
    invasive
      ? '1. Indication: assessment of an existing implanted venous access device before continuing systemic treatment.'
      : '1. Indication: functional assessment of mobility, transfers and fall risk during an acute admission.',
    '2. Consent obtained from the fabricated patient and family; pre-procedure assessment uneventful.',
    invasive
      ? '3. Findings: device reservoir intact, overlying skin without inflammatory change, blood return adequate.'
      : '3. Findings: independent indoor ambulation, reduced endurance, one near-fall, no new focal deficit.',
    '4. Acute complication: non',
    'Impression:',
    invasive
      ? 'Functioning implanted venous access device, no infective change at the exit site'
      : 'Deconditioning related to the acute admission, no new neurologic deficit',
    'Recommendation: correlate with the clinical course and the dated structured records.',
    '醫療影像檢查',
    `檢查日期：${imagingDate}　項目：CT chest abdomen pelvis with contrast（合成報告）`,
    '--------------------------------',
    '＜報告內容＞',
    `LUNGS AND PLEURA: ${admission < 70 ? 'no pleural nodularity or measurable pleural lesion; trace dependent fluid may vary between examinations.' : 'small left pleural effusion with irregular pleural thickening, similar to the recent comparison study.'}`,
    `LIVER: ${admission < 40 ? 'no definite focal hepatic metastatic lesion; a small low-density cyst is unchanged.' : `indexed segment VI lesion measures ${lesion} mm on the same plane as the previous examination.`}`,
    `BONES: multifocal mixed sclerotic osseous lesions in the thoracolumbar spine and pelvis; indexed iliac lesion measures ${lesion} mm. No new displaced fracture.`,
    'OTHER: no bowel obstruction, no free air, no collection, no hydronephrosis.',
    `IMPRESSION: known ${sitesEn} abnormalities with the above serial measurements and no new acute abdominal process. No validated RECIST category is assigned.`,
    ...(oncologyAdmission
      ? [
        '病理報告',
        `檢體：${admission < 40 ? 'iliac bone core biopsy' : admission < 70 ? 'liver core biopsy' : 'pleural tissue biopsy'}，病理編號 SYN-PATH-${episode}。`,
        'MICROSCOPIC DESCRIPTION: infiltrating malignant epithelial cells in irregular nests within fibrous stroma, with moderate nuclear pleomorphism and visible nucleoli.',
        'IMMUNOPHENOTYPE: epithelial and breast-lineage markers expressed, estrogen receptor retained, progesterone receptor heterogeneous, HER2 immunohistochemistry scored 1+.',
        'DIAGNOSIS: metastatic carcinoma compatible with the documented breast primary. The diagnosis applies to the sampled site only and assigns no imaging response category.',
        'LIMITATION: fragmented core material; margins and lymph-node status are not assessable. Invented observations, not a validated biomarker assay.',
      ]
      : []),
    '手術日期及方法',
    ...(invasive
      ? [
        `${procedureDate}　Central venous access assessment and device care under local anaesthesia.`,
        'The existing implanted port was assessed, flushed and confirmed patent. No new device was placed and no tissue was excised during this admission.',
      ]
      // The biopsy is what the 病理報告 section reports on, so the two sections
      // stay consistent for the oncology-reassessment admissions.
      : oncologyAdmission
        ? [`${procedureDate}　Image-guided percutaneous core biopsy under local anaesthesia; tissue submitted to pathology (SYN-PATH-${episode}).`]
        : ['Nil。本次住院未執行侵入性手術；復健功能評估已記錄於特殊檢查與住院治療經過。']),
    '住院治療經過',
    `This fabricated patient was admitted on ${admitDate} for ${reason.toLowerCase()} against a background of metastatic breast carcinoma under ${era(admission)}.`,
    'Initial management consisted of intravenous hydration, antiemetic and analgesic support, and review of the systemic treatment schedule.',
    `Serial blood counts were followed; the nadir absolute neutrophil count was ${anc} 10*3/uL, with haemoglobin ${hb} g/dL, platelets ${platelet} 10*3/uL, creatinine ${creatinine} mg/dL and albumin ${albumin} g/dL at discharge, and C-reactive protein settling to ${crp} mg/L.`,
    'Empirical antibiotics were started while cultures were outstanding and stopped once they remained negative and the fever curve settled.',
    `Pain was controlled with a fixed analgesic schedule and rescue doses, and the reported score fell from ${pain} out of 10 on admission to a level tolerated during walking after physiotherapy review.`,
    'Systemic treatment was held during the acute phase and the decision to resume was deferred to the outpatient review. The patient was stable for discharge on the planned date.',
    '合併症與併發症',
    invasive
      ? 'Transient febrile episode during the first week, resolved without a documented source. No catheter-related infection, no bleeding and no thromboembolic event during this admission.'
      : 'Nil。無導管相關感染、出血或血栓事件。',
    '出院指示',
    '1. 依出院帶藥服用，止吐與止痛藥依症狀使用；連續兩天無法進食或服藥請提前回診。',
    '2. 若發燒超過攝氏 38 度、寒顫、新發生呼吸困難或無法控制的疼痛，請立即至急診就醫。',
    '3. 注意人工血管周圍是否紅腫、疼痛或滲液；維持日常活動並避免跌倒。',
    '4. 全身性治療是否恢復由門診依當日檢驗決定；本病摘不代表任何治療處方。',
    '出院狀況',
    '病情穩定，可自行進食與室內行走，返家休養並門診追蹤。',
    '出院帶藥：',
    '藥名\t天數\t劑量\t用法',
    ...dischargeMedications.map(([name, days, dose, frequency]) => [name, days, dose, frequency].join('\t')),
    `${day(admission * 32 + 20).slice(0, 10)}　回診${department}（合成測試醫師）`,
    `${day(admission * 32 + 27).slice(0, 10)}　回診放射腫瘤科追蹤影像（合成測試醫師）`,
    '出院方式：一般出院返家，無轉院紀錄。',
  ]
}

// Progress notes only — discharge summaries use dischargeSummaryLines above.
// Distinct encounter/day/discipline/measurement values with stable prose. The
// repeated clinical templates are intentional and documented; this fixture is
// for import/render/context load testing, not independent clinical reasoning.
function noteParagraphs(admission, dateIndex, kind) {
  const stamp = day(admission * 32 + dateIndex).slice(0, 10)
  const reason = REASONS[admission % REASONS.length][1]
  const hb = labValue(admission, dateIndex, 0)
  const anc = labValue(admission, dateIndex, 2)
  const creat = labValue(admission, dateIndex, 8)
  const albumin = labValue(admission, dateIndex, 13)
  const pain = 2 + ((admission + dateIndex) % 6)
  const lesion = (12 + admission * 0.3 + ((dateIndex + admission) % 7)).toFixed(1)
  return [
    `${WARNING} 合成癌症壓力測試；非真實病人。 Encounter SYN-${String(admission + 1).padStart(3, '0')}; ${kind}; chart date ${stamp}; hospital day ${dateIndex + 1}.`,
    `Oncology history: this fabricated adult has hormone-receptor-positive, HER2-negative breast carcinoma with metastatic recurrence before the start of this longitudinal chart. The record follows ${era(admission)}. Prior breast surgery and radiation are historical events rather than new procedures at every visit. Bone disease is present throughout; liver involvement is added in the middle period and pleural disease in the later period. Historical and current findings are deliberately separated so temporal summarization can be checked.`,
    `Reason for this episode: ${reason}. The admission narrative distinguishes the presenting symptom from the underlying malignancy and from treatment toxicity. The chart contains repeated reassessments rather than a single clean diagnostic story. Current uncertainty is retained in the narrative; an abnormal test is not automatically attributed to progression. Comparison is made with the immediately preceding admission and the most recent outpatient review at the same synthetic institution.`,
    `Interval symptoms on ${stamp}: fatigue varies through the day and oral intake is reduced compared with baseline. Pain is recorded as ${pain} out of 10, with activity-related discomfort over a previously involved bone site. Nausea, bowel frequency, sleep disruption, and treatment-related sensory symptoms are documented separately. Symptoms in this paragraph describe this dated encounter only and should not silently replace the patient's condition on a later date.`,
    `Functional assessment: the patient alternates between independent basic activities and needing assistance during acute illness. Walking distance, transfers, fall concerns, and time spent resting are reviewed with the synthetic rehabilitation team. The record includes caregiver observations without names or contact details. A temporary decline during an admission is not coded as a permanent neurologic deficit. No new focal deficit is assumed merely because the malignancy is metastatic.`,
    `Examination summary: general appearance is tired but conversational during this review. Hydration, mucosal discomfort, respiratory effort, edema, line-site appearance, and areas of focal tenderness are considered independently. The examination is a dated qualitative stress-test narrative, not a substitute for the numerical observations linked to this encounter. Negative findings are limited to what is described; missing findings must remain unknown rather than being synthesized as normal.`,
    `Hematology: same-day synthetic hemoglobin is ${hb} g/dL and absolute neutrophil count is ${anc} 10*3/uL. Serial cell counts are linked as separate laboratory resources, including abnormal flags and reference intervals. Trends may reflect treatment exposure, intercurrent infection, hydration, or marrow involvement. This generated chart does not prove any particular explanation. Historical transfusion assessments are kept separate from completed procedures and from the current review.`,
    `Renal and metabolic review: creatinine is ${creat} mg/dL and albumin is ${albumin} g/dL on this chart date. Intake, losses, weight changes, electrolyte disturbances, and prior kidney function are reviewed together. A single creatinine value is not treated as proof of chronic kidney disease. Medication reconciliation notes renal monitoring concerns but deliberately omits actionable dose recommendations. Laboratory trends, rather than repeated copied diagnoses, should determine what a summary describes.`,
    `Infection review: this episode is indexed under ${reason}; the narrative separately considers infection symptoms, line-related concerns, and periods of marrow suppression. Microbiology may remain pending or negative in a real encounter, so this fictional note does not invent a pathogen merely to explain fever. The latest temperature observations and dated blood counts remain the primary structured sources. Treatment interruption and subsequent recovery are described as separate longitudinal events.`,
    `Imaging correlation: the indexed comparison lesion for this test episode measures ${lesion} mm. Reports distinguish bone, liver, lung, and pleural compartments rather than collapsing them into a single response label. The earliest chart period has no synthetic liver or pleural metastasis. Later reports add those sites explicitly. Measurements vary deterministically for software testing and are not a validated RECIST series; no response category should be calculated from these values for clinical use.`,
    `Treatment history reconciliation: the active narrative belongs to ${era(admission)}. Prior agents, temporary holds, and completed courses remain visible in the medication history. A historical prescription is not evidence that the patient is still receiving it. This fixture does not encode chemotherapy dosing or infusion preparation. Reconciliation separates antineoplastic exposure from symptom-control medication and from short courses used during acute episodes.`,
    `Toxicity and competing explanations: fatigue, nausea, sensory symptoms, cytopenias, and appetite change are reviewed against the treatment period and the acute admission problem. Their coexistence is not proof of a single mechanism. The case intentionally contains both improving and worsening laboratory snapshots across different dates, allowing the software to demonstrate whether it preserves chronology and avoids treating a years-old abnormality as the latest result.`,
    `Nutrition and rehabilitation: oral intake, weight trajectory, functional goals, constipation burden, and swallowing comfort are reviewed. Supportive needs fluctuate across this long course. Dietitian and therapy comments emphasize observed function and tolerability, without prescriptive meal plans or exercise targets. Where a field is missing, the summary should identify the gap. Notes from different synthetic hospitals may describe the same problem using different terminology.`,
    `Care coordination: the primary synthetic oncology team, a regional synthetic hospital, and a supportive-care center contribute separate records. This dated document records what was known at ${stamp}, not a consensus across all later visits. Transfer summaries and outpatient notes are retained so source attribution and institution-aware document deduplication can be exercised. No real institution, clinician, national identity number, address, telephone number, or source patient was used.`,
    `Assessment for episode ${admission + 1}, day ${dateIndex + 1}: metastatic malignancy with an intercurrent admission problem (${reason}), fluctuating symptom burden, and monitoring needs across several organ systems. The data contains competing priorities rather than a recommended regimen. The narrative, structured laboratory values, and imaging dates should be read together. Any apparent inconsistency in generated measurements is a limitation of a deterministic load fixture, not a hidden real-world clinical fact.`,
    `Disposition and follow-up documentation: this is an interval review within the indexed admission, not a discharge event. Subsequent appointments are represented by separate encounters. The chart includes a newer non-discharge document to test whether selecting the latest admission still retrieves the latest discharge summary rather than the newest arbitrary document.`,
  ]
}

function buildSyntheticOncologyBundle({ targetTokens = 1_250_000 } = {}) {
  if (!Number.isInteger(targetTokens) || targetTokens < 1 || targetTokens > 4_000_000) {
    throw new Error('targetTokens must be an integer between 1 and 4,000,000')
  }
  const resources = []
  const add = (resource) => {
    resources.push({ ...resource, meta: { tag: [TAG] } })
    return resource
  }
  add({ resourceType: 'Patient', id: PATIENT_ID, active: true,
    identifier: [{ system: `${BASE_URL}/synthetic-id`, value: 'SYNTHETIC-NOT-A-NATIONAL-ID-0001' }],
    name: [{ use: 'usual', text: '合成癌症測試病人（非真人）', family: 'SYNTHETIC', given: ['ONCOLOGY', 'TEST'] }],
    gender: 'female', birthDate: '1968-06-15', text: narrative([WARNING]) })
  const organizations = ORGANIZATIONS
  organizations.forEach((name, i) => add({ resourceType: 'Organization', id: `synthetic-org-${i}`, active: true, name }))
  add({ resourceType: 'Practitioner', id: 'synthetic-clinician', active: true, name: [{ text: 'SYNTHETIC TEST CLINICIAN' }] })
  const diagnosisDefinitions = [
    ['C50.919', 'Breast carcinoma with metastatic recurrence', 0],
    ['C79.51', 'Bone metastasis', 0], ['C78.7', 'Liver metastasis', 1280],
    ['C78.2', 'Pleural metastasis', 2240],
    ...REASONS.filter(([code]) => code !== 'C50.919').map(([code, text]) => [code, text, 0]),
    ['E11.9', 'Type 2 diabetes mellitus', 0], ['I10', 'Hypertension', 0],
  ]
  diagnosisDefinitions.forEach(([code, display, offset], i) => add({ resourceType: 'Condition', id: `synthetic-condition-${i}`,
    clinicalStatus: cc('http://terminology.hl7.org/CodeSystem/condition-clinical', 'active', 'Active'),
    verificationStatus: cc('http://terminology.hl7.org/CodeSystem/condition-ver-status', 'confirmed', 'Confirmed'),
    category: [cc('http://terminology.hl7.org/CodeSystem/condition-category', 'problem-list-item', 'Problem List Item')],
    code: cc(ICD, code, display), subject: SUBJECT, onsetDateTime: day(offset),
    note: [{ text: 'Fabricated longitudinal problem entry; not clinically validated.' }] }))
  const diagnosisId = (code) => `synthetic-condition-${diagnosisDefinitions.findIndex(([key]) => key === code)}`
  let documentBodyTokens = 0
  let dischargeCount = 0
  let progressCount = 0
  const addDocument = (admission, dateIndex, kind, sequence, attachment = false) => {
    const paragraphs = kind === 'Discharge summary'
      ? dischargeSummaryLines(admission)
      : noteParagraphs(admission, dateIndex, kind)
    const id = `synthetic-${kind === 'Discharge summary' ? 'discharge' : 'progress'}-${sequence}`
    const code = kind === 'Discharge summary' ? '18842-5' : '11506-3'
    const title = `${kind} / 合成測試 / episode ${admission + 1} / ${day(admission * 32 + dateIndex).slice(0, 10)}`
    const encounter = ref('Encounter', `synthetic-admission-${admission}`)
    const date = day(admission * 32 + dateIndex)
    documentBodyTokens += estimateTokens(paragraphs.join('\n'))
    if (attachment) {
      const bytes = Buffer.from(narrative(paragraphs).div, 'utf8')
      add({ resourceType: 'DocumentReference', id, status: 'current', docStatus: 'final', type: cc(LOINC, code, kind),
        subject: SUBJECT, date, author: [ref('Practitioner', 'synthetic-clinician')], description: title,
        custodian: ref('Organization', `synthetic-org-${admission % 3}`),
        context: { encounter: [encounter], period: { start: day(admission * 32), end: date } },
        content: [{ attachment: { contentType: 'text/html', language: 'en', title, creation: date, size: bytes.length, data: bytes.toString('base64') } }] })
    } else {
      add({ resourceType: 'Composition', id, status: 'final', type: cc(LOINC, code, kind), subject: SUBJECT, encounter,
        date, author: [ref('Practitioner', 'synthetic-clinician')], title,
        custodian: ref('Organization', `synthetic-org-${admission % 3}`),
        section: [{ title: kind, text: narrative(paragraphs) }] })
    }
  }
  for (let a = 0; a < 96; a++) {
    const [reasonCode, reasonText] = REASONS[a % REASONS.length]
    const encounter = ref('Encounter', `synthetic-admission-${a}`)
    const provider = { ...ref('Organization', `synthetic-org-${a % 3}`), display: organizations[a % 3] }
    add({ resourceType: 'Encounter', id: `synthetic-admission-${a}`, status: 'finished',
      class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'IMP', display: 'inpatient encounter' },
      subject: SUBJECT, period: { start: day(a * 32), end: day(a * 32 + 13) }, serviceProvider: provider,
      reasonCode: [cc(ICD, reasonCode, reasonText)], diagnosis: [{ condition: ref('Condition', diagnosisId(reasonCode)), rank: 1 }] })
    for (let d = 0; d < 14; d++) {
      for (let l = 0; l < LABS.length; l++) {
        const [code, display, unit, , , low, high] = LABS[l]
        const value = labValue(a, d, l)
        add({ resourceType: 'Observation', id: `synthetic-lab-${a}-${d}-${l}`, status: 'final',
          category: [cc('http://terminology.hl7.org/CodeSystem/observation-category', 'laboratory', 'Laboratory')],
          code: cc(LOINC, code, display), subject: SUBJECT, encounter, effectiveDateTime: day(a * 32 + d), performer: [provider],
          valueQuantity: { value, unit, system: 'http://unitsofmeasure.org', code: unit },
          referenceRange: [{ low: { value: low, unit }, high: { value: high, unit } }],
          interpretation: [cc('http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation', value < low ? 'L' : value > high ? 'H' : 'N', value < low ? 'Low' : value > high ? 'High' : 'Normal')] })
      }
      add({ resourceType: 'Observation', id: `synthetic-temperature-${a}-${d}`, status: 'final', subject: SUBJECT, encounter,
        category: [cc('http://terminology.hl7.org/CodeSystem/observation-category', 'vital-signs', 'Vital Signs')],
        code: cc(LOINC, '8310-5', 'Body temperature'), effectiveDateTime: day(a * 32 + d),
        valueQuantity: { value: Number((36.5 + ((a + d) % 8) * 0.3).toFixed(1)), unit: 'Cel', system: 'http://unitsofmeasure.org', code: 'Cel' } })
    }
    for (let r = 0; r < 2; r++) {
      const sites = a < 40 ? 'bone lesions; no focal liver lesion or pleural metastasis described' : a < 70 ? 'bone and liver lesions; no pleural metastasis described' : 'bone, liver and pleural lesions'
      add({ resourceType: 'DiagnosticReport', id: `synthetic-imaging-${a}-${r}`, status: 'final',
        category: [cc('http://terminology.hl7.org/CodeSystem/v2-0074', 'RAD', 'Radiology')],
        code: { text: r === 0 ? 'CT chest abdomen pelvis - synthetic comparison report' : 'MRI spine - synthetic comparison report' },
        subject: SUBJECT, encounter, effectiveDateTime: day(a * 32 + 2 + r * 7), performer: [provider],
        conclusion: `SYNTHETIC serial report ${a}-${r}. Comparison documents ${sites}. Indexed target ${Number(12 + a * 0.3 + r).toFixed(1)} mm. Treatment phase: ${era(a)}. No validated RECIST classification. This is fabricated stress-test content, not an interpretation of real images.` })
    }
    const medicines = ['letrozole', 'fulvestrant', 'capecitabine', 'paclitaxel', 'eribulin']
    const eraIndex = Math.min(4, Math.floor(a / 20))
    ;[medicines[eraIndex], 'ondansetron', 'acetaminophen', 'senna', 'polyethylene glycol', 'pantoprazole', 'metformin', 'amlodipine'].forEach((name, m) => {
      add({ resourceType: 'MedicationRequest', id: `synthetic-medication-${a}-${m}`, status: 'completed', intent: 'order', subject: SUBJECT, encounter,
        medicationCodeableConcept: { text: name }, authoredOn: day(a * 32), requester: ref('Practitioner', 'synthetic-clinician'),
        dosageInstruction: [{ text: 'Synthetic historical course; dose intentionally unspecified. Not an actionable prescription.', timing: { repeat: { boundsPeriod: { start: day(a * 32), end: day(a * 32 + 13) } } } }] })
    })
    add({ resourceType: 'Procedure', id: `synthetic-procedure-${a}`, status: 'completed', subject: SUBJECT, encounter,
      code: { text: a % 2 === 0 ? 'Central venous access assessment' : 'Supportive rehabilitation assessment' }, performedDateTime: day(a * 32 + 5) })
    addDocument(a, 13, 'Discharge summary', a, a % 2 === 1)
    dischargeCount++
    for (let v = 0; v < 3; v++) {
      add({ resourceType: 'Encounter', id: `synthetic-outpatient-${a}-${v}`, status: 'finished', subject: SUBJECT,
        class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB', display: 'ambulatory' },
        period: { start: day(a * 32 + 18 + v * 4), end: day(a * 32 + 18 + v * 4) }, serviceProvider: provider,
        reasonCode: [{ text: 'Synthetic oncology follow-up and symptom review' }] })
    }
  }
  // Chronic outpatient therapy in the shape a claims-style record carries it:
  // one open-ended continuous order authored 14-30 months before asOf, plus the
  // latest 90-day chronic-illness refill claim for the same drug. The original
  // order deliberately has no computable supply window, so it stays "current"
  // on its `active` status alone (the >1y-old active order case) while the
  // refill supplies the dated evidence; both share one sig so refill-cycle
  // collapsing is exercised. Fabricated regimen, not a treatment reference.
  LONG_TERM_MEDICATIONS.forEach(([code, display, sig, authoredDaysAgo, refillDaysAgo], m) => {
    const dosageInstruction = [{ text: `Synthetic long-term outpatient therapy: ${sig}. Fabricated record; not an actionable prescription.` }]
    add({ resourceType: 'MedicationRequest', id: `synthetic-medication-longterm-${m}`, status: 'active', intent: 'order',
      subject: SUBJECT, medicationCodeableConcept: cc(RXNORM, code, display), authoredOn: beforeAsOf(authoredDaysAgo),
      requester: ref('Practitioner', 'synthetic-clinician'), courseOfTherapyType: CONTINUOUS_THERAPY, dosageInstruction,
      dispenseRequest: { numberOfRepeatsAllowed: 12, validityPeriod: { start: beforeAsOf(authoredDaysAgo) } } })
    add({ resourceType: 'MedicationRequest', id: `synthetic-medication-refill-${m}`, status: 'active', intent: 'order',
      subject: SUBJECT, medicationCodeableConcept: cc(RXNORM, code, display), authoredOn: beforeAsOf(refillDaysAgo),
      requester: ref('Practitioner', 'synthetic-clinician'), courseOfTherapyType: CONTINUOUS_THERAPY, dosageInstruction,
      dispenseRequest: supplyDays(90) })
  })
  // Completed short courses whose recorded days supply ended shortly before
  // asOf, so the "recently ended" group is populated without being current.
  RECENTLY_ENDED_MEDICATIONS.forEach(([code, display, sig, authoredDaysAgo, days], m) => {
    add({ resourceType: 'MedicationRequest', id: `synthetic-medication-recent-${m}`, status: 'completed', intent: 'order',
      subject: SUBJECT, medicationCodeableConcept: cc(RXNORM, code, display), authoredOn: beforeAsOf(authoredDaysAgo),
      requester: ref('Practitioner', 'synthetic-clinician'), dispenseRequest: supplyDays(days),
      dosageInstruction: [{ text: `Synthetic completed short course: ${sig}. Fabricated record; not an actionable prescription.` }] })
  })
  // Round-robin across years, so a larger target does not concentrate every
  // extra document into one historical admission. Two disciplines per day.
  for (let slot = 0; documentBodyTokens < targetTokens && slot < 28; slot++) {
    for (let a = 0; a < 96 && documentBodyTokens < targetTokens; a++) {
      addDocument(a, Math.floor(slot / 2), slot % 2 === 0 ? 'Oncology progress note' : 'Supportive-care progress note', `${a}-${slot}`)
      progressCount++
    }
  }
  if (documentBodyTokens < targetTokens) throw new Error('Requested target exceeds available dated note slots')
  add({ resourceType: 'Composition', id: 'synthetic-newest-non-discharge', status: 'final',
    type: { text: 'Non-discharge administrative follow-up note' }, subject: SUBJECT, date: '2026-09-02T08:00:00Z',
    author: [ref('Practitioner', 'synthetic-clinician')], title: '合成測試：比最新出院病摘更晚的非住院文件',
    section: [{ title: 'Selection regression sentinel', text: narrative([WARNING, 'This is deliberately newer than every discharge summary. It must not replace the latest discharge summary when latestAdmission mode is selected. This administrative document is not a new cancer diagnosis or treatment decision.']) }] })
  add({ resourceType: 'AllergyIntolerance', id: 'synthetic-allergy-contrast', patient: SUBJECT,
    clinicalStatus: cc('http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical', 'active', 'Active'),
    verificationStatus: cc('http://terminology.hl7.org/CodeSystem/allergyintolerance-verification', 'unconfirmed', 'Unconfirmed'),
    code: { text: 'Reported prior contrast-associated rash, unconfirmed synthetic history' },
    reaction: [{ manifestation: [{ text: 'Rash' }], severity: 'mild' }] })
  add({ resourceType: 'CarePlan', id: 'synthetic-care-plan', status: 'active', intent: 'plan', subject: SUBJECT,
    title: 'Synthetic multidisciplinary oncology and supportive-care plan', description: WARNING,
    period: { start: '2026-08-01' }, addresses: [ref('Condition', 'synthetic-condition-0')] })
  const bundle = { resourceType: 'Bundle', id: 'synthetic-oncology-stress-v1', meta: { tag: [TAG] }, type: 'collection', timestamp: AS_OF,
    entry: resources.map(resource => ({ fullUrl: `${BASE_URL}/${resource.resourceType}/${resource.id}`, resource })) }
  return { bundle, manifest: { generatorVersion: 1, seed: 'deterministic-arithmetic-v1', asOf: AS_OF,
    syntheticOnly: true, warning: WARNING, targetDocumentTokens: targetTokens, estimatedDocumentBodyTokens: documentBodyTokens,
    tokenMetric: 'MediPrisma heuristic on decoded plain-text document bodies, before selection/compression; NOT a model-specific tokenizer.',
    resourceCounts: resources.reduce((counts, resource) => { counts[resource.resourceType] = (counts[resource.resourceType] || 0) + 1; return counts }, {}),
    dischargeSummaries: dischargeCount, progressNotes: progressCount, latestDischargeId: 'synthetic-discharge-95',
    medicationMix: { historicalCompletedCourses: 96 * 8, longTermActiveOrders: LONG_TERM_MEDICATIONS.length,
      chronicRefillClaims: LONG_TERM_MEDICATIONS.length, recentlyEndedCourses: RECENTLY_ENDED_MEDICATIONS.length,
      note: 'Long-term orders and refills are dated relative to asOf; a reader far past asOf will see them age out of "currently evidenced".' },
    newestDocumentId: 'synthetic-newest-non-discharge',
    limitations: ['Intentionally inflated encounter density and templated prose, not a realistic utilization distribution.',
      'Clinical course and numeric trends are fabricated, not clinically validated or suitable for treatment guidance.',
      'No model-specific exact token claim; a 100K/150K fitted request should remain capped even though source documents exceed 1M.',
      'Reference/schema checks are not full HL7 validator certification.'] } }
}

function validateBundleReferences(bundle) {
  if (bundle.resourceType !== 'Bundle' || bundle.type !== 'collection') throw new Error('Expected FHIR collection Bundle')
  const ids = new Set()
  const fullUrls = new Set()
  for (const { resource, fullUrl } of bundle.entry) {
    const key = `${resource.resourceType}/${resource.id}`
    if (ids.has(key) || fullUrls.has(fullUrl)) throw new Error(`Duplicate identity: ${key}`)
    if (!/^[A-Za-z0-9.-]{1,64}$/.test(resource.id)) throw new Error(`Invalid FHIR id: ${key}`)
    ids.add(key); fullUrls.add(fullUrl)
  }
  let references = 0
  const walk = (value) => {
    if (!value || typeof value !== 'object') return
    if (typeof value.reference === 'string') {
      if (!ids.has(value.reference)) throw new Error(`Unresolved reference: ${value.reference}`)
      references++
    }
    Object.values(value).forEach(walk)
  }
  bundle.entry.forEach(({ resource }) => walk(resource))
  if (bundle.entry.filter(({ resource }) => resource.resourceType === 'Patient').length !== 1) throw new Error('Expected one synthetic patient')
  return { resourceCount: ids.size, resolvedReferences: references }
}

if (require.main === module) {
  const targetTokens = process.argv[2] === undefined ? 1_250_000 : Number(process.argv[2])
  const outputDirectory = path.resolve(__dirname, '..', 'artifacts', 'synthetic-oncology')
  const { bundle, manifest } = buildSyntheticOncologyBundle({ targetTokens })
  manifest.referenceValidation = validateBundleReferences(bundle)
  const json = JSON.stringify(bundle, null, 2) + '\n'
  manifest.jsonBytes = Buffer.byteLength(json)
  manifest.sha256 = createHash('sha256').update(json).digest('hex')
  fs.mkdirSync(outputDirectory, { recursive: true })
  const output = path.join(outputDirectory, `synthetic-oncology-${targetTokens}-tokens.fhir.json`)
  // Refuse to overwrite an existing fixture. Reproducibility can be checked by
  // comparing content; regenerating the same fixture is a harmless no-op.
  if (fs.existsSync(output) && fs.readFileSync(output, 'utf8') !== json) throw new Error(`Output already exists with different content: ${output}`)
  fs.writeFileSync(output, json)
  fs.writeFileSync(output.replace('.fhir.json', '.manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  console.log(JSON.stringify({ output, ...manifest }, null, 2))
}

module.exports = { buildSyntheticOncologyBundle, validateBundleReferences, estimateTokens }
