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
const cc = (system, code, display) => ({ coding: [{ system, code, display }], text: display })
const ref = (resourceType, id) => ({ reference: `${resourceType}/${id}` })
const day = (offset) => new Date(Date.parse('2018-04-01T08:00:00Z') + offset * 86_400_000).toISOString()
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
const TREATMENT_ERAS = [
  'endocrine-based systemic treatment after metastatic recurrence',
  'a subsequent endocrine and targeted treatment phase',
  'single-agent cytotoxic treatment after documented progression',
  'another systemic treatment phase with recurrent toxicity-related interruptions',
  'late-line systemic treatment assessment with increasing supportive-care needs',
]
function era(index) { return TREATMENT_ERAS[Math.min(4, Math.floor(index / 20))] }
function labValue(admission, dateIndex, labIndex) {
  const [, , , low, high] = LABS[labIndex]
  const phase = ((admission * 37 + dateIndex * 19 + labIndex * 11) % 101) / 100
  return Number((low + phase * (high - low)).toFixed(labIndex < 5 ? 1 : 2))
}

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
    `Disposition and follow-up documentation: ${kind === 'Discharge summary' ? 'this closes the indexed admission; unresolved monitoring items are carried forward as historical discharge information' : 'this is an interval review within the indexed admission, not a discharge event'}. Subsequent appointments are represented by separate encounters. The chart includes a newer non-discharge document to test whether selecting the latest admission still retrieves the latest discharge summary rather than the newest arbitrary document.`,
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
  const organizations = ['合成測試腫瘤中心Ａ', '合成測試區域醫院Ｂ', '合成測試支持照護中心Ｃ']
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
    const paragraphs = noteParagraphs(admission, dateIndex, kind)
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
