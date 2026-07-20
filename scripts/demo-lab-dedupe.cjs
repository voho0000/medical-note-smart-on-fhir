// Remove the narrow class of duplicate lab Observations created when two
// analyte-level DiagnosticReports cross-link each other's member results.
//
// Safety rule: observations must have the same clinical fingerprint, and
// exactly one copy must match BOTH the NHI and LOINC codes of its parent report.
// Ordinary same-day/same-value results are deliberately left alone.

const fs = require('node:fs')
const path = require('node:path')

const referenceId = (reference) => String(reference || '').split('/').pop()

function codingCode(resource, systemFragment) {
  const codings = Array.isArray(resource?.code?.coding) ? resource.code.coding : []
  const coding = codings.find((candidate) => String(candidate?.system || '').includes(systemFragment))
  return typeof coding?.code === 'string' ? coding.code : ''
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!value || typeof value !== 'object') return value
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = stableValue(value[key])
    return result
  }, {})
}

function clinicalFingerprint(observation) {
  const loinc = codingCode(observation, 'loinc.org')
  if (!loinc) return null
  const performers = (Array.isArray(observation.performer) ? observation.performer : [])
    .map((performer) => performer?.reference || performer?.display || '')
    .filter(Boolean)
    .sort()

  return JSON.stringify(stableValue({
    subject: observation.subject?.reference || '',
    encounter: observation.encounter?.reference || '',
    effectiveDateTime: observation.effectiveDateTime || '',
    effectivePeriod: observation.effectivePeriod || null,
    performer: performers,
    specimen: observation.specimen || null,
    loinc,
    valueQuantity: observation.valueQuantity || null,
    valueString: observation.valueString ?? null,
    valueCodeableConcept: observation.valueCodeableConcept || null,
    status: observation.status || '',
    referenceRange: observation.referenceRange || null,
    interpretation: observation.interpretation || null,
    method: observation.method || null,
    bodySite: observation.bodySite || null,
  }))
}

function pruneCrossLinkedLabDuplicates(resources) {
  const observations = resources.filter((resource) => resource?.resourceType === 'Observation')
  const reports = resources.filter((resource) => resource?.resourceType === 'DiagnosticReport')
  const parentReportsByObservation = new Map()

  for (const report of reports) {
    for (const result of report.result || []) {
      const id = referenceId(result?.reference)
      if (!id) continue
      const parents = parentReportsByObservation.get(id) || []
      parents.push(report)
      parentReportsByObservation.set(id, parents)
    }
  }

  const groups = new Map()
  for (const observation of observations) {
    const fingerprint = clinicalFingerprint(observation)
    if (!fingerprint) continue
    const group = groups.get(fingerprint) || []
    group.push(observation)
    groups.set(fingerprint, group)
  }

  const removedIds = new Set()
  for (const group of groups.values()) {
    if (group.length < 2) continue
    const matchesOwnParent = (observation) => {
      const loinc = codingCode(observation, 'loinc.org')
      const nhi = codingCode(observation, 'nhi-medical-order-code')
      if (!loinc || !nhi) return false
      const parents = parentReportsByObservation.get(observation.id) || []
      return parents.some((report) =>
        codingCode(report, 'loinc.org') === loinc &&
        codingCode(report, 'nhi-medical-order-code') === nhi)
    }

    const winners = group.filter(matchesOwnParent)
    if (winners.length !== 1) continue
    for (const observation of group) {
      if (observation === winners[0]) continue
      if (!parentReportsByObservation.has(observation.id)) continue
      removedIds.add(observation.id)
    }
  }

  if (removedIds.size === 0) return { removedIds: [] }

  for (const report of reports) {
    if (!Array.isArray(report.result)) continue
    report.result = report.result.filter((result) => !removedIds.has(referenceId(result?.reference)))
  }
  const retained = resources.filter((resource) =>
    resource?.resourceType !== 'Observation' || !removedIds.has(resource.id))
  resources.splice(0, resources.length, ...retained)

  return { removedIds: [...removedIds].sort() }
}

module.exports = { clinicalFingerprint, pruneCrossLinkedLabDuplicates }

if (require.main === module) {
  const target = process.argv[2]
  if (!target) {
    console.error('Usage: node scripts/demo-lab-dedupe.cjs <bundle.json>')
    process.exit(1)
  }
  const bundlePath = path.resolve(target)
  const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'))
  if (bundle.resourceType !== 'Bundle' || !Array.isArray(bundle.entry)) {
    throw new Error('Expected a FHIR Bundle with entry[]')
  }
  const resources = bundle.entry.map((entry) => entry.resource).filter(Boolean)
  const { removedIds } = pruneCrossLinkedLabDuplicates(resources)
  const removedSet = new Set(removedIds)
  bundle.entry = bundle.entry.filter((entry) =>
    entry.resource?.resourceType !== 'Observation' || !removedSet.has(entry.resource?.id))
  fs.writeFileSync(bundlePath, JSON.stringify(bundle))
  console.log(`Removed ${removedIds.length} cross-linked duplicate lab observation(s): ${removedIds.join(', ') || 'none'}`)
}
