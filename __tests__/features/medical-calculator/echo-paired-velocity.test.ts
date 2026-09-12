import { buildEchoAutofill, parseCalculatorEcho } from '@/features/medical-calculator/echo-autofill'
import demoBundle from '../../../public/demo/demo-bundle.json'
import type { DiagnosticReportEntity } from '@/src/core/entities/clinical-data.entity'

describe('paired transmitral E/A velocities', () => {
  test.each(['MV E/A 54/89.1cm/s E/A Ratio 0.61', 'MV E / A: 54 / 89.1 cm/sec', 'MV E/A = 0.54/0.891 m/s'])('extracts E in cm/s from %s', text => {
    expect(parseCalculatorEcho(text)).toEqual({ e: 54 })
  })

  test.each(['MV E/A Ratio 0.61', 'MV E/A 0.61', 'MV E/A 54/89.1', 'MV E/A /89.1cm/s', 'MV E/A <54/89.1cm/s', 'MV E/A 50–54/89.1cm/s', 'MV E/A 54/80–89.1cm/s', 'MV E/A 54/89.1cm/s to 100', 'MV E/A 54/89.1mm/s', 'MV E/A 0/89.1cm/s', 'MV E/A 54/0cm/s', 'MV E/A 540/89.1cm/s'])('does not invent E from %s', text => {
    expect(parseCalculatorEcho(text).e).toBeUndefined()
  })

  test('preserves explicit E and calculates average E/e′ only with both tissue velocities', () => {
    expect(parseCalculatorEcho('MV E 60 cm/s; MV E/A 54/89.1cm/s').e).toBe(60)
    expect(parseCalculatorEcho("MV E/A 54/89.1cm/s; septal e' 6 cm/s; lateral e' 12 cm/s")).toMatchObject({ e: 54, averageEe: 6 })
  })

  test('autofills the actual demo report with source date without inventing blank measurements', () => {
    const reports = demoBundle.entry.map(entry => entry.resource).filter(resource => resource.resourceType === 'DiagnosticReport') as DiagnosticReportEntity[]
    const values = buildEchoAutofill(reports)
    expect(values.e).toMatchObject({ value: 54, unit: 'cm/s', date: '2024-09-09T00:00:00+08:00', resourceType: 'DiagnosticReport' })
    expect(values.e?.obsId).toMatch(/^demo-diagnosticreport-echo/)
    expect(values.wall?.value).toBe(11)
    expect(values.rwt?.value).toBeCloseTo(0.40465)
    for (const key of ['septalE', 'lateralE', 'averageEe', 'ee', 'pasp', 'trv'] as const) expect(values[key]).toBeUndefined()
  })
})
