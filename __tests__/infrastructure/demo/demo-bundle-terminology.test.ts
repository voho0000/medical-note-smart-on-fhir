import fs from 'node:fs'
import path from 'node:path'
import {
  NHI_DRUG_ENRICHMENT_POLICY_TAG_SYSTEM,
  NHI_DRUG_ENRICHMENT_POLICY_VERSION,
} from '@/src/infrastructure/fhir/services/nhi-drug-terminology-enrichment.service'

const ATC_HIERARCHY_TAG_SYSTEM =
  'https://nhi-fhir-bridge.github.io/CodeSystem/atc-hierarchy-snapshot'

function demoResources() {
  const bundle = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'public/demo/demo-bundle.json'), 'utf8'),
  )
  return (bundle.entry ?? [])
    .map((entry: any) => entry?.resource)
    .filter(Boolean)
}

describe('committed demo terminology', () => {
  it('ships current MedicationKnowledge so initial demo parsing does not load the runtime snapshot', () => {
    const resources = demoResources()
    const knowledge = resources.filter(
      (resource: any) => resource.resourceType === 'MedicationKnowledge',
    )
    expect(knowledge.length).toBeGreaterThan(0)

    for (const resource of knowledge) {
      expect(resource.meta?.tag).toEqual(expect.arrayContaining([
        expect.objectContaining({ system: ATC_HIERARCHY_TAG_SYSTEM }),
        expect.objectContaining({
          system: NHI_DRUG_ENRICHMENT_POLICY_TAG_SYSTEM,
          code: NHI_DRUG_ENRICHMENT_POLICY_VERSION,
        }),
      ]))
    }

    const knowledgeRefs = new Set(
      knowledge.map((resource: any) => `MedicationKnowledge/${resource.id}`),
    )
    const linkedKnowledgeRefs = resources
      .filter((resource: any) => resource.resourceType === 'MedicationRequest')
      .flatMap((request: any) => request.supportingInformation ?? [])
      .map((reference: any) => reference?.reference)
      .filter((reference: unknown): reference is string =>
        typeof reference === 'string' && reference.startsWith('MedicationKnowledge/'))
    expect(linkedKnowledgeRefs.length).toBeGreaterThan(0)
    // Some exact NHI codes are legitimately absent from the official
    // snapshot. Every link that enrichment *did* produce must resolve to the
    // committed knowledge set; unresolved source prescriptions remain
    // untouched rather than receiving invented terminology.
    for (const reference of linkedKnowledgeRefs) {
      expect(knowledgeRefs.has(reference)).toBe(true)
    }
  })
})
