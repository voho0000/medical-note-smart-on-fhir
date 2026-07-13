import {
  buildSmartAuthorizeConfig,
  buildSmartScopes,
} from '@/src/infrastructure/fhir/client/smart-launch-config'

describe('SMART launch configuration', () => {
  it('requests EHR launch context with SMART v2 read/search permissions', () => {
    expect(buildSmartScopes('ehr-launch-token')).toBe(
      'launch openid fhirUser patient/*.rs online_access',
    )
  })

  it('requests patient selection for a standalone launch', () => {
    expect(buildSmartScopes()).toBe(
      'launch/patient openid fhirUser patient/*.rs online_access',
    )
  })

  it('requires PKCE and omits an absent EHR launch token', () => {
    const config = buildSmartAuthorizeConfig({
      clientId: ' client-id ',
      redirectUri: 'https://viewer.example/smart/callback',
      iss: 'https://ehr.example/fhir',
    })

    expect(config).toMatchObject({
      clientId: 'client-id',
      scope: 'launch/patient openid fhirUser patient/*.rs online_access',
      pkceMode: 'required',
      completeInTarget: true,
    })
    expect(config).not.toHaveProperty('launch')
  })
})
