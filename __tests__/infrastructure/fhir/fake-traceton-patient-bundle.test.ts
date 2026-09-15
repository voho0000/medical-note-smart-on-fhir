/** @jest-environment node */
import fs from 'node:fs'
import path from 'node:path'
import { enrichLocalFhirImport } from '@/src/application/services/local-fhir-import-enrichment.service'
import { createFhirTools } from '@/src/infrastructure/ai/tools/fhir-tools'
import { LocalBundleService } from '@/src/infrastructure/fhir/services/local-bundle.service'

describe('fake Traceton patient bundle', () => {
  it('imports a mixed medication history with exact governed terminology', async () => {
    const file = path.join(process.cwd(), 'e2e/fixtures/fake-traceton-patient-bundle.json')
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
    const enriched = await enrichLocalFhirImport(raw)
    const parsed = LocalBundleService.parse(enriched)

    expect(parsed).not.toBeNull()
    expect(parsed?.patient).toMatchObject({
      id: 'fake-traceton-patient-001',
      gender: 'female',
      birthDate: '1985-01-01',
    })

    const tools = createFhirTools(() => parsed!)
    jest.useFakeTimers().setSystemTime(new Date('2026-09-15T12:00:00+08:00'))
    try {
      const allMedications = await (tools.queryMedications as any).execute({})
      const history = await (tools.queryMedications as any).execute({ query: 'Traceton' })
      const recent = await (tools.queryMedications as any).execute({ timeRange: 'last-90-days' })
      const antihistamine = await (tools.queryMedications as any).execute({ query: '全身性抗組織胺' })
      const active = await (tools.getActiveMedicationList as any).execute({})

      expect(allMedications).toMatchObject({ success: true, count: 7 })
      expect(allMedications.data.every((row: any) => row.terminologyStatus === 'matched')).toBe(true)
      expect(history).toMatchObject({
        success: true,
        count: 1,
        data: [{
          medication: 'Traceton Film Coated Tablets',
          recordedName: '服安痛膜衣錠',
          terminologyStatus: 'matched',
          nhiDrugCode: 'AC56706100',
          drugTerminology: {
            officialNameZh: '服安痛膜衣錠',
            officialNameEn: 'Traceton Film Coated Tablets',
            ingredientText: 'TRAMADOL HCL 37.5 MG+ACETAMINOPHEN (=PARACETAMOL) 325 MG',
            atcCode: 'N02AJ13',
            atcLevel2NameZh: '止痛劑',
            atcLevel4NameZh: '鴉片類／非鴉片止痛藥複方',
          },
        }],
      })
      expect(history.data[0].medicationIdentity).toContain('Traceton Film Coated Tablets')
      expect(history.data[0].medicationIdentity).toContain('TRAMADOL HCL 37.5 MG+ACETAMINOPHEN')
      expect(recent).toMatchObject({ count: 3, timeRange: 'last-90-days' })
      expect(antihistamine).toMatchObject({
        count: 1,
        data: [{
          medication: 'CETIZINE F.C. TABLET 10MG (CETIRIZINE)',
          drugTerminology: {
            atcCode: 'R06AE07',
            atcLevel2NameZh: '全身性抗組織胺',
          },
        }],
      })
      expect(active).toMatchObject({ count: 4, uncertainCount: 1 })
      expect(active.uncertainData).toEqual([
        expect.objectContaining({
          medication: 'QUICK CAPSULES 20MG (OMEPRAZOLE)',
          currentness: 'uncertain-source-status',
        }),
      ])
    } finally {
      jest.useRealTimers()
    }
  })
})
