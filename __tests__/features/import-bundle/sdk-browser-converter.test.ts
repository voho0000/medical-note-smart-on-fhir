import { prepareLocalImportFile } from '@/features/import-bundle/services/local-import-file.service'

describe('vendored Health Bank SDK browser converter', () => {
  it('falls back locally, accepts a BOM, masks the identifier, and merges same-day items', async () => {
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
        resourceType?: string
        identifier?: Array<{ value?: string }>
        valueQuantity?: { value?: number }
      }
    }>

    expect(entries.find(({ resource }) => resource.resourceType === 'Patient')
      ?.resource.identifier?.[0]?.value).toBe('A12345XXXX')
    expect(entries.filter(({ resource }) => resource.resourceType === 'Observation'))
      .toHaveLength(1)
    expect(entries.find(({ resource }) => resource.resourceType === 'Observation')
      ?.resource.valueQuantity?.value).toBe(101)
    expect(result.sourceMetadata?.labDuplicateMerge).toMatchObject({
      sourceCount: 2,
      convertedCount: 1,
      mergedCount: 1,
      conflictingValueGroupCount: 1,
    })
    expect(result.sourceMetadata?.source).toBe('health-bank-sdk-json')
  })
})
