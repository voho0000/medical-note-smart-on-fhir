import {
  FhirClientService,
  FhirPaginationLimitError,
  nextPageUrl,
} from '@/src/infrastructure/fhir/client/fhir-client.service'

describe('nextPageUrl (FHIR Bundle pagination)', () => {
  it('returns the url of the link whose relation is "next"', () => {
    const bundle = {
      resourceType: 'Bundle',
      link: [
        { relation: 'self', url: 'https://fhir.example/Observation?_count=100' },
        { relation: 'next', url: 'https://fhir.example/Observation?_getpages=abc&_count=100' },
      ],
    }
    expect(nextPageUrl(bundle)).toBe('https://fhir.example/Observation?_getpages=abc&_count=100')
  })

  it('returns undefined on the last page (only self/previous links)', () => {
    const bundle = {
      link: [
        { relation: 'self', url: 'https://fhir.example/Observation' },
        { relation: 'previous', url: 'https://fhir.example/Observation?_getpages=prev' },
      ],
    }
    expect(nextPageUrl(bundle)).toBeUndefined()
  })

  it('returns undefined when there is no link array', () => {
    expect(nextPageUrl({ resourceType: 'Bundle' })).toBeUndefined()
    expect(nextPageUrl({ link: 'nope' })).toBeUndefined()
    expect(nextPageUrl(null)).toBeUndefined()
    expect(nextPageUrl(undefined)).toBeUndefined()
  })

  it('ignores a next link without a string url', () => {
    expect(nextPageUrl({ link: [{ relation: 'next' }] })).toBeUndefined()
    expect(nextPageUrl({ link: [{ relation: 'next', url: 123 }] })).toBeUndefined()
  })
})

describe('FhirClientService.requestAllPages', () => {
  afterEach(() => jest.restoreAllMocks())

  it('merges every page when the server reaches a terminal page', async () => {
    const request = jest.fn()
      .mockResolvedValueOnce({ entry: [{ resource: { id: '1' } }], link: [{ relation: 'next', url: 'page-2' }] })
      .mockResolvedValueOnce({ entry: [{ resource: { id: '2' } }] })
    const service = FhirClientService.getInstance()
    jest.spyOn(service, 'getClient').mockResolvedValue({ request } as any)

    const bundle = await service.requestAllPages<any>('Observation?patient=1', 2)
    expect(bundle.entry.map((entry: any) => entry.resource.id)).toEqual(['1', '2'])
  })

  it('throws instead of returning a partial bundle when the safety cap is reached', async () => {
    const request = jest.fn()
      .mockResolvedValueOnce({ entry: [{ resource: { id: '1' } }], link: [{ relation: 'next', url: 'page-2' }] })
      .mockResolvedValueOnce({ entry: [{ resource: { id: '2' } }], link: [{ relation: 'next', url: 'page-3' }] })
    const service = FhirClientService.getInstance()
    jest.spyOn(service, 'getClient').mockResolvedValue({ request } as any)

    await expect(service.requestAllPages('Observation?patient=1', 2)).rejects.toEqual(
      expect.objectContaining<Partial<FhirPaginationLimitError>>({
        name: 'FhirPaginationLimitError',
        maxPages: 2,
        loadedEntries: 2,
      }),
    )
  })
})
