import { render, screen } from '@testing-library/react'
import { isMedcloudLaunchRoute } from '@/src/application/launch/medcloud-launch-route'
import { VGTPE_MEDCLOUD_LAUNCH_URL } from '@/src/application/launch/medcloud-launch-context'
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
  it('matches only the exact allow-listed launch URL', () => {
    expect(isMedcloudLaunchRoute(VGTPE_MEDCLOUD_LAUNCH_URL)).toBe(true)
    // Param order, extra params, and other hosts are deliberately NOT the
    // unattended route — they keep the normal, question-asking flow.
    expect(isMedcloudLaunchRoute('https://mediprisma.tw/app/?site=vghtpe&medcloud2=auto')).toBe(false)
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
