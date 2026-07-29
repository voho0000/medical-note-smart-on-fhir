import {
  convertSdkJsonToFhir,
  parseJsonBytes,
} from '@/vendor/nhi-fhir-bridge-sdk-json/browser.js'

describe('vendored Health Bank SDK browser converter', () => {
  it('converts locally, masks the identifier, and merges same-day items', () => {
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

    const parsed = parseJsonBytes(new TextEncoder().encode(JSON.stringify(input)))
    const result = convertSdkJsonToFhir(parsed, {
      identifierMode: 'masked',
      timestamp: '2000-01-01T00:00:00Z',
    })
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
    expect(result.report.labDuplicateMerge).toMatchObject({
      sourceCount: 2,
      convertedCount: 1,
      mergedCount: 1,
      conflictingValueGroupCount: 1,
    })
  })
})
