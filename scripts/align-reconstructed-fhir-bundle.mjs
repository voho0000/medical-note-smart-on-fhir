#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'

const RECONSTRUCTION_SYSTEM = 'https://mediprisma.app/fhir/CodeSystem/reconstruction'
const PANEL_SYSTEM = 'https://mediprisma.app/fhir/CodeSystem/reconstructed-lab-panel'
const DIAGNOSTIC_SECTION_SYSTEM = 'http://terminology.hl7.org/CodeSystem/v2-0074'

function stableId(prefix, ...parts) {
  const digest = createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 20)
  return `${prefix}-${digest}`
}

function resourceReference(resource) {
  return resource?.resourceType && resource?.id
    ? `${resource.resourceType}/${resource.id}`
    : null
}

function isLaboratoryObservation(resource) {
  if (resource?.resourceType !== 'Observation') return false
  return (resource.category ?? []).some((category) =>
    (category.coding ?? []).some((coding) => coding.code === 'laboratory'),
  )
}

function observationDate(resource) {
  return String(
    resource.effectiveDateTime
      ?? resource.effectivePeriod?.start
      ?? resource.issued
      ?? '',
  ).slice(0, 10)
}

function observationPanel(resource) {
  const categoryText = (resource.category ?? [])
    .map((category) => String(category.text ?? '').trim())
    .find(Boolean)
  return categoryText || 'other'
}

function reconstructionTag(code, display) {
  return { system: RECONSTRUCTION_SYSTEM, code, display }
}

function normalizeOrganizationReferences(resources) {
  const names = new Set()
  for (const resource of resources) {
    if (resource.resourceType === 'Encounter' && resource.serviceProvider?.display) {
      names.add(resource.serviceProvider.display.trim())
    }
    if (resource.resourceType === 'DiagnosticReport') {
      for (const performer of resource.performer ?? []) {
        if (performer?.display) names.add(performer.display.trim())
      }
    }
  }

  const organizations = [...names]
    .filter(Boolean)
    .sort()
    .map((name) => ({
      resourceType: 'Organization',
      id: stableId('org', name),
      meta: {
        tag: [reconstructionTag(
          'display-derived-organization',
          'Organization reconstructed only from an explicit provider display name',
        )],
      },
      active: true,
      name,
    }))
  const referenceByName = new Map(
    organizations.map((organization) => [
      organization.name,
      `Organization/${organization.id}`,
    ]),
  )

  for (const resource of resources) {
    if (resource.resourceType === 'Encounter' && resource.serviceProvider?.display) {
      const display = resource.serviceProvider.display.trim()
      resource.serviceProvider = {
        reference: referenceByName.get(display),
        display,
      }
    }
    if (resource.resourceType === 'DiagnosticReport') {
      resource.performer = (resource.performer ?? []).map((performer) => {
        const display = performer?.display?.trim()
        if (!display || !referenceByName.has(display)) return performer
        return { reference: referenceByName.get(display), display }
      })
    }
  }

  return organizations
}

export function alignReconstructedBundle(input) {
  if (input?.resourceType !== 'Bundle' || !Array.isArray(input.entry)) {
    throw new Error('Input must be a FHIR Bundle with an entry array')
  }

  const bundle = structuredClone(input)
  const resources = bundle.entry.map((entry) => entry.resource).filter(Boolean)
  const patientReference = resourceReference(
    resources.find((resource) => resource.resourceType === 'Patient'),
  )
  if (!patientReference) throw new Error('Input Bundle must contain a Patient resource with an id')

  const alreadyLinkedObservationIds = new Set(
    resources
      .filter((resource) => resource.resourceType === 'DiagnosticReport')
      .flatMap((report) => report.result ?? [])
      .map((result) => String(result.reference ?? '').split('/').pop())
      .filter(Boolean),
  )

  const labGroups = new Map()
  for (const observation of resources.filter(isLaboratoryObservation)) {
    if (!observation.id || alreadyLinkedObservationIds.has(observation.id)) continue
    const date = observationDate(observation)
    const panel = observationPanel(observation)
    const subject = observation.subject?.reference || patientReference
    const key = JSON.stringify([date, panel, subject])
    const group = labGroups.get(key) ?? { date, panel, subject, observations: [] }
    group.observations.push(observation)
    labGroups.set(key, group)
  }

  const reconstructedReports = [...labGroups.values()]
    .sort((a, b) => b.date.localeCompare(a.date) || a.panel.localeCompare(b.panel))
    .map((group) => ({
      resourceType: 'DiagnosticReport',
      id: stableId('report-lab', group.date, group.panel, group.subject),
      meta: {
        source: bundle.meta?.source,
        tag: [reconstructionTag(
          'panel-date-grouping',
          'DiagnosticReport grouping inferred from a rendered panel row and date',
        )],
      },
      extension: [{
        url: 'https://mediprisma.app/fhir/StructureDefinition/reconstruction-confidence',
        valueCode: 'inferred',
      }],
      status: 'unknown',
      category: [{
        coding: [{
          system: DIAGNOSTIC_SECTION_SYSTEM,
          code: 'LAB',
          display: 'Laboratory',
        }],
        text: 'Laboratory',
      }],
      code: {
        coding: [{
          system: PANEL_SYSTEM,
          code: group.panel,
          display: `${group.panel} laboratory panel`,
        }],
        text: `${group.panel} laboratory panel (reconstructed grouping)`,
      },
      subject: { reference: group.subject },
      ...(group.date ? { effectiveDateTime: group.date } : {}),
      result: group.observations.map((observation) => ({
        reference: `Observation/${observation.id}`,
        display: observation.code?.text,
      })),
    }))

  const organizations = normalizeOrganizationReferences(resources)
  const newResources = [...organizations, ...reconstructedReports]
  bundle.entry.push(...newResources.map((resource) => ({
    fullUrl: `${resource.resourceType}/${resource.id}`,
    resource,
  })))

  const targetResources = [...resources, ...newResources]
    .map(resourceReference)
    .filter(Boolean)
    .map((reference) => ({ reference }))
  const provenance = {
    resourceType: 'Provenance',
    id: stableId('provenance', bundle.id, bundle.timestamp, targetResources.length),
    meta: {
      tag: [reconstructionTag(
        'synthetic-reconstruction-provenance',
        'Audit trail for resources recovered or grouped from rendered LLM context',
      )],
    },
    target: targetResources,
    recorded: bundle.timestamp ?? bundle.meta?.lastUpdated ?? new Date(0).toISOString(),
    activity: {
      coding: [{
        system: 'http://terminology.hl7.org/CodeSystem/v3-DataOperation',
        code: 'CREATE',
        display: 'create',
      }],
      text: 'Best-effort structural alignment of a lossy Gemini-context reconstruction',
    },
    agent: [{
      type: {
        coding: [{
          system: 'http://terminology.hl7.org/CodeSystem/provenance-participant-type',
          code: 'assembler',
          display: 'Assembler',
        }],
      },
      who: { display: 'MediPrisma reconstruction alignment script' },
    }],
    entity: [{
      role: 'source',
      what: {
        identifier: bundle.identifier,
        display: 'Gemini API log clinical-context text (prompts removed)',
      },
    }],
  }
  bundle.entry.push({
    fullUrl: `Provenance/${provenance.id}`,
    resource: provenance,
  })

  bundle.meta ??= {}
  bundle.meta.tag ??= []
  bundle.meta.tag.push(reconstructionTag(
    'schema-aligned-best-effort',
    'Laboratory observations grouped into inferred DiagnosticReports; unavailable source resources were not fabricated',
  ))
  bundle.extension ??= []
  bundle.extension.push({
    url: 'https://mediprisma.app/fhir/StructureDefinition/reconstruction-alignment-audit',
    extension: [
      { url: 'inferred-lab-reports', valueUnsignedInt: reconstructedReports.length },
      { url: 'display-derived-organizations', valueUnsignedInt: organizations.length },
      { url: 'unrecoverable-service-requests', valueString: 'Original order identity and order metadata absent from rendered context' },
      { url: 'unrecoverable-source-provenance', valueString: 'Original per-resource provenance absent from rendered context' },
    ],
  })

  return bundle
}

async function main() {
  const [inputPath, outputPath] = process.argv.slice(2)
  if (!inputPath || !outputPath) {
    throw new Error('Usage: node scripts/align-reconstructed-fhir-bundle.mjs <input.json> <output.json>')
  }
  const input = JSON.parse(await readFile(inputPath, 'utf8'))
  const aligned = alignReconstructedBundle(input)
  await writeFile(outputPath, `${JSON.stringify(aligned, null, 2)}\n`, 'utf8')
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
