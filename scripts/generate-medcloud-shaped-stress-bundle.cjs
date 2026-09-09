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
  estimateTokens, validateBundleReferences,
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

// ------------------------------------------------------------ volume scaling
// Two different token numbers matter and they do NOT track each other:
//
//   * the bundle's own JSON tokens — every clinical resource costs its own JSON
//     *plus* ~400 tokens of bridge Provenance;
//   * the CLINICAL CONTEXT the application can put in front of a model (the
//     harness "all-data ceiling" — every category, every version, all time).
//     Provenance, ServiceRequests and the bridge's meta/extension scaffolding
//     never reach it, so a bridge-shaped bundle spends most of its bytes on
//     text the model never sees.
//
// The profiles below are tuned against the CEILING, which is what "a >1M-token
// patient" means to a user watching the app's token meter. `small` reproduces
// the original shape-regression size (fast, in-memory, ~2.3K entries); `large`
// is the default and drives the ceiling past a million tokens by growing the
// things that actually render: visits and their per-visit medications and
// procedures, per-panel lab analytes, imaging reports and discharge summaries.
const SCALE_PROFILES = {
  small: {
    admissions: 96,
    duplicateDischarges: 24,
    chronicClinicVisits: 60,
    treatmentVisits: 0,
    oncologyFollowUps: 32,
    emergencyVisits: 8,
    // null = each panel keeps its original narrow analyte list.
    panelAnalytes: null,
    standaloneLabDraws: 12,
    admissionLabDraws: 0,
    treatmentLabEvery: 0,
    chronicLabEvery: 0,
    inpatientCxrPerAdmission: 1,
    treatmentImagingEvery: 0,
    restagingRounds: 26,
    inpatientProceduresPerAdmission: 0,
    treatmentProcedureEvery: 0,
    dentalProcedures: 12,
    rehabProcedures: 8,
    preventiveEvents: 3,
    cancerScreenings: 8,
    supportiveDrugsPerTreatmentVisit: 0,
    dischargeCourseEntries: 0,
    chronicDenseWindowDays: 620,
  },
  large: {
    admissions: 96,
    duplicateDischarges: 24,
    // 28-day chronic clinic + weekly day-ward treatment across the 8 years.
    chronicClinicVisits: 105,
    treatmentVisits: 1100,
    oncologyFollowUps: 96,
    emergencyVisits: 24,
    panelAnalytes: 20,
    standaloneLabDraws: 0,
    admissionLabDraws: 1,
    treatmentLabEvery: 8,
    chronicLabEvery: 1,
    inpatientCxrPerAdmission: 6,
    treatmentImagingEvery: 1,
    restagingRounds: 176,
    inpatientProceduresPerAdmission: 3,
    treatmentProcedureEvery: 4,
    dentalProcedures: 24,
    rehabProcedures: 24,
    preventiveEvents: 8,
    cancerScreenings: 16,
    supportiveDrugsPerTreatmentVisit: 12,
    dischargeCourseEntries: 80,
    chronicDenseWindowDays: 620,
  },
}
const DEFAULT_SCALE = 'large'

/**
 * `scale` is a profile name, or an object of overrides (optionally with
 * `base: '<name>'`) so a measurement run can move one knob without editing the
 * generator. Unknown keys are rejected: a typo must not silently produce a
 * differently-sized fixture that still claims to be the large profile.
 */
function resolveScaleProfile(scale) {
  if (scale === undefined || scale === null) scale = DEFAULT_SCALE
  const named = (name) => {
    const profile = SCALE_PROFILES[name]
    if (!profile) {
      throw new Error(`Unknown scale "${name}". Known scales: ${Object.keys(SCALE_PROFILES).join(', ')}`)
    }
    return profile
  }
  if (typeof scale === 'string') return { ...named(scale), scale }
  if (typeof scale !== 'object') throw new Error('scale must be a profile name or an overrides object')
  const { base = DEFAULT_SCALE, ...overrides } = scale
  const profile = { ...named(base) }
  for (const [key, value] of Object.entries(overrides)) {
    if (!(key in profile)) throw new Error(`Unknown scale knob "${key}"`)
    if (value !== null && (!Number.isInteger(value) || value < 0)) {
      throw new Error(`Scale knob "${key}" must be a non-negative integer or null`)
    }
    profile[key] = value
  }
  return { ...profile, scale: base, overridden: Object.keys(overrides).sort() }
}

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
// Day-ward supportive-care prescriptions written at systemic-treatment visits.
// Same claims shape as the acute list; kept separate so the medication mix has
// a bucket that scales with visit volume rather than with admissions.
const SUPPORTIVE_DRUGS = [
  ['A04AA02', 'AC12312100', 'GRANISETRON 1MG TABLET', '康您適錠１毫克', 'GRANISETRON HCL', 3],
  ['H02AB06', 'AC23423100', 'PREDNISOLONE 5MG TABLET', '培尼皮質醇錠５毫克', 'PREDNISOLONE', 5],
  ['N02AX02', 'AC34534100', 'TRAMADOL 50MG CAPSULE', '舒敏錠５０毫克', 'TRAMADOL HCL', 7],
  ['B03BB01', 'AC45645100', 'FOLIC ACID 5MG TABLET', '葉酸錠５毫克', 'FOLIC ACID', 28],
  ['A02BC01', 'AC56756100', 'OMEPRAZOLE 20MG CAPSULE', '奧美拉唑腸溶膠囊２０毫克', 'OMEPRAZOLE', 14],
  ['J02AC01', 'AC67867100', 'FLUCONAZOLE 100MG CAPSULE', '泰復肯膠囊１００毫克', 'FLUCONAZOLE', 7],
  ['A03FA01', 'AC78978100', 'METOCLOPRAMIDE 10MG TABLET', '腸胃寧錠１０毫克', 'METOCLOPRAMIDE HCL', 5],
  ['N05CF02', 'AC89089100', 'ZOLPIDEM 10MG TABLET', '使蒂諾斯錠１０毫克', 'ZOLPIDEM TARTRATE', 14],
  ['A06AD15', 'AC90190100', 'MACROGOL 10G POWDER', '腸見樂散劑１０公克', 'MACROGOL 4000', 14],
  ['B03BA03', 'AC10201100', 'HYDROXOCOBALAMIN 500MCG TABLET', '維生素Ｂ１２錠５００微公克', 'HYDROXOCOBALAMIN', 28],
  ['A11CC05', 'AC21312100', 'CHOLECALCIFEROL 800IU TABLET', '維生素Ｄ３錠８００單位', 'COLECALCIFEROL', 28],
  ['M05BA08', 'AC32423100', 'ZOLEDRONIC ACID 4MG TABLET SUBSTITUTE', '骨力強錠４毫克', 'ZOLEDRONIC ACID', 28],
  ['N06AB03', 'AC43534100', 'FLUOXETINE 20MG CAPSULE', '百憂解膠囊２０毫克', 'FLUOXETINE HCL', 28],
  ['R05CB01', 'AC54645100', 'ACETYLCYSTEINE 600MG TABLET', '愛克痰發泡錠６００毫克', 'ACETYLCYSTEINE', 7],
  ['A03BA01', 'AC65756100', 'HYOSCINE 10MG TABLET', '補斯可伴錠１０毫克', 'HYOSCINE BUTYLBROMIDE', 5],
  ['C03CA01', 'AC76867100', 'FUROSEMIDE 40MG TABLET', '來適泄錠４０毫克', 'FUROSEMIDE', 7],
]
// Invasive NHI items recorded against inpatient stays and day-ward visits. They
// carry explicit surgical/biopsy wording, so the outbound AI domain filter keeps
// them (unlike the dental and rehabilitation rows further down, which it drops
// by design).
const INVASIVE_PROCEDURES = [
  ['47029C', '中心靜脈導管置入術'],
  ['47075C', '胸腔穿刺引流術'],
  ['48015C', '骨髓穿刺併切片術'],
  ['64084B', '超音波導引經皮穿刺切片術'],
  ['47081C', '腹腔穿刺引流術'],
]
// Long-running orders (90/120-day chronic-illness refills) — the "long-running
// order" bucket that must stay current on days-supply alone, not on `status`.
const LONG_RUNNING_DRUGS = [
  ['B01AF02', 'AC22334100', 'APIXABAN 5MG TABLET', '艾必克凝膜衣錠５毫克', 'APIXABAN', 90],
  ['H03AA01', 'AC33445100', 'LEVOTHYROXINE 75MCG TABLET', '昂特欣錠７５微公克', 'LEVOTHYROXINE SODIUM', 120],
]

// A real NHI panel bills one order code and returns 15-25 analytes; the shared
// LABS table only carries 18 in total, so the widths below extend it. Same
// 7-tuple shape ([LOINC, display, unit, generator low, generator high,
// reference low, reference high]) and every LOINC is distinct, or the lab pivot
// would merge two analytes into one series.
const EXTRA_ANALYTES = [
  // CBC / DC (indices 18-32)
  ['787-2', 'Erythrocyte mean corpuscular volume', 'fL', 78, 102, 80, 100],
  ['785-6', 'Erythrocyte mean corpuscular hemoglobin', 'pg', 24, 34, 27, 33],
  ['786-4', 'Erythrocyte mean corpuscular hemoglobin concentration', 'g/dL', 30, 36, 32, 36],
  ['788-0', 'Erythrocyte distribution width', '%', 12, 19, 11.5, 14.5],
  ['789-8', 'Erythrocytes', '10*6/uL', 2.8, 4.8, 4, 5.2],
  ['32623-1', 'Platelet mean volume', 'fL', 7.5, 12.5, 7.5, 11.5],
  ['736-9', 'Lymphocytes/100 leukocytes', '%', 5, 45, 20, 40],
  ['5905-5', 'Monocytes/100 leukocytes', '%', 2, 14, 2, 10],
  ['713-8', 'Eosinophils/100 leukocytes', '%', 0, 9, 0, 5],
  ['706-2', 'Basophils/100 leukocytes', '%', 0, 2, 0, 1],
  ['770-8', 'Neutrophils/100 leukocytes', '%', 30, 88, 40, 75],
  ['764-1', 'Band form neutrophils/100 leukocytes', '%', 0, 12, 0, 5],
  ['17849-1', 'Reticulocytes/100 erythrocytes', '%', 0.3, 3.4, 0.5, 2.5],
  ['58413-6', 'Nucleated erythrocytes/100 leukocytes', '%', 0, 4, 0, 0],
  ['30376-8', 'Blasts/100 leukocytes', '%', 0, 3, 0, 0],
  // Renal function and electrolytes (indices 33-47)
  ['33914-3', 'Glomerular filtration rate estimated', 'mL/min/1.73m2', 22, 78, 60, 150],
  ['19123-9', 'Magnesium', 'mg/dL', 1.4, 2.8, 1.7, 2.4],
  ['2777-1', 'Phosphate', 'mg/dL', 2.2, 5.8, 2.5, 4.5],
  ['3084-1', 'Urate', 'mg/dL', 3.1, 9.4, 2.6, 6],
  ['2028-9', 'Carbon dioxide total', 'mmol/L', 16, 30, 22, 29],
  ['1863-0', 'Anion gap', 'mmol/L', 6, 22, 8, 16],
  ['2692-2', 'Osmolality', 'mOsm/kg', 272, 312, 275, 295],
  ['1994-3', 'Calcium ionized', 'mmol/L', 0.94, 1.36, 1.12, 1.32],
  ['33863-2', 'Cystatin C', 'mg/L', 0.7, 2.4, 0.5, 1],
  ['2890-2', 'Protein urine', 'mg/dL', 0, 180, 0, 15],
  ['2161-8', 'Creatinine urine', 'mg/dL', 30, 220, 20, 320],
  ['2955-3', 'Sodium urine', 'mmol/L', 15, 145, 40, 220],
  ['2828-2', 'Potassium urine', 'mmol/L', 8, 72, 25, 125],
  ['2078-4', 'Chloride urine', 'mmol/L', 20, 180, 110, 250],
  ['1834-1', 'Beta-2-microglobulin', 'mg/L', 1.2, 5.8, 0.8, 2.2],
  // Liver function and nutrition (indices 48-62)
  ['6768-6', 'Alkaline phosphatase', 'U/L', 55, 340, 40, 130],
  ['2324-2', 'Gamma glutamyl transferase', 'U/L', 18, 290, 8, 61],
  ['1968-7', 'Bilirubin direct', 'mg/dL', 0.1, 1.6, 0, 0.3],
  ['2885-2', 'Protein total', 'g/dL', 5.1, 8.1, 6.4, 8.3],
  ['10834-0', 'Globulin', 'g/dL', 1.9, 4.2, 2, 3.5],
  ['2532-0', 'Lactate dehydrogenase', 'U/L', 150, 690, 140, 271],
  ['3034-6', 'Transferrin', 'mg/dL', 150, 340, 200, 360],
  ['1798-8', 'Amylase', 'U/L', 22, 160, 28, 100],
  ['3040-3', 'Lipase', 'U/L', 10, 180, 13, 60],
  ['5902-2', 'Prothrombin time', 's', 10.4, 17.8, 9.4, 12.5],
  ['6301-6', 'INR in platelet poor plasma', '{INR}', 0.9, 1.9, 0.8, 1.2],
  ['3173-2', 'aPTT', 's', 24, 48, 25, 35],
  ['3255-7', 'Fibrinogen', 'mg/dL', 150, 620, 200, 400],
  ['2614-6', 'Ammonia', 'umol/L', 18, 96, 11, 32],
  ['2276-4', 'Ferritin', 'ng/mL', 60, 1800, 13, 150],
  // Inflammation, metabolic and tumour markers (indices 63-80)
  ['33959-8', 'Procalcitonin', 'ng/mL', 0.05, 8.4, 0, 0.5],
  ['4537-7', 'Erythrocyte sedimentation rate', 'mm/h', 8, 92, 0, 20],
  ['4548-4', 'Hemoglobin A1c/Hemoglobin total', '%', 5.6, 10.4, 4, 5.6],
  ['2571-8', 'Triglyceride', 'mg/dL', 70, 420, 0, 150],
  ['2085-9', 'Cholesterol in HDL', 'mg/dL', 24, 72, 40, 90],
  ['13457-7', 'Cholesterol in LDL', 'mg/dL', 58, 196, 0, 130],
  ['3016-3', 'Thyrotropin', 'uIU/mL', 0.2, 7.4, 0.4, 4],
  ['3024-7', 'Thyroxine free', 'ng/dL', 0.6, 2.1, 0.8, 1.8],
  ['2039-6', 'Carcinoembryonic antigen', 'ng/mL', 1.2, 42, 0, 5],
  ['6875-9', 'Cancer antigen 15-3', 'U/mL', 12, 180, 0, 31],
  ['2498-4', 'Iron', 'ug/dL', 18, 180, 50, 170],
  ['2500-7', 'Iron binding capacity', 'ug/dL', 180, 420, 250, 450],
  ['2132-9', 'Cobalamin', 'pg/mL', 160, 980, 200, 900],
  ['2284-8', 'Folate', 'ng/mL', 2.1, 18, 3.1, 20],
  ['48065-7', 'Fibrin D-dimer FEU', 'ug/mL', 0.3, 8.4, 0, 0.5],
  ['10839-9', 'Troponin I cardiac', 'ng/mL', 0.01, 0.42, 0, 0.04],
  ['33762-6', 'Natriuretic peptide B prohormone N-Terminal', 'pg/mL', 60, 2400, 0, 125],
  ['2524-7', 'Lactate', 'mmol/L', 0.7, 5.6, 0.5, 2.2],
]
const ANALYTES = [...LABS, ...EXTRA_ANALYTES]
// Same deterministic curve `labValue` applies to the shared table, extended over
// the wider analyte list; identical output for the original 18 indices.
const analyteValue = (admission, dateIndex, index) => {
  const [, , , low, high] = ANALYTES[index]
  const phase = ((admission * 37 + dateIndex * 19 + index * 11) % 101) / 100
  return Number((low + phase * (high - low)).toFixed(index < 5 ? 1 : 2))
}

// NHI lab panels: order code + Chinese panel name + member analytes (indices
// into ANALYTES) + the HIS-local item name the bridge keeps alongside.
// `baseAnalytes` is the narrow original width the `small` profile keeps.
const LAB_PANELS = [
  {
    code: '08011C', name: '全套血液計數檢查 (CBC/DC)', loinc: '58410-2', baseAnalytes: 5,
    analytes: [0, 1, 2, 3, 4, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32],
  },
  {
    code: '09021C', name: '生化學檢查 (腎功能及電解質)', loinc: '24362-6', baseAnalytes: 5,
    analytes: [5, 6, 7, 8, 9, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47],
  },
  {
    code: '09029C', name: '生化學檢查 (肝功能及營養)', loinc: '24325-3', baseAnalytes: 5,
    analytes: [10, 11, 12, 13, 14, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62],
  },
  {
    code: '09040C', name: '生化學檢查 (發炎及代謝)', loinc: '24323-8', baseAnalytes: 3,
    analytes: [15, 16, 17, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80],
  },
]
const IMAGING_ORDERS = {
  CXR: ['32001C', '胸部Ｘ光攝影（單張）', 'RAD', '放射線診療普通檢查'],
  CT: ['33072B', '電腦斷層造影－有／無造影劑', 'RAD', '放射線診療特殊檢查'],
  MRI: ['33084B', '磁振造影檢查－有／無造影劑', 'RAD', '放射線診療特殊檢查'],
  US: ['19009C', '腹部超音波檢查', 'RAD', '超音波檢查'],
}
// A real 出院病摘 for a two-week oncology admission records the stay day by day,
// and 住院治療經過 / 出院衛教 are exactly the sections the application's
// key-section extractor keeps. Growing them is therefore both the honest way to
// make the document realistic and, per byte of bundle, by far the densest
// clinical context in the fixture (Chinese text costs ~6 bundle bytes per
// estimated token; a lab Observation costs ~1,000). Every sentence is invented.
const COURSE_EVENTS = [
  (v) => `體溫最高 ${v.temp} 度，畏寒感較前減輕，血液培養兩套持續無菌生長`,
  (v) => `主訴噁心與食慾不佳，給予止吐藥後可進食約 ${v.intake} 成，未再嘔吐`,
  (v) => `疼痛評分 ${v.pain} 分，依固定時程給予止痛藥並保留備用劑量`,
  (v) => `白血球 ${v.wbc} 10*3/uL、絕對嗜中性球 ${v.anc} 10*3/uL，暫緩全身性治療並每日追蹤`,
  (v) => `血色素 ${v.hb} g/dL，無黑便或明顯出血徵象，暫不輸血並持續觀察`,
  (v) => `血中肌酸酐 ${v.cr} mg/dL，調整點滴速率並記錄每日出入量`,
  () => '下肢無凹陷性水腫，可於病室內自行行走，物理治療師評估跌倒風險為中度',
  () => '人工血管周圍皮膚無紅腫熱痛，抽回血順暢，換藥後保持乾燥',
  () => '胸部Ｘ光顯示雙側肺底輕微塌陷，與前次比較無明顯變化，鼓勵深呼吸訓練',
  () => '與病人及家屬說明本次治療目標與後續門診安排，家屬表示了解並同意計畫',
  () => '營養師會診建議高蛋白高熱量飲食，並提供口服營養補充品每日兩份',
  () => '夜間睡眠品質不佳，短效安眠藥後改善，白天精神狀況尚可、意識清楚',
  () => '解便型態正常，暫停軟便劑後觀察一日，未再出現腹脹或腹痛',
  (v) => `飯前血糖 ${v.glucose} mg/dL，依血糖值調整胰島素劑量並衛教低血糖處理`,
  () => '會診感染科建議依培養結果調整抗生素；目前無新增感染徵象',
  () => '心理師訪視，病人對疾病進展表達焦慮，已安排後續心理支持與家屬會談',
]
const DISCHARGE_EDUCATION = [
  '返家後每日量測體溫兩次並記錄；體溫超過攝氏三十八度或出現寒顫，請立即至急診就醫。',
  '人工血管每四週需回診沖洗一次；若周圍出現紅腫、疼痛、滲液或發燒，請提前回診。',
  '飲食以高蛋白、少量多餐為原則，避免生食與未充分加熱的食物；每日飲水量依門診指示調整。',
  '如出現連續兩日無法進食或服藥、明顯體重下降、新發生呼吸困難或無法控制的疼痛，請提前回診。',
  '止痛藥請依固定時程服用，勿等疼痛難忍才使用；備用劑量使用後請記錄時間與效果。',
  '返家後維持日常活動並避免跌倒；如需協助請使用助行器並由家屬陪同。',
  '本次住院之檢驗與影像結果均已於門診說明；後續治療是否恢復由門診依當日檢驗結果決定。',
  '本文件為合成測試資料，不得作為任何臨床判讀、用藥或治療依據。',
]

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
function buildMedcloudShapedBundle({ extraRestagingRounds = 0, scale } = {}) {
  if (!Number.isInteger(extraRestagingRounds) || extraRestagingRounds < 0 || extraRestagingRounds > 200) {
    throw new Error('extraRestagingRounds must be an integer between 0 and 200')
  }
  const profile = resolveScaleProfile(scale)
  const ADMISSIONS = profile.admissions
  const DUPLICATE_DISCHARGES = profile.duplicateDischarges
  const CHRONIC_CLINIC_VISITS = profile.chronicClinicVisits
  const TREATMENT_VISITS = profile.treatmentVisits
  const ONCOLOGY_FOLLOW_UPS = profile.oncologyFollowUps
  const EMERGENCY_VISITS = profile.emergencyVisits
  const LAB_DRAWS = profile.standaloneLabDraws
  const INPATIENT_CXR_PER_ADMISSION = profile.inpatientCxrPerAdmission
  const RESTAGING_ROUNDS = profile.restagingRounds
  const DENTAL_PROCEDURES = profile.dentalProcedures
  const REHAB_PROCEDURES = profile.rehabProcedures
  const PREVENTIVE_EVENTS = profile.preventiveEvents
  const CHRONIC_DENSE_WINDOW_DAYS = profile.chronicDenseWindowDays
  const panelAnalytes = (panel) => panel.analytes.slice(
    0, profile.panelAnalytes === null ? panel.baseAnalytes : Math.min(profile.panelAnalytes, panel.analytes.length),
  )
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

  // Day-ward systemic-treatment visits: the weekly cadence that dominates an
  // oncology chart. They share one ICD set per institution, so the app's
  // encounter grouping collapses them into one block per institution and the
  // per-visit medications / procedures below are what the context actually
  // spends its tokens on.
  const treatmentVisits = []
  for (let t = 0; t < TREATMENT_VISITS; t++) {
    const institution = t % 3
    const start = day(spread(t, TREATMENT_VISITS, 45, 3058))
    const id = stableId(PATIENT_ID, start, INSTITUTIONS[institution].id, 'treatment', `tseq:${t}`)
    treatmentVisits.push({ t, id, start, institution })
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
      reasonCode: [
        reasonCode('C50.919', 'Breast carcinoma with metastatic recurrence', 'C50919 乳房惡性腫瘤併轉移復發'),
        reasonCode('Z51.11', 'Encounter for antineoplastic chemotherapy', 'Z5111 抗腫瘤化學治療'),
      ],
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
  const medicationCounts = { chronicRefills: 0, acuteCourses: 0, supportiveCourses: 0, longRunningOrders: 0 }
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

  // Supportive-care rows written at every day-ward treatment visit. In a real
  // MediCloud pull these are the bulk of the medication feed, and they are what
  // makes the per-visit medication lines dominate the visit history.
  treatmentVisits.forEach(({ t, id, institution, start }) => {
    for (let s = 0; s < profile.supportiveDrugsPerTreatmentVisit; s++) {
      const drug = SUPPORTIVE_DRUGS[(t * 3 + s) % SUPPORTIVE_DRUGS.length]
      addMedication({
        module: 'IMUE0008', drug, authoredOn: start, days: drug[5], encounterId: id, institution,
        setting: '門診', indication: s % 2 === 0 ? ONC_DX : CKD_DX, remainingDays: 0,
      })
      medicationCounts.supportiveCourses++
    }
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
  // One draw = one ServiceRequest + one DiagnosticReport + one Observation per
  // analyte, per ordered panel — the bridge's IMUE0010/IMUE0060 pairing.
  let labDrawCount = 0
  const addLabDraw = ({ date, institution, panels, seed, key = date }) => {
    labDrawCount++
    panels.forEach((panelIndex) => {
      const panel = LAB_PANELS[panelIndex]
      const serviceRequestId = stableId(PATIENT_ID, 'service-request', `${key}:${panel.code}`)
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
        performer: [orgRef(institution)],
        reasonCode: [reasonCode('C50.919', 'Breast carcinoma with metastatic recurrence', 'C50919 乳房惡性腫瘤併轉移復發')],
        quantityQuantity: { value: 1 },
        extension: [{ url: SD('medcloud-source-local-occurrence-date-time'), valueString: `${date}T09:15` }],
      })

      const results = []
      panelAnalytes(panel).forEach((analyteIndex) => {
        const [loinc, display, unit, , , low, high] = ANALYTES[analyteIndex]
        const value = analyteValue(seed, panelIndex, analyteIndex)
        const abnormal = value < low || value > high
        const observationId = stableId(PATIENT_ID, 'observation', `${key}:${panel.code}:${loinc}`)
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
          performer: [orgRef(institution)],
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
          specimen: { display: analyteIndex < 5 || (analyteIndex >= 18 && analyteIndex <= 32) ? 'Whole blood' : 'Serum' },
          method: { text: '合成測試分析方法' },
          extension: [{ url: SD('medcloud-source-report-instance-time'), valueString: '09:15' }],
        })
      })

      emit('diagnostic_reports', 'IMUE0060', {
        resourceType: 'DiagnosticReport',
        id: stableId(PATIENT_ID, 'diagnostic-report', `${key}:${panel.code}`),
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
        performer: [orgRef(institution)],
        basedOn: [{ reference: `ServiceRequest/${serviceRequestId}` }],
        extension: [{ url: SD('medcloud-source-report-instance-time'), valueString: '09:15' }],
      })
    })
  }

  const ALL_PANELS = LAB_PANELS.map((_, index) => index)
  // Inpatient day-1 / mid-stay / pre-discharge draws: the full panel set.
  if (profile.admissionLabDraws > 0) {
    admissions.forEach(({ a, institution }) => {
      for (let d = 0; d < profile.admissionLabDraws; d++) {
        addLabDraw({
          date: day(a * 32 + 1 + Math.round((d * 11) / Math.max(1, profile.admissionLabDraws - 1 || 1))),
          institution, panels: ALL_PANELS, seed: a * 7 + d, key: `inpatient:${a}:${d}`,
        })
      }
    })
  }
  // Pre-treatment counts and chemistry before each day-ward visit.
  if (profile.treatmentLabEvery > 0) {
    treatmentVisits.forEach(({ t, institution, start }) => {
      if (t % profile.treatmentLabEvery !== 0) return
      // Full chemistry every fourth draw; counts-and-renal only in between.
      const ordinal = t / profile.treatmentLabEvery
      addLabDraw({
        date: start, institution, panels: ordinal % 4 === 0 ? ALL_PANELS : [0, 1],
        seed: 400 + t, key: `treatment:${t}`,
      })
    })
  }
  // Chronic-disease monitoring at the family-medicine clinic.
  if (profile.chronicLabEvery > 0) {
    clinicVisits.forEach(({ v, start }) => {
      if (v % profile.chronicLabEvery !== 0) return
      addLabDraw({ date: start, institution: 3, panels: [1, 2, 3], seed: 900 + v, key: `chronic:${v}` })
    })
  }

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
    addLabDraw({
      date: day(draw.offset), institution: draw.institution, panels: ALL_PANELS, seed: drawIndex * 7,
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
  // Weekly chest films through systemic treatment, with an abdominal ultrasound
  // at every sixth visit — the routine surveillance layer that makes an
  // oncology chart carry thousands of reports rather than dozens.
  if (profile.treatmentImagingEvery > 0) {
    treatmentVisits.forEach(({ t, institution, start }) => {
      if (t % profile.treatmentImagingEvery !== 0) return
      const offset = Math.round((Date.parse(`${start}T00:00:00Z`) - EPOCH) / 86_400_000)
      addImagingReport('CXR', 500 + t, 0, offset, institution)
      if (t % 6 === 0) addImagingReport('US', 500 + t, 1, offset, institution)
    })
  }
  for (let r = 0; r < RESTAGING_ROUNDS + extraRestagingRounds; r++) {
    const institution = r % 3
    const base = spread(r, RESTAGING_ROUNDS + extraRestagingRounds, 40, 3046)
    addImagingReport('CT', 200 + r, r, base, institution)
    addImagingReport('MRI', 200 + r, r, base + 6, institution)
    if (r % 2 === 0) addImagingReport('US', 200 + r, r, base + 12, institution)
  }

  // ------------------------------------------------------------ Procedures
  const addInvasiveProcedure = ({ index, date, institution, encounterId, setting, serial }) => {
    const [code, name] = INVASIVE_PROCEDURES[index % INVASIVE_PROCEDURES.length]
    emit('procedures', 'IMUE0030', {
      resourceType: 'Procedure',
      id: stableId(PATIENT_ID, 'medcloud-invasive-procedure', `${date}:${code}:${serial}`),
      status: 'completed',
      subject: SUBJECT,
      // `code.text` is the NHI item label verbatim, exactly as the bridge
      // carries it; the synthetic marker lives in `note`, not in the label the
      // application renders and cites.
      code: { coding: [{ system: NHI_PAYMENT, code, display: name }], text: name },
      performedDateTime: date,
      encounter: { reference: `Encounter/${encounterId}` },
      performer: [{ actor: orgRef(institution) }],
      note: [{ text: `合成${setting}處置紀錄：僅供載量測試，非真實手術或處置紀錄。` }],
      extension: [{ url: SD('medcloud-procedure-quantity'), valueQuantity: { value: 1 } }],
    })
  }
  admissions.forEach(({ a, id, institution }) => {
    for (let p = 0; p < profile.inpatientProceduresPerAdmission; p++) {
      addInvasiveProcedure({
        index: a + p, date: day(a * 32 + 2 + p * 3), institution, encounterId: id,
        setting: '住院', serial: `a${a}-${p}`,
      })
    }
  })
  if (profile.treatmentProcedureEvery > 0) {
    treatmentVisits.forEach(({ t, id, institution, start }) => {
      if (t % profile.treatmentProcedureEvery !== 0) return
      addInvasiveProcedure({
        index: t + 2, date: start, institution, encounterId: id, setting: '門診', serial: `t${t}`,
      })
    })
  }

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
  /**
   * Expand 住院治療經過 into a day-by-day course and add a 出院衛教與追蹤計畫
   * block. Both land inside key sections the extractor keeps, so the growth is
   * visible in the reduced document view rather than only in the raw text.
   */
  const enrichDischargeLines = (admissionIndex, lines) => {
    const entries = profile.dischargeCourseEntries
    if (entries === 0) return lines
    const start = Date.parse(`${day(admissionIndex * 32)}T00:00:00Z`)
    const course = []
    for (let index = 0; index < entries; index++) {
      const stayDay = 1 + Math.floor((index * 13) / Math.max(1, entries))
      const date = new Date(start + stayDay * 86_400_000).toISOString().slice(0, 10)
      const seed = noise('course', admissionIndex, index)
      const values = {
        temp: (36.4 + ((seed >>> 3) % 26) / 10).toFixed(1),
        intake: 2 + (seed % 8),
        pain: 1 + ((seed >>> 5) % 9),
        wbc: analyteValue(admissionIndex, index, 1),
        anc: analyteValue(admissionIndex, index, 2),
        hb: analyteValue(admissionIndex, index, 0),
        cr: analyteValue(admissionIndex, index, 8),
        glucose: analyteValue(admissionIndex, index, 16),
      }
      const first = COURSE_EVENTS[seed % COURSE_EVENTS.length](values)
      const second = COURSE_EVENTS[(seed >>> 7) % COURSE_EVENTS.length](values)
      course.push(`住院第 ${stayDay} 日（${date}）：${first}。${second}。`)
    }
    const anchor = lines.indexOf('合併症與併發症')
    const output = [...lines]
    output.splice(anchor < 0 ? output.length : anchor, 0, ...course)
    output.push('出院衛教與追蹤計畫', ...DISCHARGE_EDUCATION.map(
      (line, index) => `${index + 1}. ${line}`,
    ))
    return output
  }
  const addDischargeSummary = (admission, custodian, suffix) => {
    const lines = enrichDischargeLines(admission.a, dischargeSummaryLines(admission.a))
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
  for (let s = 0; s < profile.cancerScreenings; s++) {
    const date = day(spread(s, profile.cancerScreenings, 260, 2960))
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
    scale: profile.scale,
    ...(profile.overridden ? { scaleOverrides: profile.overridden } : {}),
    scaleProfile: Object.fromEntries(
      Object.keys(SCALE_PROFILES[profile.scale]).map((key) => [key, profile[key]]),
    ),
    resourceCounts: counts,
    admissions: ADMISSIONS,
    treatmentVisits: TREATMENT_VISITS,
    labDraws: labDrawCount,
    analytesPerPanel: LAB_PANELS.map((panel) => panelAnalytes(panel).length),
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
  // `--scale=<name>` / MEDCLOUD_SCALE choose the volume profile (default
  // `large`); `--extra-restaging=<n>` still nudges one knob without a profile
  // edit. A bare numeric first argument keeps the original CLI working.
  const args = process.argv.slice(2)
  const flag = (name) => {
    const match = args.find((argument) => argument.startsWith(`--${name}=`))
    return match === undefined ? undefined : match.slice(name.length + 3)
  }
  const positional = args.find((argument) => !argument.startsWith('--'))
  const extraRaw = flag('extra-restaging') ?? positional
  const extraRestagingRounds = extraRaw === undefined ? 0 : Number(extraRaw)
  const scale = flag('scale') ?? process.env.MEDCLOUD_SCALE ?? DEFAULT_SCALE
  const startedAt = Date.now()
  const { bundle, manifest } = buildMedcloudShapedBundle({ extraRestagingRounds, scale })
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

module.exports = {
  buildMedcloudShapedBundle, INSTITUTIONS, MODULE_SCOPES, SCALE_PROFILES, DEFAULT_SCALE,
}
