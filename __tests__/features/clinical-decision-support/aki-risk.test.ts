import { assessAkiFromCreatinine } from '@/features/clinical-decision-support/risk-stratification/aki'

function reading(observedAt: string, valueMgDl: number) {
  return {
    observedAt,
    valueMgDl,
    source: { id: `${observedAt}-${valueMgDl}` },
  }
}

describe('creatinine-only AKI risk stratification', () => {
  it('detects a stage 1 absolute rise within 48 hours', () => {
    const assessment = assessAkiFromCreatinine([
      reading('2026-07-29T08:00:00+08:00', 1),
      reading('2026-07-30T08:00:00+08:00', 1.31),
    ], new Date('2026-07-30T12:00:00+08:00'))

    expect(assessment).toMatchObject({
      state: 'detected',
      event: {
        stage: 1,
        trigger: 'absolute-rise-48h',
        recency: 'current-window',
        absoluteRise48hMgDl: 0.31,
      },
    })
  })

  it('uses the lowest prior value within 7 days for ratio staging', () => {
    const assessment = assessAkiFromCreatinine([
      reading('2026-07-24T08:00:00+08:00', 1),
      reading('2026-07-27T08:00:00+08:00', 1.4),
      reading('2026-07-30T08:00:00+08:00', 2.1),
    ], new Date('2026-07-30T12:00:00+08:00'))

    expect(assessment.event).toMatchObject({
      stage: 2,
      baseline: { valueMgDl: 1 },
      current: { valueMgDl: 2.1 },
      ratioRise7d: 2.1,
    })
  })

  it('stages a qualifying acute event at stage 3 when current creatinine is at least 4 mg/dL', () => {
    const assessment = assessAkiFromCreatinine([
      reading('2026-07-29T08:00:00+08:00', 3.7),
      reading('2026-07-30T08:00:00+08:00', 4.05),
    ], new Date('2026-07-30T12:00:00+08:00'))

    expect(assessment.event?.stage).toBe(3)
  })

  it('does not compare values outside the KDIGO 7-day window', () => {
    const assessment = assessAkiFromCreatinine([
      reading('2026-07-01T08:00:00+08:00', 1),
      reading('2026-07-30T08:00:00+08:00', 2.5),
    ], new Date('2026-07-30T12:00:00+08:00'))

    expect(assessment).toMatchObject({
      state: 'not-detected',
      readingCount: 2,
    })
  })

  it('does not invent an ordering for results with the same timestamp', () => {
    const assessment = assessAkiFromCreatinine([
      reading('2026-07-30', 1),
      reading('2026-07-30', 2),
    ], new Date('2026-07-30T12:00:00+08:00'))

    expect(assessment.state).toBe('not-detected')
  })

  it('marks an older qualifying event as historical', () => {
    const assessment = assessAkiFromCreatinine([
      reading('2026-06-01T08:00:00+08:00', 1),
      reading('2026-06-02T08:00:00+08:00', 1.6),
      reading('2026-06-05T08:00:00+08:00', 1.1),
    ], new Date('2026-07-30T12:00:00+08:00'))

    expect(assessment.event).toMatchObject({
      stage: 1,
      recency: 'historical',
      followUpReadings: [
        expect.objectContaining({ valueMgDl: 1.1 }),
      ],
    })
  })
})
