import { enrichBundleWithNhiDrugTerminology } from '@/src/infrastructure/fhir/services/nhi-drug-terminology-enrichment.service'
import { LocalBundleService } from '@/src/infrastructure/fhir/services/local-bundle.service'

const NHI_DRUG_CODE_SYSTEM =
  'https://twcore.mohw.gov.tw/CodeSystem/nhi-drug-code'

function resources(bundle: Record<string, any>, resourceType: string) {
  return (bundle.entry ?? [])
    .map((entry: any) => entry?.resource)
    .filter((resource: any) => resource?.resourceType === resourceType)
}

function medicationRequest(overrides: Record<string, unknown> = {}) {
  return {
    resourceType: 'MedicationRequest',
    id: 'mr-1',
    status: 'active',
    intent: 'order',
    authoredOn: '2024-04-01T09:00:00+08:00',
    medicationCodeableConcept: {
      coding: [{
        system: NHI_DRUG_CODE_SYSTEM,
        code: 'AC49322100',
        display: 'SOURCE DISPLAY MUST REMAIN',
      }],
      text: '來源藥名不可被覆寫',
    },
    ...overrides,
  }
}

function bundleWith(...inputResources: Record<string, unknown>[]) {
  return {
    resourceType: 'Bundle',
    type: 'collection',
    timestamp: '2026-07-29T12:00:00Z',
    entry: inputResources.map((resource) => ({ resource })),
  }
}

describe('App-side NHI drug terminology enrichment', () => {
  it('does not load or alter anything when no exact NHI medication is eligible', async () => {
    const source = bundleWith(
      { resourceType: 'Patient', id: 'p1' },
      medicationRequest({
        medicationCodeableConcept: {
          coding: [{ system: 'http://www.nlm.nih.gov/research/umls/rxnorm', code: '42347' }],
          text: 'Bupropion',
        },
      }),
    )

    const result = await enrichBundleWithNhiDrugTerminology(source)

    expect(result.bundle).toBe(source)
    expect(result.report).toMatchObject({
      status: 'not-applicable',
      medicationRequestCount: 1,
      eligibleRequestCount: 0,
      linkedRequestCount: 0,
      skipped: { missingNhiDrugCode: 1 },
    })
  })

  it('adds date-effective MedicationKnowledge and Provenance without rewriting source fields', async () => {
    const sourceRequest = medicationRequest()
    const source = bundleWith(
      { resourceType: 'Patient', id: 'p1' },
      sourceRequest,
    )

    const result = await enrichBundleWithNhiDrugTerminology(source)
    const request = resources(result.bundle, 'MedicationRequest')[0]
    const knowledge = resources(result.bundle, 'MedicationKnowledge')[0]
    const provenance = resources(result.bundle, 'Provenance')[0]

    expect(result.report).toMatchObject({
      status: 'enriched',
      snapshotId: 'nhi-drug-terminology-20260728',
      medicationRequestCount: 1,
      eligibleRequestCount: 1,
      linkedRequestCount: 1,
      knowledgeResourceCount: 1,
      atcResolvedCount: 1,
      byResolutionStatus: { resolved: 1 },
    })
    expect(sourceRequest).not.toHaveProperty('supportingInformation')
    expect(request.medicationCodeableConcept).toEqual(
      sourceRequest.medicationCodeableConcept,
    )
    expect(request.supportingInformation).toEqual([
      { reference: `MedicationKnowledge/${knowledge.id}` },
    ])
    expect(knowledge).toMatchObject({
      resourceType: 'MedicationKnowledge',
      code: {
        coding: [{
          system: NHI_DRUG_CODE_SYSTEM,
          version: 'nhi-drug-terminology-20260728',
          code: 'AC49322100',
          display: 'Buprotrin sustained release F.C. Tablets 150mg 〝Royal〞',
        }],
      },
      doseForm: { text: '持續性藥效膜衣錠' },
      ingredient: [{
        itemCodeableConcept: { text: 'BUPROPION HYDROCHLORIDE 150 MG' },
      }],
      medicineClassification: [{
        classification: [{
          coding: [{
            system: 'http://www.whocc.no/atc',
            code: 'N06AX12',
            display: 'bupropion',
          }],
        }],
      }],
    })
    expect(provenance).toMatchObject({
      resourceType: 'Provenance',
      recorded: '2026-07-29T12:00:00Z',
      target: [{ reference: `MedicationKnowledge/${knowledge.id}` }],
      entity: [{
        what: {
          display: expect.stringContaining('SHA-256'),
        },
      }],
    })
  })

  it('is idempotent and keeps one link, one knowledge resource, and one provenance', async () => {
    const once = await enrichBundleWithNhiDrugTerminology(
      bundleWith(
        { resourceType: 'Patient', id: 'p1' },
        medicationRequest(),
      ),
    )
    const twice = await enrichBundleWithNhiDrugTerminology(once.bundle)

    expect(resources(twice.bundle, 'MedicationRequest')[0].supportingInformation)
      .toHaveLength(1)
    expect(resources(twice.bundle, 'MedicationKnowledge')).toHaveLength(1)
    expect(resources(twice.bundle, 'Provenance')).toHaveLength(1)
    expect(twice.report).toMatchObject({
      status: 'enriched',
      linkedRequestCount: 1,
      knowledgeResourceCount: 0,
    })
  })

  it('fails closed for a missing date and for multiple NHI codes', async () => {
    const source = bundleWith(
      { resourceType: 'Patient', id: 'p1' },
      medicationRequest({ id: 'missing-date', authoredOn: undefined }),
      medicationRequest({
        id: 'ambiguous',
        medicationCodeableConcept: {
          coding: [
            { system: NHI_DRUG_CODE_SYSTEM, code: 'AC49322100' },
            { system: NHI_DRUG_CODE_SYSTEM, code: 'BC26476100' },
          ],
        },
      }),
    )

    const result = await enrichBundleWithNhiDrugTerminology(source)

    expect(result.bundle).toBe(source)
    expect(result.report).toMatchObject({
      status: 'not-applicable',
      eligibleRequestCount: 0,
      linkedRequestCount: 0,
      skipped: {
        missingPrescriptionDate: 1,
        ambiguousNhiDrugCode: 1,
      },
    })
  })

  it('resolves a NHI code carried by a referenced Medication resource', async () => {
    const source = bundleWith(
      { resourceType: 'Patient', id: 'p1' },
      {
        resourceType: 'Medication',
        id: 'med-1',
        code: {
          coding: [{ system: NHI_DRUG_CODE_SYSTEM, code: 'AC49322100' }],
          text: '來源藥名',
        },
      },
      medicationRequest({
        medicationCodeableConcept: undefined,
        medicationReference: { reference: 'Medication/med-1' },
      }),
    )

    const result = await enrichBundleWithNhiDrugTerminology(source)

    expect(result.report.linkedRequestCount).toBe(1)
    expect(resources(result.bundle, 'MedicationKnowledge')).toHaveLength(1)
  })

  it('maps linked MedicationKnowledge into a separate App view model', async () => {
    const enriched = await enrichBundleWithNhiDrugTerminology(
      bundleWith(
        { resourceType: 'Patient', id: 'p1' },
        medicationRequest(),
      ),
    )
    const parsed = LocalBundleService.parse(enriched.bundle)

    expect(parsed?.collection.medications[0]).toMatchObject({
      medicationCodeableConcept: {
        text: '來源藥名不可被覆寫',
      },
      drugTerminology: {
        source: 'nhi-official-drug-master',
        snapshotId: 'nhi-drug-terminology-20260728',
        officialNameZh: '〝皇佳〞慮舒妥 持續性藥效膜衣錠150毫克',
        officialNameEn: 'Buprotrin sustained release F.C. Tablets 150mg 〝Royal〞',
        ingredientText: 'BUPROPION HYDROCHLORIDE 150 MG',
        doseForm: '持續性藥效膜衣錠',
        atcCode: 'N06AX12',
        atcNameEn: 'bupropion',
      },
    })
  })
})
