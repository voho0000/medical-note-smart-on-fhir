import demoBundle from '@/public/demo/demo-bundle.json'
import { loadDemoExampleContext } from '@/src/application/services/demo-example-context.service'

it('builds a non-empty AI context from the bundled trial patient', async () => {
  const fetchMock = jest.fn(async () => ({
    ok: true,
    json: async () => demoBundle,
  }))
  global.fetch = fetchMock as unknown as typeof fetch

  const result = await loadDemoExampleContext()

  expect(fetchMock).toHaveBeenCalledWith('/demo/demo-bundle.json', expect.objectContaining({
    signal: expect.any(AbortSignal),
  }))
  expect(result.clinicalContext.length).toBeGreaterThan(1_000)
  expect(result.clinicalContext).toContain("Patient's Medications")
  expect(result.clinicalContext).toContain('Diagnostic Reports')
  expect(result.piiLiterals.length).toBeGreaterThan(0)
})
