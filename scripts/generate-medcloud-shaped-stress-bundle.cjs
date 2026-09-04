#!/usr/bin/env node
// Medcloud 2 -> FHIR bridge SHAPED volume fixture.
//
// Entirely fabricated: never reads a real or demo patient, never uses a
// network, never writes into public/. It reproduces the *output shape* of the
// medcloud2-FHIR-bridge (see docs/testing/medcloud-bridge-bundle-shape.md) —
// identifier systems, extension URLs, `status: unknown` medications, one
// Provenance per clinical resource — over an 8-year synthetic oncology story
// with HTN / DM / CKD / dyslipidemia comorbidity. It is a load fixture, NOT a
// treatment reference and NOT real bridge output.
const fs = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')
const {
  dischargeSummaryLines, REASONS, LABS, ORGANIZATIONS, ORGANIZATION_DEPARTMENTS,
  labValue, estimateTokens, validateBundleReferences,
} = require('./generate-oncology-stress-bundle.cjs')
const { reportBody } = require('./generate-cloud-oncology-stress-bundle.cjs')

// ---------------------------------------------------------------- constants
const AS_OF = '2026-09-03'
const CAPTURED_AT = '2026-09-03T01:00:00.000Z'
const GENERATED_AT = '2026-09-03T02:00:00.000Z'
const RUN_ID = 'synthetic-medcloud-oncology-v1'
const PATIENT_CONTEXT_HASH = createHash('sha256').update(RUN_ID).digest('hex')
const ADAPTER_VERSION = '0.9.5'
const SOURCE = 'https://medcloud2.nhi.gov.tw/'
const BRIDGE = 'https://cloud-wildcatch.invalid/fhir'
const CS = (name) => `${BRIDGE}/CodeSystem/${name}`
const SD = (name) => `${BRIDGE}/StructureDefinition/${name}`
const ICD = 'http://hl7.org/fhir/sid/icd-10-cm'
const LOINC = 'http://loinc.org'
const UCUM = 'http://unitsofmeasure.org'
const ATC = 'http://www.whocc.no/atc'
const V3_ACT = 'http://terminology.hl7.org/CodeSystem/v3-ActCode'
const V2_0074 = 'http://terminology.hl7.org/CodeSystem/v2-0074'
const OBS_CATEGORY = 'http://terminology.hl7.org/CodeSystem/observation-category'
const INTERPRETATION = 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation'
const NHI_PAYMENT = 'https://twcore.mohw.gov.tw/ig/twcore/CodeSystem/medical-service-payment-tw'
const NHI_MEDICATION = 'https://twcore.mohw.gov.tw/ig/twcore/CodeSystem/medication-nhi-tw'
const HIS_LOCAL_LAB = `${BRIDGE}/upstream-local/CodeSystem/his-local-lab`
const ADULT_SECTION = 'https://nhi-fhir-bridge.github.io/CodeSystem/adult-preventive-section'
const ADULT_RESULT = 'https://nhi-fhir-bridge.github.io/CodeSystem/adult-preventive-result'
const WARNING = 'SYNTHETIC MEDCLOUD-SHAPED FIXTURE. No real person, no real bridge capture. Not for clinical decisions.'

// The ten modules the bridge pipeline requests, in CORE_MODULE_DATASET_SCOPES order.
const MODULE_SCOPES = {
  IMUE0060: '/imu/api/imue0060/imue0060s02/get-data',
  IMUE0008: '/imu/api/imue0008/imue0008s02/get-data',
  IMUE0130: '/imu/api/imue0130/imue0130s02/get-data',
  IMUE0030: '/imu/api/imue0030/imue0030s02/get-data',
  IMUE0010: '/imu/api/imue0010/imue0010s02/get-data',
  IMUE0070: '/imu/api/imue0070/imue0070s02/get-data',
  IMUE0080: '/imu/api/imue0080/imue0080s02/get-data',
  IMUE0120: '/imu/api/imue0120/imue0120s01/pres-med-day',
  IMUE0140: '/imu/api/imue0140/imue0140s01/hpa-data',
  IMUE0150: '/imu/api/imue0150/imue0150s01/hpa-data',
}
const PAGE_TYPE_ORDER = ['encounters', 'observations', 'medications', 'diagnostic_reports',
  'procedures', 'document_references', 'service_requests']

// Volume knobs. Every clinical resource costs its own JSON *plus* ~400 tokens of
// bridge Provenance, so these are tuned against that tax, not against a flat
// bundle. ADMISSIONS matches the storyline helper's 32-day admission grid.
const ADMISSIONS = 96
const DUPLICATE_DISCHARGES = 24
const CHRONIC_CLINIC_VISITS = 60
const ONCOLOGY_FOLLOW_UPS = 32
const EMERGENCY_VISITS = 8
const LAB_DRAWS = 12
const INPATIENT_CXR_PER_ADMISSION = 1
const RESTAGING_ROUNDS = 26
const DENTAL_PROCEDURES = 12
const REHAB_PROCEDURES = 8
const PREVENTIVE_EVENTS = 3
// Refills switch from a real 28/30-day cadence to a 182-day sampling this many
// days before the drug's last row, so the multi-year history stays visible
// without every chronic order costing its own ~1.2K tokens of bridge JSON.
const CHRONIC_DENSE_WINDOW_DAYS = 620

// ------------------------------------------------------------------ helpers
const stableId = (...parts) => createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 32)
const PATIENT_ID = `mc-${PATIENT_CONTEXT_HASH.slice(0, 32)}`
const SUBJECT = { reference: `Patient/${PATIENT_ID}` }
const EPOCH = Date.parse('2018-04-01T00:00:00Z')
const day = (offset) => new Date(EPOCH + offset * 86_400_000).toISOString().slice(0, 10)
const beforeAsOf = (days) => new Date(Date.parse(`${AS_OF}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10)
// Deterministic integer noise; no Math.random anywhere in this generator.
const noise = (...parts) => parseInt(stableId(...parts).slice(0, 8), 16)
// Spread `count` items evenly across a day-offset range. Every series has to run
// right up to asOf, or the app's relative windows (6m labs, 1y imaging, 6m
// encounters) come up empty and the reduction ladder measures nothing.
const spread = (index, count, from, to) => from + Math.round((index * (to - from)) / Math.max(1, count - 1))
const escapeXml = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll('"', '&quot;')

const INSTITUTIONS = [
  { id: 'SYN-HOSP-A', name: ORGANIZATIONS[0], department: ORGANIZATION_DEPARTMENTS[0] },
  { id: 'SYN-HOSP-B', name: ORGANIZATIONS[1], department: ORGANIZATION_DEPARTMENTS[1] },
  { id: 'SYN-HOSP-C', name: ORGANIZATIONS[2], department: ORGANIZATION_DEPARTMENTS[2] },
  { id: 'SYN-CLINIC-D', name: '合成測試家庭醫學診所Ｄ', department: '家庭醫學科' },
].map((institution) => ({ ...institution, fhirId: stableId('nhi-medcloud', 'organization', institution.id) }))
const orgRef = (index) => ({
  display: INSTITUTIONS[index].name,
  reference: `Organization/${INSTITUTIONS[index].fhirId}`,
})

// Chronic comorbidity therapy, in the bridge's claims shape: repeated 28/30-day
// dispensing rows rather than one long order. [ATC7, NHI code, English label,
// Chinese label, ingredient, days supply, first refill day, last refill day].
const CHRONIC_DRUGS = [
  ['C08CA01', 'AC12345100', 'AMLODIPINE 5MG TABLET', '脈優錠５毫克', 'AMLODIPINE BESYLATE', 28, 40, 3070],
  ['C10AA05', 'AC23456100', 'ATORVASTATIN 20MG TABLET', '立普妥膜衣錠２０毫克', 'ATORVASTATIN CALCIUM', 30, 120, 3068],
  ['A10BA02', 'AC34567100', 'METFORMIN HCL 500MG TABLET', '庫魯化錠５００毫克', 'METFORMIN HYDROCHLORIDE', 28, 200, 3062],
  ['C09AA02', 'AC45678100', 'ENALAPRIL 5MG TABLET', '悅您定錠５毫克', 'ENALAPRIL MALEATE', 30, 320, 3064],
  ['A02BC02', 'AC56789100', 'PANTOPRAZOLE 40MG TABLET', '潘妥拉唑腸溶錠４０毫克', 'PANTOPRAZOLE SODIUM', 28, 900, 3066],
  ['L02BG04', 'AC67890100', 'LETROZOLE 2.5MG TABLET', '復乳納膜衣錠２．５毫克', 'LETROZOLE', 30, 1400, 3060],
]
// Short supportive-care courses attached to admissions and emergency visits.
const ACUTE_DRUGS = [
  ['A04AA01', 'AC78901100', 'ONDANSETRON 8MG TABLET', '樞復寧錠８毫克', 'ONDANSETRON HCL', 7],
  ['N02BE01', 'AC89012100', 'ACETAMINOPHEN 500MG TABLET', '普拿疼錠５００毫克', 'ACETAMINOPHEN', 14],
  ['J01MA02', 'AC90123100', 'CIPROFLOXACIN 500MG TABLET', '速博新錠５００毫克', 'CIPROFLOXACIN HCL', 7],
  ['H02AB02', 'AC01234100', 'DEXAMETHASONE 4MG TABLET', '得胖美松錠４毫克', 'DEXAMETHASONE', 5],
  ['A06AB06', 'AC11223100', 'SENNOSIDE 12MG TABLET', '番瀉苷錠１２毫克', 'SENNOSIDE A+B', 14],
]
// Long-running orders (90/120-day chronic-illness refills) — the "long-running
// order" bucket that must stay current on days-supply alone, not on `status`.
const LONG_RUNNING_DRUGS = [
  ['B01AF02', 'AC22334100', 'APIXABAN 5MG TABLET', '艾必克凝膜衣錠５毫克', 'APIXABAN', 90],
  ['H03AA01', 'AC33445100', 'LEVOTHYROXINE 75MCG TABLET', '昂特欣錠７５微公克', 'LEVOTHYROXINE SODIUM', 120],
]

// NHI lab panels: order code + Chinese panel name + member analytes (indices into
// the shared LABS table) + the HIS-local item name the bridge keeps alongside.
const LAB_PANELS = [
  { code: '08011C', name: '全套血液計數檢查 (CBC/DC)', loinc: '58410-2', analytes: [0, 1, 2, 3, 4] },
  { code: '09021C', name: '生化學檢查 (腎功能及電解質)', loinc: '24362-6', analytes: [5, 6, 7, 8, 9] },
  { code: '09029C', name: '生化學檢查 (肝功能及營養)', loinc: '24325-3', analytes: [10, 11, 12, 13, 14] },
  { code: '09040C', name: '生化學檢查 (發炎及代謝)', loinc: '24323-8', analytes: [15, 16, 17] },
]
const IMAGING_ORDERS = {
  CXR: ['32001C', '胸部Ｘ光攝影（單張）', 'RAD', '放射線診療普通檢查'],
  CT: ['33072B', '電腦斷層造影－有／無造影劑', 'RAD', '放射線診療特殊檢查'],
  MRI: ['33084B', '磁振造影檢查－有／無造影劑', 'RAD', '放射線診療特殊檢查'],
  US: ['19009C', '腹部超音波檢查', 'RAD', '超音波檢查'],
}
// Nine 成人預防保健 sections, in the bridge's fixed order.
const PREVENTIVE_SECTIONS = [
  ['general-examination', '一般檢查', [['身高', 'cm'], ['體重', 'kg'], ['腰圍', 'cm'], ['身體質量指數', 'kg/m2']]],
  ['blood-pressure', '血壓檢查', [['收縮壓', 'mmHg'], ['舒張壓', 'mmHg']]],
  ['blood-lipids', '血脂肪檢查', [['總膽固醇', 'mg/dL'], ['三酸甘油酯', 'mg/dL'], ['高密度脂蛋白膽固醇', 'mg/dL'], ['低密度脂蛋白膽固醇', 'mg/dL']]],
  ['blood-glucose', '血糖檢查', [['飯前血糖', 'mg/dL']]],
  ['renal-function', '腎功能檢查', [['血清肌酸酐', 'mg/dL'], ['估算腎絲球過濾率', 'mL/min/1.73m2']]],
  ['uric-acid', '尿酸檢查', [['尿酸', 'mg/dL']]],
  ['urinalysis', '尿液檢查', [['尿蛋白', ''], ['尿潛血', '']]],
  ['metabolic-syndrome', '代謝症候群檢查', [['代謝症候群風險因子數', '項']]],
  ['liver-function', '肝功能檢查', [['GOT', 'U/L'], ['GPT', 'U/L']]],
]

// -------------------------------------------------------------- the builder
function buildMedcloudShapedBundle({ extraRestagingRounds = 0 } = {}) {
  if (!Number.isInteger(extraRestagingRounds) || extraRestagingRounds < 0 || extraRestagingRounds > 200) {
    throw new Error('extraRestagingRounds must be an integer between 0 and 200')
  }
  const byPageType = Object.fromEntries(PAGE_TYPE_ORDER.map((key) => [key, []]))
  const provenances = []
  const counts = {}
  let narrativeTokens = 0

  /** Decorate + file a clinical resource, and mint its Provenance, exactly as the bridge does. */
  const emit = (pageType, module, resource, { merged = false } = {}) => {
    const tags = [
      ...(resource.meta?.tag ?? []),
      { system: CS('source-module'), code: module.toLowerCase() },
      { system: CS('adapter-version'), code: ADAPTER_VERSION },
      { system: CS('data-class'), code: 'clinical-reference' },
    ]
    resource.meta = { source: SOURCE, tag: tags }
    byPageType[pageType].push(resource)
    counts[resource.resourceType] = (counts[resource.resourceType] ?? 0) + 1
    const scope = MODULE_SCOPES[module]
    provenances.push({
      resourceType: 'Provenance',
      id: stableId(PATIENT_CONTEXT_HASH, 'provenance', RUN_ID, resource.resourceType, resource.id, ADAPTER_VERSION, module),
      meta: {
        source: SOURCE,
        tag: [
          { system: CS('source-module'), code: module.toLowerCase() },
          { system: CS('adapter-version'), code: ADAPTER_VERSION },
          { system: CS('source-dataset-scope'), code: stableId(module, scope), display: scope },
          { system: CS('source-captured-at'), code: CAPTURED_AT, display: 'Source captured at' },
        ],
      },
      target: [{ reference: `${resource.resourceType}/${resource.id}` }],
      recorded: GENERATED_AT,
      activity: {
        coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-DataOperation', code: 'CREATE', display: 'create' }],
        text: `Transform ${module} reference data to FHIR R4`,
      },
      agent: [{
        type: {
          coding: [{ system: 'http://terminology.hl7.org/CodeSystem/provenance-participant-type', code: 'assembler', display: 'Assembler' }],
          text: 'assembler',
        },
        who: { display: '雲端懷爾抓抓' },
      }],
      entity: [
        {
          role: 'source',
          what: {
            identifier: { system: `${BRIDGE}/sid/source-capture-artifact`, value: stableId(module, RUN_ID, 'capture') },
            display: `${module} capture artifact from ${scope}`,
          },
        },
        ...(merged ? [{
          role: 'source',
          what: {
            identifier: { system: `${BRIDGE}/sid/source-row-occurrence`, value: stableId(module, resource.id, 'row') },
            display: 'Opaque identity of a source row merged into the target resource',
          },
        }] : []),
      ],
    })
    return resource
  }

  // --- Patient + Organizations (never decorated, never given a Provenance) ---
  const patient = {
    resourceType: 'Patient',
    id: PATIENT_ID,
    meta: {
      source: SOURCE,
      tag: [{
        system: CS('data-class'), code: 'clinical-reference',
        display: 'MediCloud clinical reference data; not the legal medical record',
      }],
    },
    identifier: [{ use: 'secondary', system: `${BRIDGE}/IdentifierSystem/masked-tw-national-id`, value: 'SYNTHXXXX' }],
    name: [{ use: 'anonymous', text: '合成測試病人（非真人）' }],
    gender: 'female',
    birthDate: '1968-06-15',
  }
  const organizations = INSTITUTIONS.map((institution) => ({
    resourceType: 'Organization',
    id: institution.fhirId,
    meta: { source: SOURCE },
    identifier: [{ system: `${BRIDGE}/sid/medcloud-provider`, value: institution.id }],
    name: institution.name,
  }))

  // ------------------------------------------------------------- Encounters
  const encounterKind = (kind, code) => ({
    text: kind,
    coding: [{ system: 'https://nhi-fhir-bridge.github.io/CodeSystem/encounter-kind', code, display: kind }],
  })
  const encounterChannel = () => ({
    text: '雲端病歷',
    coding: [{ system: 'https://nhi-fhir-bridge.github.io/CodeSystem/encounter-channel', code: 'medcloud', display: '雲端病歷' }],
  })
  const reasonCode = (code, english, chinese) => ({
    coding: [{ system: ICD, code, display: english }],
    text: chinese,
  })

  const admissions = []
  for (let a = 0; a < ADMISSIONS; a++) {
    const institution = a % 3
    const [icd, english] = REASONS[a % REASONS.length]
    const start = day(a * 32)
    const end = day(a * 32 + 13)
    const id = stableId(PATIENT_ID, start, 'IMP', INSTITUTIONS[institution].id, `stay:${a}`)
    admissions.push({ a, id, institution, start, end, icd, english })
    emit('encounters', 'IMUE0070', {
      resourceType: 'Encounter',
      id,
      status: 'finished',
      class: { system: V3_ACT, code: 'IMP', display: 'inpatient encounter' },
      type: [encounterKind('住院', 'inpatient'), encounterChannel()],
      serviceType: { text: INSTITUTIONS[institution].department },
      subject: SUBJECT,
      period: { start, end },
      serviceProvider: orgRef(institution),
      reasonCode: [
        reasonCode(icd, english, `${icd.replace('.', '')} ${english}（合成診斷）`),
        reasonCode('C50.919', 'Breast carcinoma with metastatic recurrence', 'C50919 乳房惡性腫瘤併轉移復發'),
        reasonCode('E11.9', 'Type 2 diabetes mellitus', 'E119 第二型糖尿病'),
        reasonCode('N18.3', 'Chronic kidney disease stage 3', 'N183 慢性腎臟病第三期'),
      ],
      participant: [{ individual: { display: 'SYNTHETIC TEST CLINICIAN' } }],
      hospitalization: { dischargeDisposition: { text: '一般出院返家' } },
    }, { merged: true })
  }

  // Chronic comorbidity clinic at institution D, every 28 days across 8 years.
  const clinicVisits = []
  for (let v = 0; v < CHRONIC_CLINIC_VISITS; v++) {
    const start = day(spread(v, CHRONIC_CLINIC_VISITS, 30, 3065))
    const id = stableId(PATIENT_ID, start, INSTITUTIONS[3].id, 'chronic', `fseq:${v}`)
    clinicVisits.push({ v, id, start })
    emit('encounters', 'IMUE0008', {
      resourceType: 'Encounter',
      id,
      status: 'finished',
      class: { system: V3_ACT, code: 'AMB', display: 'ambulatory' },
      type: [encounterKind('門診', 'outpatient'), encounterChannel()],
      serviceType: { text: INSTITUTIONS[3].department },
      subject: SUBJECT,
      period: { start, end: start },
      serviceProvider: orgRef(3),
      reasonCode: [
        reasonCode('I10', 'Essential hypertension', 'I10 高血壓'),
        reasonCode('E11.9', 'Type 2 diabetes mellitus', 'E119 第二型糖尿病'),
        reasonCode('E78.5', 'Hyperlipidemia unspecified', 'E785 高血脂症'),
        reasonCode('N18.3', 'Chronic kidney disease stage 3', 'N183 慢性腎臟病第三期'),
      ],
    })
  }

  // Oncology follow-up at the admitting centre, ~18 days after each discharge.
  const followUps = []
  for (let f = ADMISSIONS - ONCOLOGY_FOLLOW_UPS; f < ADMISSIONS; f++) {
    const institution = f % 3
    const start = day(f * 32 + 18)
    const id = stableId(PATIENT_ID, start, INSTITUTIONS[institution].id, 'oncology', `fseq:${f}`)
    followUps.push({ f, id, start, institution })
    emit('encounters', 'IMUE0008', {
      resourceType: 'Encounter',
      id,
      status: 'finished',
      class: { system: V3_ACT, code: 'AMB', display: 'ambulatory' },
      type: [encounterKind('門診', 'outpatient'), encounterChannel()],
      serviceType: { text: INSTITUTIONS[institution].department },
      subject: SUBJECT,
      period: { start, end: start },
      serviceProvider: orgRef(institution),
      reasonCode: [reasonCode('C50.919', 'Breast carcinoma with metastatic recurrence', 'C50919 乳房惡性腫瘤併轉移復發')],
    })
  }

  const emergencies = []
  for (let e = 0; e < EMERGENCY_VISITS; e++) {
    const institution = e % 3
    const start = day(spread(e, EMERGENCY_VISITS, 60, 3050))
    const [icd, english] = REASONS[(e + 2) % REASONS.length]
    const id = stableId(PATIENT_ID, start, INSTITUTIONS[institution].id, 'emergency', `fseq:${e}`)
    emergencies.push({ e, id, start, institution, icd, english })
    emit('encounters', 'IMUE0008', {
      resourceType: 'Encounter',
      id,
      status: 'finished',
      class: { system: V3_ACT, code: 'EMER', display: 'emergency' },
      type: [encounterKind('急診', 'emergency'), encounterChannel()],
      subject: SUBJECT,
      period: { start, end: start },
      serviceProvider: orgRef(institution),
      reasonCode: [reasonCode(icd, english, `${icd.replace('.', '')} ${english}（合成診斷）`)],
    })
  }

  // ---------------------------------------------------- MedicationRequests
  const basics = []
  const medicationCounts = { chronicRefills: 0, acuteCourses: 0, longRunningOrders: 0 }
  const addMedication = (options) => {
    const { module, drug, authoredOn, days, encounterId, institution, setting, indication, remainingDays, basicId } = options
    const [atc7, nhiCode, english, chinese, ingredient] = drug
    const endDate = new Date(Date.parse(`${authoredOn}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
    const quantity = days * 2
    const id = stableId(PATIENT_CONTEXT_HASH, 'medication-request', `${nhiCode}:${authoredOn}:${encounterId}`)
    emit('medications', module, {
      resourceType: 'MedicationRequest',
      id,
      status: 'unknown',
      intent: 'order',
      reportedBoolean: true,
      medicationCodeableConcept: {
        coding: [
          { system: NHI_MEDICATION, code: nhiCode, display: english },
          { system: ATC, code: atc7 },
        ],
        text: chinese,
      },
      subject: SUBJECT,
      groupIdentifier: {
        system: 'https://nhi-fhir-bridge.github.io/IdentifierSystem/medication-semantic-group',
        value: stableId('medication-semantic-group', ingredient),
      },
      authoredOn,
      requester: { ...orgRef(institution), display: `${INSTITUTIONS[institution].name};${setting}` },
      dosageInstruction: [{ text: `給藥總量 ${quantity}，給藥日數 ${days} 天（平均每日 2）` }],
      dispenseRequest: {
        quantity: { value: quantity },
        expectedSupplyDuration: { value: days, unit: 'days', system: UCUM, code: 'd' },
      },
      reasonCode: [reasonCode(indication[0], indication[1], `${indication[0].replace('.', '')} ${indication[2]}`)],
      encounter: { reference: `Encounter/${encounterId}` },
      extension: [
        { url: SD('medcloud-source-medication-end-date'), valueString: endDate },
        { url: SD('medcloud-atc-level-3'), valueCoding: { system: ATC, code: atc7.slice(0, 3) } },
        { url: SD('medcloud-atc-level-5'), valueCoding: { system: ATC, code: atc7.slice(0, 5), display: english } },
        { url: SD('medcloud-atc-level-7'), valueCoding: { system: ATC, code: atc7 } },
        { url: SD('medcloud-source-drug-class'), valueString: '一般錠劑膠囊劑' },
        { url: SD('medcloud-source-facility'), valueReference: orgRef(institution) },
        { url: SD('medcloud-source-setting'), valueString: setting },
        {
          url: SD('medcloud-single-prescription-remaining-days'),
          valueQuantity: { value: remainingDays, unit: 'days', system: UCUM, code: 'd' },
        },
        {
          url: SD('medcloud-drug-ingredient'),
          valueCodeableConcept: {
            coding: [{ system: CS('medcloud-drug-ingredient'), code: stableId('ingredient', ingredient).slice(0, 10), display: ingredient }],
            text: ingredient,
          },
        },
        ...(basicId ? [{ url: SD('medcloud-related-medication-remaining-summary'), valueReference: { reference: `Basic/${basicId}` } }] : []),
      ],
    })
    return id
  }

  const HTN_DX = ['I10', 'Essential hypertension', '高血壓']
  const DM_DX = ['E11.9', 'Type 2 diabetes mellitus', '第二型糖尿病']
  const LIPID_DX = ['E78.5', 'Hyperlipidemia unspecified', '高血脂症']
  const CKD_DX = ['N18.3', 'Chronic kidney disease stage 3', '慢性腎臟病第三期']
  const ONC_DX = ['C50.919', 'Breast carcinoma with metastatic recurrence', '乳房惡性腫瘤併轉移復發']
  const CHRONIC_DX = [HTN_DX, LIPID_DX, DM_DX, HTN_DX, CKD_DX, ONC_DX]

  // One Basic (IMUE0120 remaining-days summary) per chronic ingredient.
  CHRONIC_DRUGS.forEach((drug, index) => {
    const [, , , , ingredient, days] = drug
    const id = stableId(PATIENT_CONTEXT_HASH, 'medication-remaining-summary', ingredient)
    basics.push(id)
    emit('medications', 'IMUE0120', {
      resourceType: 'Basic',
      id,
      code: {
        coding: [{ system: CS('medcloud-basic-resource-type'), code: 'medication-remaining-summary', display: 'MediCloud medication remaining summary' }],
        text: `${ingredient} , 一般錠劑膠囊劑`,
      },
      subject: SUBJECT,
      identifier: [{ system: `${BRIDGE}/IdentifierSystem/medcloud-drug-group`, value: `SYN-GROUP-${String(index).padStart(3, '0')}` }],
      created: AS_OF,
      extension: [{
        url: SD('medcloud-medication-remaining-summary'),
        extension: [
          { url: 'adherenceExpectedRemainingDays', valueQuantity: { value: (index * 3) % 21, unit: 'days', system: UCUM, code: 'd' } },
          { url: 'sameIngredientDosageFormEndDate', valueDate: beforeAsOf(-((index * 3) % 21)) },
          { url: 'sourceMedicationDate', valueDate: beforeAsOf((index * 5) % 27) },
          { url: 'medicationGroupName', valueString: ingredient },
          { url: 'drugGroupCode', valueString: `SYN-GROUP-${String(index).padStart(3, '0')}` },
          { url: 'drugType', valueString: '一般錠劑膠囊劑' },
          { url: 'prescribedDays', valueQuantity: { value: days, unit: 'days', system: UCUM, code: 'd' } },
          { url: 'sourceDiagnosis', valueCoding: { system: ICD, code: CHRONIC_DX[index][0] } },
          { url: 'calculatedAt', valueInstant: CAPTURED_AT },
          { url: 'matchBasis', valueCode: 'exact-normalized-medication-group-name' },
          { url: 'sourceModule', valueCode: 'imue0120' },
        ],
      }],
    })
  })

  // Multi-year 28/30-day chronic refills. The last refill of each drug is dated
  // so its days-supply window still covers asOf — the "currently evidenced"
  // bucket — because bridge rows carry `status: unknown` and nothing else.
  CHRONIC_DRUGS.forEach((drug, index) => {
    const [, , , , , days, firstDay, lastDay] = drug
    const denseFrom = lastDay - CHRONIC_DENSE_WINDOW_DAYS
    for (let offset = firstDay; offset <= lastDay; offset += (offset < denseFrom ? 182 : days)) {
      const authoredOn = day(offset)
      const visit = clinicVisits.reduce((best, candidate) => (candidate.start <= authoredOn ? candidate : best), clinicVisits[0])
      addMedication({
        module: 'IMUE0008', drug, authoredOn, days, encounterId: visit.id, institution: 3, setting: '門診',
        indication: CHRONIC_DX[index], remainingDays: Math.max(0, days - ((offset + index) % days)), basicId: basics[index],
      })
      medicationCounts.chronicRefills++
    }
    // A final refill anchored to asOf so the window is unambiguously current.
    addMedication({
      module: 'IMUE0008', drug, authoredOn: beforeAsOf(days - 9 - index), days,
      encounterId: clinicVisits[clinicVisits.length - 1].id, institution: 3, setting: '門診',
      indication: CHRONIC_DX[index], remainingDays: 9 + index, basicId: basics[index],
    })
    medicationCounts.chronicRefills++
  })

  // Acute discharge / emergency courses. A few are dated so their supply ran out
  // 11-38 days before asOf, populating the "recently ended" bucket.
  admissions.forEach(({ a, id, institution, end, icd, english }) => {
    if (a % 2 === 1) return
    const drug = ACUTE_DRUGS[a % ACUTE_DRUGS.length]
    addMedication({
      module: 'IMUE0008', drug, authoredOn: end, days: drug[5], encounterId: id, institution, setting: '住院',
      indication: [icd, english, '合成適應症'], remainingDays: 0,
    })
    medicationCounts.acuteCourses++
  })
  emergencies.forEach(({ e, id, institution, start, icd, english }) => {
    const drug = ACUTE_DRUGS[(e + 1) % ACUTE_DRUGS.length]
    addMedication({
      module: 'IMUE0008', drug, authoredOn: start, days: drug[5], encounterId: id, institution, setting: '急診',
      indication: [icd, english, '合成適應症'], remainingDays: 0,
    })
    medicationCounts.acuteCourses++
  })
  ACUTE_DRUGS.forEach((drug, index) => {
    addMedication({
      module: 'IMUE0008', drug, authoredOn: beforeAsOf(drug[5] + 11 + index * 7), days: drug[5],
      encounterId: clinicVisits[clinicVisits.length - 1].id, institution: 3, setting: '門診',
      indication: ONC_DX, remainingDays: 0,
    })
    medicationCounts.acuteCourses++
  })

  // Long-running 90/120-day orders across the last four years.
  LONG_RUNNING_DRUGS.forEach((drug, index) => {
    for (let cycle = 0; cycle < 8; cycle++) {
      const authoredOn = beforeAsOf(drug[5] * (7 - cycle) + 24 - index * 6)
      addMedication({
        module: 'IMUE0008', drug, authoredOn, days: drug[5],
        encounterId: clinicVisits[Math.min(clinicVisits.length - 1, 40 + cycle * 2)].id,
        institution: 3, setting: '門診', indication: index === 0 ? CKD_DX : DM_DX,
        remainingDays: cycle === 7 ? drug[5] - 24 : 0,
      })
      medicationCounts.longRunningOrders++
    }
  })

  // ------------------------------------------- Labs: ServiceRequest -> DR -> Obs
  const drawDays = []
  for (let d = 0; d < LAB_DRAWS; d++) {
    // Alternate outpatient draws and inpatient day-1 draws across the 8 years.
    // The last four draws cluster inside the final six months, so the default
    // 6-month lab window is populated rather than only the 8-year history.
    drawDays.push(d >= LAB_DRAWS - 4
      ? { offset: [2905, 2960, 3010, 3060][d - (LAB_DRAWS - 4)], institution: 3, setting: 'outpatient' }
      : d % 3 === 0
        ? { offset: spread(d, LAB_DRAWS - 4, 20, 2860), institution: d % 3, setting: 'inpatient' }
        : { offset: spread(d, LAB_DRAWS - 4, 20, 2860) + 9, institution: 3, setting: 'outpatient' })
  }
  drawDays.forEach((draw, drawIndex) => {
    const date = day(draw.offset)
    LAB_PANELS.forEach((panel, panelIndex) => {
      const serviceRequestId = stableId(PATIENT_ID, 'service-request', `${date}:${panel.code}`)
      emit('service_requests', 'IMUE0010', {
        resourceType: 'ServiceRequest',
        id: serviceRequestId,
        status: 'unknown',
        intent: 'order',
        category: [{ text: '檢驗醫囑' }],
        code: {
          coding: [{ system: CS('medcloud-local-medical-order'), code: panel.code, display: panel.name }],
          text: panel.name,
        },
        subject: SUBJECT,
        occurrenceDateTime: date,
        performer: [orgRef(draw.institution)],
        reasonCode: [reasonCode('C50.919', 'Breast carcinoma with metastatic recurrence', 'C50919 乳房惡性腫瘤併轉移復發')],
        quantityQuantity: { value: 1 },
        extension: [{ url: SD('medcloud-source-local-occurrence-date-time'), valueString: `${date}T09:15` }],
      })

      const results = []
      panel.analytes.forEach((labIndex) => {
        const [loinc, display, unit, , , low, high] = LABS[labIndex]
        const value = labValue(drawIndex * 7, panelIndex, labIndex)
        const abnormal = value < low || value > high
        const observationId = stableId(PATIENT_ID, 'observation', `${date}:${panel.code}:${loinc}`)
        results.push({ reference: `Observation/${observationId}` })
        emit('observations', 'IMUE0060', {
          resourceType: 'Observation',
          id: observationId,
          meta: { tag: [{ system: `${BRIDGE}/nhi-visit-date`, code: date }] },
          status: 'unknown',
          category: [{ coding: [{ system: OBS_CATEGORY, code: 'laboratory', display: 'Laboratory' }] }],
          code: {
            coding: [
              { system: LOINC, code: loinc, display },
              { system: NHI_PAYMENT, code: panel.code, display: panel.name },
              { system: HIS_LOCAL_LAB, code: display, display },
            ],
            text: display,
          },
          subject: SUBJECT,
          effectiveDateTime: date,
          performer: [orgRef(draw.institution)],
          valueQuantity: { value, unit, system: UCUM, code: unit },
          referenceRange: [{ text: `${low}-${high}`, low: { value: low, unit }, high: { value: high, unit } }],
          interpretation: [{
            coding: [{
              system: INTERPRETATION,
              code: value < low ? 'L' : value > high ? 'H' : 'N',
              display: value < low ? 'Low' : value > high ? 'High' : 'Normal',
            }],
            text: abnormal ? '異常' : '正常',
          }],
          specimen: { display: labIndex < 5 ? 'Whole blood' : 'Serum' },
          method: { text: '合成測試分析方法' },
          extension: [{ url: SD('medcloud-source-report-instance-time'), valueString: '09:15' }],
        })
      })

      emit('diagnostic_reports', 'IMUE0060', {
        resourceType: 'DiagnosticReport',
        id: stableId(PATIENT_ID, 'diagnostic-report', `${date}:${panel.code}`),
        status: 'unknown',
        category: [{ coding: [{ system: V2_0074, code: 'LAB', display: 'Laboratory' }] }],
        code: {
          coding: [
            { system: NHI_PAYMENT, code: panel.code, display: panel.name },
            { system: LOINC, code: panel.loinc, display: panel.name },
          ],
          text: panel.name,
        },
        subject: SUBJECT,
        result: results,
        effectiveDateTime: date,
        performer: [orgRef(draw.institution)],
        basedOn: [{ reference: `ServiceRequest/${serviceRequestId}` }],
        extension: [{ url: SD('medcloud-source-report-instance-time'), valueString: '09:15' }],
      })
    })
  })

  // ----------------------------------------------- Imaging DiagnosticReports
  const imagingCounts = { CXR: 0, CT: 0, MRI: 0, US: 0 }
  const addImagingReport = (type, admissionIndex, serial, offset, institution) => {
    const [orderCode, orderName, category, categoryText] = IMAGING_ORDERS[type]
    const date = day(offset)
    const body = reportBody(type, admissionIndex, serial, `${date}T09:00:00Z`)
    const conclusion = `${orderName}（合成報告，非真實影像判讀）\n${body}`
    narrativeTokens += estimateTokens(conclusion)
    imagingCounts[type]++
    emit('diagnostic_reports', 'IMUE0130', {
      resourceType: 'DiagnosticReport',
      id: stableId(PATIENT_ID, 'diagnostic-report-imaging', `${type}:${admissionIndex}:${serial}:${date}`),
      status: 'unknown',
      subject: SUBJECT,
      code: { coding: [{ system: NHI_PAYMENT, code: orderCode, display: orderName }], text: orderName },
      conclusion,
      category: [{ coding: [{ system: V2_0074, code: category, display: 'Radiology' }], text: categoryText }],
      effectiveDateTime: date,
      performer: [orgRef(institution)],
      identifier: [{
        system: `${BRIDGE}/IdentifierSystem/medcloud-imaging-case`,
        value: stableId(PATIENT_ID, 'imaging-case', `${type}:${admissionIndex}:${serial}`),
      }],
      extension: [{
        url: SD('medcloud-nhi-viewer-request'),
        extension: [
          { url: 'version', valueInteger: 1 },
          { url: 'proc-id', valueCode: 'IMUE0130' },
          { url: 'patient-context-hash', valueString: PATIENT_CONTEXT_HASH },
          { url: 'ipl-case-seq-no', valueString: `SYN-CASE-${type}-${admissionIndex}-${serial}` },
          { url: 'file-type', valueString: 'DCM' },
        ],
      }],
    })
  }
  admissions.forEach(({ a, institution }) => {
    for (let c = 0; c < INPATIENT_CXR_PER_ADMISSION; c++) addImagingReport('CXR', a, c, a * 32 + 1 + c * 2, institution)
    if (a % 3 === 0) addImagingReport('CT', a, 0, a * 32 + 4, institution)
  })
  for (let r = 0; r < RESTAGING_ROUNDS + extraRestagingRounds; r++) {
    const institution = r % 3
    const base = spread(r, RESTAGING_ROUNDS + extraRestagingRounds, 40, 3046)
    addImagingReport('CT', 200 + r, r, base, institution)
    addImagingReport('MRI', 200 + r, r, base + 6, institution)
    if (r % 2 === 0) addImagingReport('US', 200 + r, r, base + 12, institution)
  }

  // ------------------------------------------------------------ Procedures
  for (let d = 0; d < DENTAL_PROCEDURES; d++) {
    const date = day(spread(d, DENTAL_PROCEDURES, 120, 3000))
    emit('procedures', 'IMUE0030', {
      resourceType: 'Procedure',
      id: stableId(PATIENT_ID, 'medcloud-dental-procedure-source-row', `${date}:${d}`),
      status: 'completed',
      subject: SUBJECT,
      code: { coding: [{ system: NHI_PAYMENT, code: '91004C', display: '牙結石清除' }], text: '牙結石清除' },
      performedPeriod: { start: date, end: date },
      bodySite: [{ text: `全口（合成紀錄 ${d + 1}）` }],
      performer: [{ actor: orgRef(3) }],
      extension: [{ url: SD('medcloud-procedure-quantity'), valueQuantity: { value: 1 } }],
    })
  }
  for (let r = 0; r < REHAB_PROCEDURES; r++) {
    const date = day(spread(r, REHAB_PROCEDURES, 200, 2900))
    emit('procedures', 'IMUE0080', {
      resourceType: 'Procedure',
      id: stableId(PATIENT_ID, 'medcloud-rehabilitation-procedure', `${date}:${r}`),
      status: 'unknown',
      subject: SUBJECT,
      code: { coding: [{ system: NHI_PAYMENT, code: '42001C', display: '簡單治療（復健）' }], text: '簡單治療（復健）' },
      performedDateTime: date,
      note: [{ text: '合成復健紀錄：功能評估與居家運動衛教，非真實治療處方。' }],
      performer: [{ actor: orgRef(r % 3) }],
    })
  }

  // ----------------------------------- IMUE0070 discharge summaries (documents)
  let dischargeCount = 0
  const addDischargeSummary = (admission, custodian, suffix) => {
    const lines = dischargeSummaryLines(admission.a)
    narrativeTokens += estimateTokens(lines.join('\n'))
    const html = `<div xmlns="http://www.w3.org/1999/xhtml">${lines.map((line) => `<p>${escapeXml(line)}</p>`).join('')}</div>`
    const bytes = Buffer.from(html, 'utf8')
    const rowId = `SYN-INPATIENT-ROW-${String(admission.a).padStart(3, '0')}${suffix}`
    dischargeCount++
    emit('document_references', 'IMUE0070', {
      resourceType: 'DocumentReference',
      id: stableId(PATIENT_ID, 'discharge-summary', rowId),
      meta: { tag: [{ system: `${BRIDGE}/nhi-source`, code: 'ihke3309-getxml' }] },
      status: 'current',
      type: { coding: [{ system: LOINC, code: '18842-5', display: 'Discharge summary' }], text: '出院病摘' },
      category: [{
        coding: [{
          system: 'http://hl7.org/fhir/us/core/CodeSystem/us-core-documentreference-category',
          code: 'clinical-note', display: 'Clinical Note',
        }],
      }],
      subject: SUBJECT,
      identifier: [{ system: `${BRIDGE}/nhi-inpatient-row`, value: rowId }],
      custodian: orgRef(custodian),
      content: [{
        attachment: {
          contentType: 'text/html',
          language: 'zh-TW',
          data: bytes.toString('base64'),
          title: `出院病摘 — ${INSTITUTIONS[custodian].name} ${admission.start}~${admission.end}`,
          size: bytes.length,
          hash: createHash('sha1').update(bytes).digest('base64'),
        },
      }],
      context: {
        encounter: [{ reference: `Encounter/${admission.id}` }],
        period: { start: admission.start, end: admission.end },
      },
    })
  }
  admissions.forEach((admission) => addDischargeSummary(admission, admission.institution, ''))
  // Cross-institution duplicates: the same stay re-reported by another provider's
  // IMUE0070 row. They resolve to the same Encounter, so the same
  // (institution, first ICD) deduplication key — dedup must collapse them.
  for (let d = 0; d < DUPLICATE_DISCHARGES; d++) {
    const admission = admissions[d * 4]
    addDischargeSummary(admission, (admission.institution + 1) % 3, `-DUP${d}`)
  }

  // -------------------------------- IMUE0140 adult preventive Compositions
  for (let p = 0; p < PREVENTIVE_EVENTS; p++) {
    const date = day(spread(p, PREVENTIVE_EVENTS, 180, 2700))
    const eventKey = `${date}:preventive`
    const sectionEntries = []
    const sections = PREVENTIVE_SECTIONS.map(([code, title, rows]) => {
      const values = rows.map(([label, unit]) => {
        const raw = noise(eventKey, code, label) % 100
        return [label, unit, unit === 'mmHg' ? 90 + raw : unit === 'mg/dL' ? 70 + raw * 2 : Number((raw / 4 + 1).toFixed(1))]
      })
      const normal = noise(eventKey, code) % 3 !== 0
      const observationId = stableId(PATIENT_ID, 'adult-preventive-observation', `${eventKey}:${code}`)
      sectionEntries.push({ code, title, normal, observationId, date, values })
      const body = values.map(([label, unit, value]) => `<tr><td>${escapeXml(label)}</td><td>${value}</td><td>${escapeXml(unit)}</td></tr>`).join('')
      return {
        title,
        code: { coding: [{ system: ADULT_SECTION, code, display: title }], text: title },
        text: {
          status: 'generated',
          div: `<div xmlns="http://www.w3.org/1999/xhtml"><table><thead><tr><th>檢查項目</th><th>結果</th><th>單位</th></tr></thead><tbody>${body}<tr><td>結果</td><td colspan="2">${normal ? '正常' : '異常，建議追蹤'}</td></tr></tbody></table></div>`,
        },
        mode: 'snapshot',
        entry: [{ reference: `Observation/${observationId}` }],
      }
    })
    sectionEntries.forEach(({ code, title, normal, observationId }) => {
      emit('observations', 'IMUE0140', {
        resourceType: 'Observation',
        id: observationId,
        meta: { tag: [{ system: `${BRIDGE}/source-program`, code: 'adult-preventive' }] },
        status: 'unknown',
        category: [{ coding: [{ system: OBS_CATEGORY, code: 'survey', display: 'Survey' }] }],
        code: { coding: [{ system: ADULT_SECTION, code, display: `${title}結果` }], text: `${title}結果` },
        subject: SUBJECT,
        effectiveDateTime: date,
        valueCodeableConcept: {
          coding: [{ system: ADULT_RESULT, code: normal ? 'N' : 'A', display: normal ? '正常' : '異常，建議追蹤' }],
          text: normal ? '正常' : '異常，建議追蹤',
        },
        interpretation: [{
          coding: [{ system: INTERPRETATION, code: normal ? 'N' : 'A', display: normal ? 'Normal' : 'Abnormal' }],
          text: normal ? '正常' : '異常，建議追蹤',
        }],
        performer: [orgRef(3)],
      })
    })
    emit('observations', 'IMUE0140', {
      resourceType: 'Composition',
      id: stableId(PATIENT_ID, 'adult-preventive-composition', eventKey),
      meta: { tag: [{ system: `${BRIDGE}/source-program`, code: 'adult-preventive' }] },
      language: 'zh-TW',
      identifier: {
        system: 'https://nhi-fhir-bridge.github.io/IdentifierSystem/adult-preventive-event',
        value: stableId(PATIENT_ID, 'adult-preventive-event', eventKey),
      },
      status: 'final',
      type: {
        coding: [{ system: LOINC, code: '75484-6', display: 'Preventive medicine Risk assessment and screening note' }],
        text: '成人預防保健結果',
      },
      subject: SUBJECT,
      date: `${date}T00:00:00+08:00`,
      author: [{ display: '雲端懷爾抓抓（系統產生）' }],
      title: `成人預防保健結果 — ${date}`,
      text: {
        status: 'generated',
        div: `<div xmlns="http://www.w3.org/1999/xhtml"><h1>成人預防保健結果</h1><p><b>檢查日期：</b>${date}</p><p><b>檢查醫事機構：</b>${escapeXml(INSTITUTIONS[3].name)}</p><p>${escapeXml(WARNING)}</p></div>`,
      },
      event: [{
        code: [{
          coding: [{ system: LOINC, code: '75484-6', display: 'Preventive medicine Risk assessment and screening note' }],
          text: '成人預防保健服務',
        }],
        period: { start: `${date}T00:00:00+08:00`, end: `${date}T23:59:59+08:00` },
      }],
      section: sections,
    })
  }

  // ------------------------------------------- IMUE0150 cancer screening
  for (let s = 0; s < 8; s++) {
    const date = day(spread(s, 8, 260, 2960))
    emit('observations', 'IMUE0150', {
      resourceType: 'Observation',
      id: stableId(PATIENT_ID, 'cancer-screening', date),
      meta: { tag: [{ system: `${BRIDGE}/source-program`, code: 'cancer-screening' }] },
      status: 'unknown',
      category: [{
        coding: [{ system: CS('medcloud-observation-program'), code: 'cancer-screening', display: '癌症篩檢' }],
        text: '癌症篩檢',
      }],
      code: {
        coding: [{ system: CS('medcloud-local-medical-order'), code: 'P3007C', display: '乳房攝影檢查' }],
        text: '乳房攝影檢查',
      },
      subject: SUBJECT,
      effectiveDateTime: date,
      performer: [orgRef(s % 3)],
      valueString: s % 3 === 0 ? '疑似異常，建議進一步確診檢查（合成結果）' : '未發現異常（合成結果）',
    })
  }

  // ------------------------------------------------------------- assemble
  const clinical = PAGE_TYPE_ORDER.flatMap((pageType) => byPageType[pageType])
  const resources = [patient, ...organizations, ...clinical, ...provenances]
  counts.Patient = 1
  counts.Organization = organizations.length
  counts.Provenance = provenances.length
  const bundle = {
    resourceType: 'Bundle',
    id: stableId(PATIENT_ID, 'bundle', RUN_ID),
    type: 'collection',
    timestamp: GENERATED_AT,
    meta: {
      source: SOURCE,
      tag: [
        { system: CS('data-class'), code: 'clinical-reference' },
        { system: CS('data-class'), code: 'complete-for-requested-modules' },
        ...Object.keys(MODULE_SCOPES).map((module) => ({ system: CS('source-module'), code: module.toLowerCase() })),
        ...Object.keys(MODULE_SCOPES).map((module) => ({
          system: CS('module-completeness'), code: `${module.toLowerCase()}-complete`, display: `${module} complete`,
        })),
      ],
    },
    entry: resources.map((resource) => ({
      fullUrl: `${BRIDGE}/${resource.resourceType}/${resource.id}`,
      resource,
    })),
  }

  const manifest = {
    generatorVersion: 1,
    variant: 'medcloud-bridge-shaped',
    seed: 'sha1-stable-id-deterministic-v1',
    asOf: AS_OF,
    syntheticOnly: true,
    warning: WARNING,
    shapeReference: 'docs/testing/medcloud-bridge-bundle-shape.md',
    modules: Object.keys(MODULE_SCOPES),
    institutions: INSTITUTIONS.map(({ id, name }) => ({ id, name })),
    resourceCounts: counts,
    admissions: ADMISSIONS,
    dischargeSummaries: dischargeCount,
    duplicateDischargeSummaries: DUPLICATE_DISCHARGES,
    imagingCounts,
    medicationMix: {
      ...medicationCounts,
      note: 'status is always "unknown" (bridge convention); currency comes only from authoredOn + dispenseRequest.expectedSupplyDuration.',
    },
    estimatedNarrativeTokens: narrativeTokens,
    limitations: [
      'Fully fabricated. No real patient, no real MediCloud capture, no network access.',
      'Reproduces the bridge OUTPUT SHAPE only; it is not bridge output and carries no real terminology audit.',
      'Encounter/imaging density is a load fixture, not a representative utilization pattern.',
      'Provenance costs ~400 estimated tokens per clinical resource, so counts are lower than a flat synthetic bundle at the same token total.',
    ],
  }
  return { bundle, manifest }
}

// ------------------------------------------------------------------ CLI
if (require.main === module) {
  const extraRestagingRounds = process.argv[2] === undefined ? 0 : Number(process.argv[2])
  const startedAt = Date.now()
  const { bundle, manifest } = buildMedcloudShapedBundle({ extraRestagingRounds })
  manifest.referenceValidation = validateBundleReferences(bundle)
  const json = JSON.stringify(bundle, null, 2) + '\n'
  manifest.jsonBytes = Buffer.byteLength(json)
  manifest.estimatedTokens = estimateTokens(json)
  manifest.sha256 = createHash('sha256').update(json).digest('hex')
  manifest.entries = bundle.entry.length
  manifest.generationMs = Date.now() - startedAt
  manifest.tokenMetric = 'MediPrisma heuristic (CJK/1.5 + other/4) over the pretty-printed bundle JSON text.'
  const directory = path.resolve(__dirname, '..', 'artifacts', 'synthetic-medcloud')
  fs.mkdirSync(directory, { recursive: true })
  const output = path.join(directory, `synthetic-medcloud-oncology-v1-${manifest.estimatedTokens}.fhir.json`)
  if (fs.existsSync(output) && fs.readFileSync(output, 'utf8') !== json) {
    throw new Error(`Refusing to overwrite a different fixture: ${output}`)
  }
  fs.writeFileSync(output, json)
  fs.writeFileSync(output.replace('.fhir.json', '.manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  console.log(JSON.stringify({ output, ...manifest }, null, 2))
}

module.exports = { buildMedcloudShapedBundle, INSTITUTIONS, MODULE_SCOPES }
