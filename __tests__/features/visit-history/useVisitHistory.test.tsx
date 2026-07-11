// Regression locks for useVisitHistory — each test pins one bridge-induced
// quirk that previously made it through to the visit card UI. Tests use
// renderHook because the hook depends on useLanguage; wrap it with the
// LanguageProvider so locale defaults work.
import { renderHook } from '@testing-library/react'
import { useVisitHistory } from '@/features/clinical-summary/visit-history/hooks/useVisitHistory'
import { LanguageProvider } from '@/src/application/providers/language.provider'
import {
  ENCOUNTER_KIND_SYSTEM,
  ENCOUNTER_CHANNEL_SYSTEM,
} from '@/src/shared/utils/encounter-type.utils'

function render(encounters: any[]) {
  return renderHook(() => useVisitHistory(encounters), {
    wrapper: ({ children }) => <LanguageProvider>{children}</LanguageProvider>,
  })
}

describe('useVisitHistory — bridge bug regression locks', () => {
  describe('pharmacy subtitle dedup (pre-v0.9.2 fallback)', () => {
    // Pre-v0.9.2 bridges packed "藥局" into type[0].text alone — same
    // single field that NHI uses for the data channel. Without the
    // strip-regex fix, the visit card showed "藥局" both as the type tag
    // AND the subtitle, with no added information.
    it('does not echo 藥局 in the subtitle when type[0] is just "藥局"', () => {
      const { result } = render([
        {
          id: 'enc-1',
          status: 'finished',
          class: { code: 'AMB' },
          type: [{ text: '藥局' }],
          period: { start: '2026-05-13T00:00:00+08:00' },
          serviceProvider: { display: '益安大藥局' },
        },
      ])
      expect(result.current[0].type).toBe('pharmacy')
      expect(result.current[0].department).toBeUndefined()
    })

    it('strips 門診/住院/急診 from subtitle too (same dedup principle)', () => {
      const { result } = render([
        {
          id: 'enc-2',
          status: 'finished',
          class: { code: 'IMP' },
          type: [{ text: '住院' }],
          period: { start: '2026-05-13T00:00:00+08:00' },
          serviceProvider: { display: '長庚嘉義' },
        },
      ])
      expect(result.current[0].type).toBe('inpatient')
      expect(result.current[0].department).toBeUndefined()
    })
  })

  describe('v0.9.2 two-dimension Encounter.type', () => {
    // Once bridge moved to v0.9.2's split kind+channel design, the subtitle
    // SHOULD show the channel label ("IC卡資料" / "申報資料") — that's
    // genuinely additive info next to the type tag. This test pins down the
    // happy path so a regression in the lookup helpers shows up here too.
    it('uses channel text from type[coding.system=channel] as subtitle', () => {
      const { result } = render([
        {
          id: 'enc-3',
          status: 'finished',
          class: { code: 'AMB' },
          type: [
            { text: '藥局', coding: [{ system: ENCOUNTER_KIND_SYSTEM, code: 'pharmacy' }] },
            { text: 'IC卡資料', coding: [{ system: ENCOUNTER_CHANNEL_SYSTEM, code: 'ic-card' }] },
          ],
          period: { start: '2026-05-13T00:00:00+08:00' },
          serviceProvider: { display: '益安大藥局' },
        },
      ])
      expect(result.current[0].type).toBe('pharmacy')
      expect(result.current[0].department).toBe('IC卡資料')
    })

    it('survives reversed array order (relies on coding.system, not index)', () => {
      const { result } = render([
        {
          id: 'enc-4',
          status: 'finished',
          class: { code: 'AMB' },
          type: [
            // FHIR R4 doesn't pin the order — channel-first should work too
            { text: 'IC卡資料', coding: [{ system: ENCOUNTER_CHANNEL_SYSTEM, code: 'ic-card' }] },
            { text: '門診', coding: [{ system: ENCOUNTER_KIND_SYSTEM, code: 'outpatient' }] },
          ],
          period: { start: '2026-05-13T00:00:00+08:00' },
        },
      ])
      expect(result.current[0].type).toBe('outpatient')
      expect(result.current[0].department).toBe('IC卡資料')
    })
  })

  describe('visit-type classification fallbacks', () => {
    it('classifies by class.code when type[].text is missing', () => {
      const { result } = render([
        {
          id: 'enc-5',
          status: 'finished',
          class: { code: 'IMP' },
          period: { start: '2026-05-13T00:00:00+08:00' },
        },
      ])
      expect(result.current[0].type).toBe('inpatient')
    })

    it('classifies pharmacy from type[].text=藥局 even when class.code=AMB', () => {
      // Bridge synthesises pharmacy refill encounters with class.code='AMB'
      // (because there's no FHIR pharmacy class code) and tags them via
      // type[].text='藥局'. The classifier must catch this AHEAD of the
      // generic AMB→outpatient rule.
      const { result } = render([
        {
          id: 'enc-6',
          status: 'finished',
          class: { code: 'AMB' },
          type: [{ text: '藥局' }],
          period: { start: '2026-05-13T00:00:00+08:00' },
        },
      ])
      expect(result.current[0].type).toBe('pharmacy')
    })
  })

  describe('ICD display cleanup', () => {
    it('strips compact duplicate ICD code from reasonCode.text descriptions', () => {
      const { result } = render([
        {
          id: 'enc-icd',
          status: 'finished',
          class: { code: 'AMB' },
          type: [{ text: '門診' }],
          period: { start: '2026-05-13T00:00:00+08:00' },
          reasonCode: [
            {
              coding: [{ code: 'F33.42', display: 'Major depressive disorder, recurrent, in full remission' }],
              text: 'F3342 鬱症，復發，完全緩解',
            },
          ],
        },
      ])

      expect(result.current[0].icdCodes[0]).toEqual({
        code: 'F33.42',
        description: '鬱症，復發，完全緩解',
      })
      expect(result.current[0].reason).toBe('F33.42 - 鬱症，復發，完全緩解')
    })
  })

  describe('encounter status filter (IC-card inpatient = "unknown")', () => {
    // NHI 健保存摺 IC-card inpatient stays have no discharge date, so the bridge
    // marks them status="unknown". The visit history previously allow-listed only
    // finished/in-progress/arrived, silently dropping these real admissions
    // (bridge bug report 2026-06-29: 4 住院 showed as 2). They must now appear.
    it('keeps an "unknown"-status IC-card inpatient stay (no discharge date)', () => {
      const { result } = render([
        {
          id: 'enc-ic-imp',
          status: 'unknown',
          class: { code: 'IMP' },
          type: [{ text: '住院' }, { text: 'IC卡資料' }],
          period: { start: '2026-06-16T00:00:00+08:00', end: null },
          serviceProvider: { display: '林口長庚' },
        },
      ])
      expect(result.current).toHaveLength(1)
      expect(result.current[0].type).toBe('inpatient')
      expect(result.current[0].status).toBe('unknown')
    })

    it('still drops voided records (cancelled / entered-in-error)', () => {
      const { result } = render([
        { id: 'c1', status: 'cancelled', class: { code: 'AMB' }, type: [{ text: '門診' }], period: { start: '2026-06-01T00:00:00+08:00' } },
        { id: 'c2', status: 'entered-in-error', class: { code: 'IMP' }, type: [{ text: '住院' }], period: { start: '2026-06-02T00:00:00+08:00' } },
      ])
      expect(result.current).toHaveLength(0)
    })

    it('captures Encounter.period.end as endDate (inpatient discharge date)', () => {
      // After the bridge merges the IC-card admission + discharge records, the
      // inpatient encounter carries period.end. The card renders a 住院~出院 range
      // from it (VisitItem); here we lock that the hook surfaces endDate.
      const { result } = render([
        {
          id: 'enc-imp-discharge',
          status: 'finished',
          class: { code: 'IMP' },
          type: [{ text: '住院' }, { text: 'IC卡資料' }],
          period: { start: '2026-06-16T00:00:00+08:00', end: '2026-06-22T00:00:00+08:00' },
          serviceProvider: { display: '林口長庚' },
        },
      ])
      expect(result.current[0].type).toBe('inpatient')
      expect(result.current[0].date).toContain('2026-06-16')
      expect(result.current[0].endDate).toContain('2026-06-22')
    })
  })
})
