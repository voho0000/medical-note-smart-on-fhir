import { resolveDeploymentProfile } from '@/src/shared/config/deployment-profile.config'

describe('deployment profile resolution', () => {
  it('keeps cloud as the backward-compatible default', () => {
    expect(resolveDeploymentProfile(undefined, false)).toBe('cloud')
  })

  it('uses an explicit onprem profile', () => {
    expect(resolveDeploymentProfile('onprem', false)).toBe('onprem')
  })

  it('fails closed when the legacy offline flag conflicts with cloud', () => {
    expect(resolveDeploymentProfile('cloud', true)).toBe('onprem')
  })

  it('rejects unknown profile names', () => {
    expect(() => resolveDeploymentProfile('staging', false)).toThrow(
      'Invalid NEXT_PUBLIC_DEPLOYMENT_PROFILE',
    )
  })
})
