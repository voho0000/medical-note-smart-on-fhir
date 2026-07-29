import { prepareLocalImportFile } from '@/features/import-bundle/services/local-import-file.service'

describe('vendored Health Bank SDK browser converter', () => {
  it('accepts a BOM, masks the identifier, and preserves distinct same-day results', async () => {
    const input = {
      myhealthbank: {
        bdata: {
          'b1.1': 'A123456789',
          'b1.2': '1150729',
          r7: [
            {
              'r7.6': '20260102',
              'r7.7': '202601031000',
              'r7.8': '09005C',
              'r7.10': 'Glucose',
              'r7.11': '98',
            },
            {
              'r7.6': '20260102',
              'r7.7': '202601041200',
              'r7.8': '09005C',
              'r7.10': 'Glucose',
              'r7.11': '101',
            },
          ],
          r8: [
            {
              'r8.1': '5',
              'r8.2': '高屏業務組',
              'r8.3': '1234567890',
              'r8.4': '測試醫院',
              'r8.5': '20260103',
              'r8.6': '20260103',
              'r8.7': '202601041200',
              'r8.8': '32001C',
              'r8.9': '胸腔檢查',
              'r8.10': 'Radiography report content',
            },
            {
              'r8.1': '5',
              'r8.2': '高屏業務組',
              'r8.3': '1234567890',
              'r8.4': '測試醫院',
              'r8.5': '20260103',
              'r8.6': '20260103',
              'r8.7': '202601041200',
              'r8.8': '25004C',
              'r8.9': '第四級外科病理',
              'r8.10': 'Pathology report content',
            },
          ],
        },
      },
    }

    const jsonBytes = new TextEncoder().encode(JSON.stringify(input))
    const bytesWithBom = new Uint8Array(jsonBytes.byteLength + 3)
    bytesWithBom.set([0xef, 0xbb, 0xbf])
    bytesWithBom.set(jsonBytes, 3)
    const result = await prepareLocalImportFile({
      arrayBuffer: async () => bytesWithBom.buffer,
    } as File)
    const entries = result.bundle.entry as Array<{
      resource: {
        id?: string
        resourceType?: string
        identifier?: Array<{ value?: string }>
        valueQuantity?: { value?: number }
        category?: Array<{
          coding?: Array<{ system?: string; code?: string }>
          text?: string
        }>
      }
    }>

    expect(entries.find(({ resource }) => resource.resourceType === 'Patient')
      ?.resource.identifier?.[0]?.value).toBe('A12345XXXX')
    const observations = entries.filter(({ resource }) => resource.resourceType === 'Observation')
    expect(observations).toHaveLength(2)
    expect(observations.map(({ resource }) => resource.valueQuantity?.value)
      .sort((left, right) => (left ?? 0) - (right ?? 0)))
      .toEqual([98, 101])
    expect(new Set(observations.map(({ resource }) => resource.id)).size).toBe(2)
    expect(result.sourceMetadata?.labDuplicateMerge).toMatchObject({
      sourceCount: 2,
      convertedCount: 2,
      mergedCount: 0,
      conflictingValueGroupCount: 1,
    })
    expect(result.sourceMetadata?.source).toBe('health-bank-sdk-json')
    expect(result.sourceMetadata?.converterVersion).toBe('0.1.3')
    const imagingReport = entries.find(({ resource }) =>
      resource.resourceType === 'DiagnosticReport'
      && resource.category?.some((category) =>
        category.coding?.some((coding) => coding.code === 'r8'),
      ),
    )?.resource
    expect(imagingReport?.category?.find((category) =>
      category.coding?.some((coding) => coding.code === 'r8'),
    )).toMatchObject({
      coding: [{
        system: 'https://nhi-fhir-bridge.github.io/CodeSystem/health-bank-sdk-section',
        code: 'r8',
      }],
      text: '影像或病理檢查報告',
    })
    const pathologyReport = entries.find(({ resource }) =>
      resource.resourceType === 'DiagnosticReport'
      && resource.category?.some((category) =>
        category.coding?.some((coding) => coding.code === 'PAT'),
      ),
    )?.resource
    expect(pathologyReport?.category?.flatMap((category) => category.coding ?? [])
      .map((coding) => coding.code)).toEqual(expect.arrayContaining(['PAT', 'r8']))
  })

  it('still merges exact clinical retransmissions', async () => {
    const baseRow = {
      'r7.2': '業務組',
      'r7.3': '1234567890',
      'r7.4': '測試醫院',
      'r7.5': '20260101',
      'r7.6': '20260102',
      'r7.8': '09005C',
      'r7.9': '血糖檢查',
      'r7.10': 'Glucose',
      'r7.11': '98',
      'r7.12': '70-99',
    }
    const input = {
      myhealthbank: {
        bdata: {
          'b1.1': 'A123456789',
          'b1.2': '1150729',
          r7: [
            { ...baseRow, 'r7.7': '202601031000' },
            { ...baseRow, 'r7.7': '202601041200' },
          ],
        },
      },
    }
    const encoded = new TextEncoder().encode(JSON.stringify(input))
    const result = await prepareLocalImportFile({
      arrayBuffer: async () => encoded.buffer,
    } as File)
    const entries = result.bundle.entry as Array<{
      resource: { resourceType?: string; valueQuantity?: { value?: number } }
    }>

    expect(entries.filter(({ resource }) => resource.resourceType === 'Observation'))
      .toHaveLength(1)
    expect(entries.find(({ resource }) => resource.resourceType === 'Observation')
      ?.resource.valueQuantity?.value).toBe(98)
    expect(result.sourceMetadata?.labDuplicateMerge).toMatchObject({
      sourceCount: 2,
      convertedCount: 1,
      mergedCount: 1,
      conflictingValueGroupCount: 0,
    })
  })
})
