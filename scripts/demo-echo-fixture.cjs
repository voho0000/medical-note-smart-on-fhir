#!/usr/bin/env node

/**
 * Curated, deidentified echo pair used to demonstrate shared-report grouping.
 * The clinical narrative comes from the user-supplied report, while every
 * patient, institution, resource id, and provenance value is
 * resolved entirely within the bundled demo record. The original examination
 * and report issue dates are retained in a dedicated demo encounter.
 */

const fs = require('node:fs')
const path = require('node:path')

const FIXTURE_SOURCE = 'mediprisma/curated-demo-fixture'
const FIXTURE_TAG_SYSTEM = 'https://mediprisma.app/CodeSystem/demo-fixture'
const FIXTURE_TAG_CODE = 'shared-echocardiography-report'
const ECHO_ENCOUNTER_ID = 'demo-encounter-echo'
const ECHO_EXAM_DATE = '2024-09-09T00:00:00+08:00'
const ECHO_ISSUED_DATE = '2024-10-28T00:00:00+08:00'
const ECHO_REPORT_ID = 'demo-diagnosticreport-echo'
const DOPPLER_REPORT_ID = 'demo-diagnosticreport-echo-doppler'

const DEMO_ECHO_NARRATIVE = [
  'DOPPLER ＆ ECHOCARDIOGRAPHIC REPORT:',
  '',
  'Indication: assess LV function',
  '--------------------------------------------------------------',
  'IVSd          1.1 (0.6~1.2)cm     AO             4 (2.3~3.7)cm',
  'LVPWd        0.87 (0.5~1.1)cm     LA           3.5 (1.8~3.8)cm',
  'LVIDd         4.3 (3.6~5.2)cm     EDV         83.1 (46~138)ml',
  'LVIDs        2.52 (2.0~3.6)cm     ESV         22.8 (10~54)ml',
  'EF(MM)       72.6 (Normal≧55)%   FS%         41.4 %',
  'EF(biplane)       (Normal≧55)%   LV Mass    139.5 gm',
  'EF(A4C)           (Normal≧55)%   Sep e`Vel        cm/s',
  'EF(A2C)           (Normal≧55)%   Sep a`Vel        cm/s',
  'RVIDd             (1.3~2.5)cm     E/Sep e`',
  'TAPSE             (1.6~3.0)cm     E/Ave e`',
  '--------------------------------------------------------------',
  '二尖瓣    形態',
  'MR:nil               MV E/A   54/89.1cm/s E/A Ratio 0.61',
  '                     MR ERO          cm2',
  'MS:nil               MV P1/2t        ms   MVA P1/2t      cm2',
  '                     MVA_Planimetry       cm2',
  '--------------------------------------------------------------',
  '三尖瓣    形態',
  'TR:nil               TR Vmax         cm/s TV PressG      mmHg',
  'TS:nil               TV P1/2t        ms   TV Area        cm2',
  '--------------------------------------------------------------',
  '主動脈瓣  形態',
  'AR:mild              AR P1/2t        ms   LVOT Diam      cm',
  '                                          LVOT Vmax      cm/s',
  'AS:nil               AVA(Vmax)       cm2  AV Vmax    114 cm/s',
  '                                          AV VmaxPG    5 mmHg',
  '--------------------------------------------------------------',
  '肺動脈瓣  形態',
  'PR:mild',
  'PS:nil               PV Vmax      92 cm/s PV PressG    3 mmHg',
  '--------------------------------------------------------------',
  '心包膜液  形態     體積 nil',
  'Spontaneous echo contrast: nil',
  'LV Dias dysfunction: Grade 1 (impaired relaxation pattern)',
  '--------------------------------------------------------------',
  '其他發現 ASD nil     PDA nil',
  '         VSD nil     TOF nil',
  '--------------------------------------------------------------',
  '心跳:   心律: normal sinus rhythm',
  '--------------------------------------------------------------',
  '',
  'Conclusion:',
  '● Normal wall motion with adequate LV systolic function ( EF = 72.6% )( wall',
  '  motion systolic index = 1 )',
  '● LV diastolic dysfunction: Grade 1',
  '● mild AR, mild PR',
  '● cardiac rhythm: normal sinus rhythm',
  '--------------------------------------------------------------',
  'Short summary: LVIDd = 4.3/LVIDs = 2.52/IVSd = 1.1/LVPWd = .87//LA = 3.5cm/(EF =',
  ' 72.6%)/adequate LVP (WMSI = 1)/mild AR, mild PR, /Grade 1 LV diastolic',
  ' dysfunction/',
].join('\n')

function isHospitalAmbulatoryEncounter(resource) {
  const institution = resource?.serviceProvider?.display || ''
  return resource?.resourceType === 'Encounter'
    && resource?.class?.code === 'AMB'
    && resource?.status !== 'entered-in-error'
    && /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(resource?.period?.start || '')
    && /^Patient\/demo-/.test(resource?.subject?.reference || '')
    && /^\u793a\u7bc4/.test(institution)
    && /(?:\u91ab\u9662|\u91ab\u5b78\u4e2d\u5fc3)$/.test(institution)
}

function chooseAnchorEncounter(resources) {
  const preferred = resources.find((resource) => (
    resource?.id === 'demo-encounter-42' && isHospitalAmbulatoryEncounter(resource)
  ))
  if (preferred) return preferred
  return resources
    .filter(isHospitalAmbulatoryEncounter)
    .sort((a, b) => String(b.period.start).localeCompare(String(a.period.start)))[0]
}

function isManagedEchoFixture(resource) {
  return resource?.resourceType === 'DiagnosticReport'
    && resource?.meta?.source === FIXTURE_SOURCE
    && (resource?.meta?.tag || []).some((tag) => (
      tag?.system === FIXTURE_TAG_SYSTEM && tag?.code === FIXTURE_TAG_CODE
    ))
}

function existingFixtureAnchor(resources, existingFixtures) {
  if (existingFixtures.length === 0) return null
  for (const fixture of existingFixtures) {
    if (!isManagedEchoFixture(fixture)) {
      throw new Error(`Demo echo fixture id collision: ${fixture.id}`)
    }
  }
  const encounterRefs = new Set(existingFixtures.map((fixture) => fixture?.encounter?.reference))
  if (encounterRefs.size !== 1) throw new Error('Existing demo echo fixtures do not share one encounter')
  const encounterRef = [...encounterRefs][0]
  const encounterId = typeof encounterRef === 'string' && encounterRef.startsWith('Encounter/')
    ? encounterRef.slice('Encounter/'.length)
    : ''
  const anchor = resources.find((resource) => resource?.resourceType === 'Encounter' && resource?.id === encounterId)
  if (!anchor || !isHospitalAmbulatoryEncounter(anchor)) {
    throw new Error('Existing demo echo fixture encounter is missing or not a deidentified hospital visit')
  }
  return anchor
}

function makeReport({ id, orderCode, title, anchor }) {
  const date = anchor.period.start
  const institution = anchor.serviceProvider.display
  return {
    resourceType: 'DiagnosticReport',
    id,
    meta: {
      versionId: '1',
      source: FIXTURE_SOURCE,
      tag: [{
        system: FIXTURE_TAG_SYSTEM,
        code: FIXTURE_TAG_CODE,
        display: 'Curated shared echocardiography demo fixture',
      }],
    },
    status: 'final',
    category: [{
      coding: [{
        system: 'http://terminology.hl7.org/CodeSystem/v2-0074',
        code: 'CUS',
        display: 'Cardiac Ultrasound',
      }],
    }],
    code: {
      coding: [{
        system: 'https://twcore.mohw.gov.tw/CodeSystem/nhi-medical-order-code',
        code: orderCode,
        display: title,
      }],
      text: title,
    },
    subject: { reference: anchor.subject.reference },
    encounter: { reference: `Encounter/${anchor.id}` },
    effectiveDateTime: date,
    issued: ECHO_ISSUED_DATE,
    performer: [{ display: institution }],
    conclusion: DEMO_ECHO_NARRATIVE,
  }
}

function addDemoEchoFixture(resources) {
  if (!Array.isArray(resources)) throw new TypeError('resources must be an array')
  const fixtureIds = new Set([ECHO_REPORT_ID, DOPPLER_REPORT_ID])
  const existingFixtures = resources.filter((resource) => fixtureIds.has(resource?.id))
  const template = existingFixtureAnchor(resources, existingFixtures) || chooseAnchorEncounter(resources)
  if (!template) throw new Error('No deidentified ambulatory demo-hospital encounter is available for the echo fixture')

  const anchor = {
    resourceType: 'Encounter',
    id: ECHO_ENCOUNTER_ID,
    status: 'finished',
    class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB' },
    subject: { reference: template.subject.reference },
    serviceProvider: { display: template.serviceProvider.display },
    period: { start: ECHO_EXAM_DATE, end: ECHO_EXAM_DATE },
  }
  const fixtures = [
    anchor,
    makeReport({
      id: ECHO_REPORT_ID,
      orderCode: '18005C',
      title: '超音波心臟圖(包括單面、雙面)',
      anchor,
    }),
    makeReport({
      id: DOPPLER_REPORT_ID,
      orderCode: '18007C',
      title: '杜卜勒氏彩色心臟血流圖',
      anchor,
    }),
  ]

  const byId = new Map(resources.map((resource) => [resource?.id, resource]))
  const addedResources = []
  for (const fixture of fixtures) {
    const existing = byId.get(fixture.id)
    if (!existing) {
      addedResources.push(fixture)
      continue
    }
    if (JSON.stringify(existing) !== JSON.stringify(fixture)) {
      throw new Error(`Demo echo fixture id collision: ${fixture.id}`)
    }
  }

  return {
    resources: addedResources.length > 0 ? [...resources, ...addedResources] : resources,
    addedResources,
    anchorEncounterId: anchor.id,
  }
}

function addDemoEchoFixtureToBundle(bundle) {
  if (bundle?.resourceType !== 'Bundle' || !Array.isArray(bundle.entry)) {
    throw new TypeError('Expected a FHIR Bundle with entry[]')
  }
  const resources = bundle.entry.map((entry) => entry?.resource).filter(Boolean)
  const result = addDemoEchoFixture(resources)
  if (result.addedResources.length === 0) return { bundle, ...result }
  return {
    bundle: {
      ...bundle,
      entry: [
        ...bundle.entry,
        ...result.addedResources.map((resource) => ({
          fullUrl: `${resource.resourceType}/${resource.id}`,
          resource,
        })),
      ],
    },
    ...result,
  }
}

module.exports = {
  DEMO_ECHO_NARRATIVE,
  ECHO_ENCOUNTER_ID,
  ECHO_EXAM_DATE,
  ECHO_ISSUED_DATE,
  DOPPLER_REPORT_ID,
  ECHO_REPORT_ID,
  FIXTURE_SOURCE,
  FIXTURE_TAG_CODE,
  addDemoEchoFixture,
  addDemoEchoFixtureToBundle,
}

if (require.main === module) {
  const target = path.resolve(process.argv[2] || path.join(__dirname, '..', 'public', 'demo', 'demo-bundle.json'))
  const bundle = JSON.parse(fs.readFileSync(target, 'utf8'))
  const result = addDemoEchoFixtureToBundle(bundle)
  fs.writeFileSync(target, JSON.stringify(result.bundle))
  console.log(`Demo echo fixture: ${result.addedResources.length} resource(s) added; anchor ${result.anchorEncounterId}`)
}
