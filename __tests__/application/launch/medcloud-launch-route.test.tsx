import { render, screen } from '@testing-library/react'
import { isMedcloudLaunchRoute } from '@/src/application/launch/medcloud-launch-route'
import {
  MEDCLOUD_AUTO_LAUNCH_URL,
  VGTPE_MEDCLOUD_LAUNCH_URL,
  VGTPE_SITE_LAUNCH_URL,
} from '@/src/application/launch/medcloud-launch-context'
import { AudienceProvider, useAudience } from '@/src/application/providers/audience.provider'

// jsdom will not let window.location be redefined, so the route answer is
// mocked for the consumer test; the matcher itself is tested directly below.
let onLaunchRoute = false
jest.mock('@/src/application/launch/medcloud-launch-route', () => ({
  ...jest.requireActual('@/src/application/launch/medcloud-launch-route'),
  isMedcloudLaunchRoute: (href?: string) => (
    href === undefined
      ? onLaunchRoute
      : jest.requireActual('@/src/application/launch/medcloud-launch-route')
        .isMedcloudLaunchRoute(href)
  ),
}))

function AudienceProbe() {
  const { audience } = useAudience()
  return <span data-testid="audience">{audience}</span>
}

describe('isMedcloudLaunchRoute', () => {
  it('follows only the independent medcloud2=auto control', () => {
    expect(isMedcloudLaunchRoute(MEDCLOUD_AUTO_LAUNCH_URL)).toBe(true)
    expect(isMedcloudLaunchRoute(VGTPE_MEDCLOUD_LAUNCH_URL)).toBe(true)
    expect(isMedcloudLaunchRoute('https://mediprisma.tw/app/?site=vghtpe&medcloud2=auto')).toBe(true)
    expect(isMedcloudLaunchRoute(VGTPE_SITE_LAUNCH_URL)).toBe(false)
    expect(isMedcloudLaunchRoute('https://mediprisma.tw/app/')).toBe(false)
    expect(isMedcloudLaunchRoute('https://mediprisma.tw/app/?medcloud2=auto&site=vghtpe&x=1')).toBe(false)
    expect(isMedcloudLaunchRoute('https://example.com/app/?medcloud2=auto&site=vghtpe')).toBe(false)
    expect(isMedcloudLaunchRoute('')).toBe(false)
  })
})

describe('AudienceProvider on the Medcloud launch', () => {
  afterEach(() => {
    onLaunchRoute = false
    localStorage.clear()
  })

  it('opens in clinician mode even when 民眾 is the stored choice', () => {
    localStorage.setItem('medical-note-audience', 'patient')
    onLaunchRoute = true

    render(<AudienceProvider><AudienceProbe /></AudienceProvider>)

    expect(screen.getByTestId('audience')).toHaveTextContent('medical')
    // The stored preference survives for every other entry point.
    expect(localStorage.getItem('medical-note-audience')).toBe('patient')
  })

  it('still restores the stored choice off the launch route', () => {
    localStorage.setItem('medical-note-audience', 'patient')

    render(<AudienceProvider><AudienceProbe /></AudienceProvider>)

    expect(screen.getByTestId('audience')).toHaveTextContent('patient')
  })
})
