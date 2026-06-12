// Regression coverage for display canonicalisation of person/place references
// (attachReferenceDisplays), modeled on the TWCORE-OPD-004 門診 scenario file.
//
// TW-Core document bundles model the attending physician as
// `Encounter.participant[].individual → Reference(Practitioner)` and the
// institution as `serviceProvider → Reference(Organization)` — with NO display
// strings. The UI (useVisitHistory → VisitItem「主治醫師：」) renders ONLY
// `.display`, so both showed blank. These tests lock in that the ingestion
// boundary resolves in-bundle references to human-readable names.

import {
  LocalBundleService,
  canonicalizeBundleResources,
  attachReferenceDisplays,
} from '@/src/infrastructure/fhir/services/local-bundle.service'

// Miniature of TWCORE-OPD-004: document bundle, urn:uuid fullUrls, physician
// modeled via Practitioner + PractitionerRole, institution via Organization.
function twcoreOpdBundle(): any {
  return {
    resourceType: 'Bundle',
    type: 'document',
    entry: [
      {
        fullUrl: 'urn:uuid:pat-1',
        resource: {
          resourceType: 'Patient',
          name: [{ use: 'official', text: '楊雅霖' }],
          gender: 'female',
          birthDate: '1917-04-07',
        },
      },
      {
        fullUrl: 'urn:uuid:org-1',
        resource: {
          resourceType: 'Organization',
          active: true,
          name: '衛生福利部臺北醫院',
        },
      },
      {
        fullUrl: 'urn:uuid:prac-1',
        resource: {
          resourceType: 'Practitioner',
          active: true,
          name: [{ use: 'official', text: '張怡穎' }],
        },
      },
      {
        fullUrl: 'urn:uuid:role-1',
        resource: {
          resourceType: 'PractitionerRole',
          active: true,
          practitioner: { reference: 'urn:uuid:prac-1' },
          organization: { reference: 'urn:uuid:org-1' },
          code: [{ coding: [{ code: 'PR-0003', display: '家庭醫學科醫師' }] }],
        },
      },
      {
        fullUrl: 'urn:uuid:enc-1',
        resource: {
          resourceType: 'Encounter',
          status: 'finished',
          class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB' },
          subject: { reference: 'urn:uuid:pat-1' },
          participant: [
            {
              type: [
                {
                  coding: [
                    {
                      system: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationType',
                      code: 'ATND',
                    },
                  ],
                },
              ],
              individual: { reference: 'urn:uuid:prac-1' },
            },
          ],
          period: { start: '2026-06-08T07:05:18.241Z', end: '2026-06-08T07:30:18.241Z' },
          serviceProvider: { reference: 'urn:uuid:org-1' },
        },
      },
    ],
  }
}

describe('attachReferenceDisplays — TW-Core practitioner/organization resolution', () => {
  function resolved() {
    const resources = canonicalizeBundleResources(twcoreOpdBundle())
    attachReferenceDisplays(resources)
    return resources
  }

  it('stamps the attending physician name onto Encounter.participant.individual', () => {
    const enc = resolved().find((r) => r.resourceType === 'Encounter')
    expect(enc.participant[0].individual.display).toBe('張怡穎')
  })

  it('stamps the institution name onto Encounter.serviceProvider', () => {
    const enc = resolved().find((r) => r.resourceType === 'Encounter')
    expect(enc.serviceProvider.display).toBe('衛生福利部臺北醫院')
  })

  it('resolves a PractitionerRole reference through to the practitioner name', () => {
    const resources = canonicalizeBundleResources(twcoreOpdBundle())
    // Point the participant at the ROLE instead of the practitioner.
    const enc = resources.find((r) => r.resourceType === 'Encounter')
    enc.participant[0].individual.reference = 'PractitionerRole/role-1'
    attachReferenceDisplays(resources)
    expect(enc.participant[0].individual.display).toBe('張怡穎')
  })

  it('never overwrites an existing display string', () => {
    const resources = canonicalizeBundleResources(twcoreOpdBundle())
    const enc = resources.find((r) => r.resourceType === 'Encounter')
    enc.serviceProvider.display = '原始名稱'
    attachReferenceDisplays(resources)
    expect(enc.serviceProvider.display).toBe('原始名稱')
  })

  it('assembles family+given when a Practitioner has no name.text', () => {
    const bundle = twcoreOpdBundle()
    bundle.entry[2].resource.name = [{ family: 'Wang', given: ['Ming', 'Hua'] }]
    const resources = canonicalizeBundleResources(bundle)
    attachReferenceDisplays(resources)
    const enc = resources.find((r) => r.resourceType === 'Encounter')
    expect(enc.participant[0].individual.display).toBe('Wang Ming Hua')
  })
})

describe('LocalBundleService.parse — physician flows to the encounter entity', () => {
  it('exposes participant display + serviceProvider display on the parsed encounter', () => {
    const data = LocalBundleService.parse(twcoreOpdBundle())
    expect(data).not.toBeNull()
    const enc = data!.collection.encounters[0]
    expect(enc.participant?.[0]?.individual?.display).toBe('張怡穎')
    expect(enc.serviceProvider?.display).toBe('衛生福利部臺北醫院')
  })
})
