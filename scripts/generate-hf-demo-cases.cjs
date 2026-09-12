#!/usr/bin/env node

/**
 * Generate compact, fully fictional HFrEF FHIR bundles for manual CDSS review.
 * Each bundle contains exactly one patient and one coherent clinical scenario.
 */

const fs = require('node:fs')
const path = require('node:path')

const OUT_DIR = path.join(__dirname, '..', 'public', 'demo', 'hfrEF')
const LOINC = 'http://loinc.org'
const UCUM = 'http://unitsofmeasure.org'
const ICD10 = 'http://hl7.org/fhir/sid/icd-10-cm'
const OBS_CATEGORY = 'http://terminology.hl7.org/CodeSystem/observation-category'
const FIXTURE_SYSTEM = 'https://mediprisma.app/CodeSystem/demo-fixture'

const scenarios = [
  {
    id: 'stable-four-pillars',
    filename: '01-stable-four-pillars.json',
    name: '林穩定',
    gender: 'male',
    birthDate: '1958-04-16',
    summary: '穩定 HFrEF，四大支柱已建立，無明顯鬱血。',
    lvef: 35,
    bp: [118, 72],
    heartRate: 68,
    spo2: 97,
    weight: 70,
    height: 170,
    ntproBNP: 520,
    egfr: 62,
    potassium: 4.3,
    sodium: 139,
    hemoglobin: 13.6,
    rhythm: 'Sinus rhythm, rate 68 bpm.',
    cxr: 'No pulmonary edema or pleural effusion. Cardiac silhouette is mildly enlarged.',
    medications: [
      ['sacubitril-valsartan', 'Sacubitril/valsartan 49/51 mg', '1 tablet PO BID'],
      ['bisoprolol', 'Bisoprolol 5 mg', '1 tablet PO QD'],
      ['spironolactone', 'Spironolactone 25 mg', '1 tablet PO QD'],
      ['dapagliflozin', 'Dapagliflozin 10 mg', '1 tablet PO QD'],
    ],
  },
  {
    id: 'congested-needs-diuresis',
    filename: '02-congested-needs-diuresis.json',
    name: '陳鬱血',
    gender: 'female',
    birthDate: '1949-11-02',
    summary: 'HFrEF 合併肺鬱血與周邊水腫，需評估 loop 利尿劑調整。',
    lvef: 28,
    bp: [132, 78],
    heartRate: 92,
    spo2: 91,
    weight: 76,
    height: 160,
    ntproBNP: 4200,
    egfr: 46,
    potassium: 4.1,
    sodium: 132,
    hemoglobin: 11.4,
    rhythm: 'Sinus tachycardia, rate 92 bpm.',
    cxr: 'Cardiomegaly with bilateral pleural effusions, prominent hila and pulmonary vascular congestion.',
    medications: [
      ['valsartan', 'Valsartan 80 mg', '1 tablet PO BID'],
      ['bisoprolol', 'Bisoprolol 2.5 mg', '1 tablet PO QD'],
      ['dapagliflozin', 'Dapagliflozin 10 mg', '1 tablet PO QD'],
      ['furosemide', 'Furosemide 20 mg', '1 tablet PO QD'],
    ],
  },
  {
    id: 'renal-hyperkalemia',
    filename: '03-renal-hyperkalemia.json',
    name: '黃腎限',
    gender: 'male',
    birthDate: '1952-07-23',
    summary: 'HFrEF 合併 eGFR 下降與高血鉀，MRA 起始條件不符。',
    lvef: 30,
    bp: [126, 74],
    heartRate: 72,
    spo2: 96,
    weight: 68,
    height: 166,
    ntproBNP: 1800,
    egfr: 24,
    potassium: 5.6,
    sodium: 137,
    hemoglobin: 10.8,
    rhythm: 'Sinus rhythm, rate 72 bpm.',
    cxr: 'Mild cardiomegaly without focal consolidation or pleural effusion.',
    medications: [
      ['sacubitril-valsartan', 'Sacubitril/valsartan 24/26 mg', '1 tablet PO BID'],
      ['carvedilol', 'Carvedilol 6.25 mg', '1 tablet PO BID'],
      ['dapagliflozin', 'Dapagliflozin 10 mg', '1 tablet PO QD'],
    ],
  },
  {
    id: 'hypotension-bradycardia',
    filename: '04-hypotension-bradycardia.json',
    name: '周低壓',
    gender: 'female',
    birthDate: '1963-01-08',
    summary: 'HFrEF 合併低血壓與心搏過緩，需重新評估 ARNI 與 β 阻斷劑耐受性。',
    lvef: 25,
    bp: [86, 54],
    heartRate: 44,
    spo2: 95,
    weight: 58,
    height: 158,
    ntproBNP: 1350,
    egfr: 58,
    potassium: 4.5,
    sodium: 136,
    hemoglobin: 12.2,
    rhythm: 'Sinus bradycardia, rate 44 bpm. PR interval 210 ms.',
    cxr: 'Stable mild cardiomegaly. No pulmonary edema or pleural effusion.',
    medications: [
      ['sacubitril-valsartan', 'Sacubitril/valsartan 49/51 mg', '1 tablet PO BID'],
      ['carvedilol', 'Carvedilol 12.5 mg', '1 tablet PO BID'],
      ['spironolactone', 'Spironolactone 25 mg', '1 tablet PO QD'],
      ['empagliflozin', 'Empagliflozin 10 mg', '1 tablet PO QD'],
    ],
  },
]

function coding(system, code, display) {
  return { system, code, display }
}

function subject(patientId) {
  return { reference: `Patient/${patientId}` }
}

function observation(patientId, id, label, code, value, unit, category = 'laboratory') {
  return {
    resourceType: 'Observation',
    id: `${patientId}-${id}`,
    status: 'final',
    category: [{ coding: [coding(OBS_CATEGORY, category, category === 'vital-signs' ? 'Vital Signs' : 'Laboratory')] }],
    code: { text: label, coding: [coding(LOINC, code, label)] },
    subject: subject(patientId),
    effectiveDateTime: '2026-09-10T09:00:00+08:00',
    valueQuantity: { value, unit, system: UCUM, code: unit },
    performer: [{ display: '示範心臟醫學中心' }],
  }
}

function bloodPressure(patientId, [systolic, diastolic]) {
  return {
    resourceType: 'Observation',
    id: `${patientId}-blood-pressure`,
    status: 'final',
    category: [{ coding: [coding(OBS_CATEGORY, 'vital-signs', 'Vital Signs')] }],
    code: { text: 'Blood pressure', coding: [coding(LOINC, '85354-9', 'Blood pressure panel')] },
    subject: subject(patientId),
    effectiveDateTime: '2026-09-10T09:00:00+08:00',
    component: [
      {
        code: { coding: [coding(LOINC, '8480-6', 'Systolic blood pressure')] },
        valueQuantity: { value: systolic, unit: 'mmHg', system: UCUM, code: 'mm[Hg]' },
      },
      {
        code: { coding: [coding(LOINC, '8462-4', 'Diastolic blood pressure')] },
        valueQuantity: { value: diastolic, unit: 'mmHg', system: UCUM, code: 'mm[Hg]' },
      },
    ],
    performer: [{ display: '示範心臟醫學中心' }],
  }
}

function medication(patientId, scenarioId, [id, name, dosage]) {
  const twiceDaily = /BID/.test(dosage)
  return {
    resourceType: 'MedicationRequest',
    id: `${patientId}-${id}`,
    status: 'active',
    intent: 'order',
    medicationCodeableConcept: { text: name },
    subject: subject(patientId),
    authoredOn: '2026-09-01',
    dosageInstruction: [{
      text: dosage,
      route: { text: 'PO' },
      timing: { repeat: { frequency: twiceDaily ? 2 : 1, period: 1, periodUnit: 'd' } },
    }],
    courseOfTherapyType: {
      coding: [coding('http://terminology.hl7.org/CodeSystem/medicationrequest-course-of-therapy', 'continuous', 'Continuous long term therapy')],
    },
    note: [{ text: `Synthetic HFrEF scenario: ${scenarioId}` }],
  }
}

function bundleFor(scenario) {
  const patientId = `hfrEF-${scenario.id}`
  const encounterId = `${patientId}-visit`
  const resources = [
    {
      resourceType: 'Patient',
      id: patientId,
      meta: { tag: [coding(FIXTURE_SYSTEM, scenario.id, scenario.summary)] },
      name: [{ text: `模擬 ${scenario.name}`, family: scenario.name.slice(0, 1), given: [scenario.name.slice(1)] }],
      gender: scenario.gender,
      birthDate: scenario.birthDate,
    },
    {
      resourceType: 'Encounter',
      id: encounterId,
      status: 'finished',
      class: coding('http://terminology.hl7.org/CodeSystem/v3-ActCode', 'AMB', 'ambulatory'),
      subject: subject(patientId),
      period: { start: '2026-09-10T08:30:00+08:00', end: '2026-09-10T10:00:00+08:00' },
      serviceProvider: { display: '示範心臟醫學中心' },
      reasonCode: [{
        text: 'Chronic systolic (congestive) heart failure',
        coding: [coding(ICD10, 'I50.22', 'Chronic systolic (congestive) heart failure')],
      }],
    },
    {
      resourceType: 'Condition',
      id: `${patientId}-hfrEF`,
      clinicalStatus: { coding: [coding('http://terminology.hl7.org/CodeSystem/condition-clinical', 'active', 'Active')] },
      verificationStatus: { coding: [coding('http://terminology.hl7.org/CodeSystem/condition-ver-status', 'confirmed', 'Confirmed')] },
      category: [{ coding: [coding('http://terminology.hl7.org/CodeSystem/condition-category', 'problem-list-item', 'Problem List Item')] }],
      code: { text: 'Chronic systolic heart failure', coding: [coding(ICD10, 'I50.22', 'Chronic systolic (congestive) heart failure')] },
      subject: subject(patientId),
      encounter: { reference: `Encounter/${encounterId}` },
      onsetDateTime: '2025-02-15',
    },
    observation(patientId, 'lvef', 'Left ventricular ejection fraction', '10230-1', scenario.lvef, '%'),
    observation(patientId, 'nt-probnp', 'NT-proBNP', '33762-6', scenario.ntproBNP, 'pg/mL'),
    observation(patientId, 'egfr', 'Estimated glomerular filtration rate', '33914-3', scenario.egfr, 'mL/min/1.73m2'),
    observation(patientId, 'potassium', 'Potassium', '2823-3', scenario.potassium, 'mmol/L'),
    observation(patientId, 'sodium', 'Sodium', '2951-2', scenario.sodium, 'mmol/L'),
    observation(patientId, 'hemoglobin', 'Hemoglobin', '718-7', scenario.hemoglobin, 'g/dL'),
    bloodPressure(patientId, scenario.bp),
    observation(patientId, 'heart-rate', 'Heart rate', '8867-4', scenario.heartRate, '/min', 'vital-signs'),
    observation(patientId, 'oxygen-saturation', 'Oxygen saturation', '59408-5', scenario.spo2, '%', 'vital-signs'),
    observation(patientId, 'body-weight', 'Body weight', '29463-7', scenario.weight, 'kg', 'vital-signs'),
    observation(patientId, 'body-height', 'Body height', '8302-2', scenario.height, 'cm', 'vital-signs'),
    {
      resourceType: 'DiagnosticReport',
      id: `${patientId}-echo`,
      status: 'final',
      category: [{ coding: [coding('http://terminology.hl7.org/CodeSystem/v2-0074', 'CUS', 'Cardiac Ultrasound')] }],
      code: { text: 'Echocardiography', coding: [coding(LOINC, '34552-0', 'Cardiac echocardiography report')] },
      subject: subject(patientId),
      encounter: { reference: `Encounter/${encounterId}` },
      effectiveDateTime: '2026-09-08T10:00:00+08:00',
      issued: '2026-09-08T11:00:00+08:00',
      performer: [{ display: '示範心臟醫學中心' }],
      conclusion: `Dilated left ventricle with global hypokinesis. LVEF ${scenario.lvef}%.`,
    },
    {
      resourceType: 'DiagnosticReport',
      id: `${patientId}-ecg`,
      status: 'final',
      category: [{ coding: [coding('http://terminology.hl7.org/CodeSystem/v2-0074', 'EC', 'Electrocardiography')] }],
      code: { text: '12-lead ECG', coding: [coding(LOINC, '11524-6', 'EKG study')] },
      subject: subject(patientId),
      encounter: { reference: `Encounter/${encounterId}` },
      effectiveDateTime: '2026-09-10T08:45:00+08:00',
      issued: '2026-09-10T08:50:00+08:00',
      performer: [{ display: '示範心臟醫學中心' }],
      conclusion: scenario.rhythm,
    },
    {
      resourceType: 'DiagnosticReport',
      id: `${patientId}-cxr`,
      status: 'final',
      category: [{ coding: [coding('http://terminology.hl7.org/CodeSystem/v2-0074', 'RAD', 'Radiology')] }],
      code: { text: 'Chest X-ray' },
      subject: subject(patientId),
      encounter: { reference: `Encounter/${encounterId}` },
      effectiveDateTime: '2026-09-10T08:40:00+08:00',
      issued: '2026-09-10T08:55:00+08:00',
      performer: [{ display: '示範心臟醫學中心' }],
      conclusion: scenario.cxr,
    },
    ...scenario.medications.map((item) => medication(patientId, scenario.id, item)),
  ]

  return {
    resourceType: 'Bundle',
    id: `${patientId}-bundle`,
    type: 'collection',
    meta: { tag: [coding(FIXTURE_SYSTEM, 'synthetic-hfrEF-case', scenario.summary)] },
    entry: resources.map((resource) => ({
      fullUrl: `${resource.resourceType}/${resource.id}`,
      resource,
    })),
  }
}

function writeCases(outputDir = OUT_DIR) {
  fs.mkdirSync(outputDir, { recursive: true })
  const manifest = scenarios.map((scenario) => {
    const bundle = bundleFor(scenario)
    fs.writeFileSync(path.join(outputDir, scenario.filename), `${JSON.stringify(bundle, null, 2)}\n`)
    return {
      id: scenario.id,
      file: scenario.filename,
      name: `模擬 ${scenario.name}`,
      summary: scenario.summary,
      lvef: scenario.lvef,
      resourceCount: bundle.entry.length,
    }
  })
  fs.writeFileSync(path.join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  return manifest
}

module.exports = { bundleFor, scenarios, writeCases }

if (require.main === module) {
  const manifest = writeCases()
  console.log(`Generated ${manifest.length} HFrEF demo bundles in ${OUT_DIR}`)
}
