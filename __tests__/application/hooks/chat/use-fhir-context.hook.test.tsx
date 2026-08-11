import {
  isLocalBundleFhirUrl,
  localBundleFhirUrl,
} from '@/src/application/hooks/chat/use-fhir-context.hook'

describe('useFhirContext', () => {
  it('gives every local import its own non-PHI chat-history partition', () => {
    expect(localBundleFhirUrl('import-a')).toBe('local-bundle:import-a')
    expect(localBundleFhirUrl('import-b')).toBe('local-bundle:import-b')
    expect(localBundleFhirUrl('import-a')).not.toBe(localBundleFhirUrl('import-b'))
    expect(isLocalBundleFhirUrl(localBundleFhirUrl('import-a'))).toBe(true)
    expect(isLocalBundleFhirUrl('https://fhir.example')).toBe(false)
  })
})
