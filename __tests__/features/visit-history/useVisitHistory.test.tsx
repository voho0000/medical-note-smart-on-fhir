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

function render(encounters: any[], locale: 'en' | 'zh-TW' = 'zh-TW') {
  localStorage.setItem('medical-note-locale', locale)
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

    it('localizes the two fixed channel labels in the English UI', () => {
      const { result } = render([
        {
          id: 'enc-card',
          status: 'finished',
          class: { code: 'AMB' },
          type: [
            { text: '門診', coding: [{ system: ENCOUNTER_KIND_SYSTEM, code: 'outpatient' }] },
            { text: 'IC卡資料', coding: [{ system: ENCOUNTER_CHANNEL_SYSTEM, code: 'ic-card' }] },
          ],
          period: { start: '2026-05-13T00:00:00+08:00' },
        },
        {
          id: 'enc-claims',
          status: 'finished',
          class: { code: 'EMER' },
          type: [
            { text: '急診', coding: [{ system: ENCOUNTER_KIND_SYSTEM, code: 'emergency' }] },
            { text: '申報資料', coding: [{ system: ENCOUNTER_CHANNEL_SYSTEM, code: 'claims' }] },
          ],
          period: { start: '2026-05-12T00:00:00+08:00' },
        },
      ], 'en')

      expect(result.current.map((visit) => visit.department))
        .toEqual(['NHI card data', 'Claims data'])
    })
  })

  describe('visit-type classification fallbacks', () => {
    it('keeps SDK 門急診 explicitly ambiguous instead of classifying it as emergency or outpatient', () => {
      const { result } = render([
        {
          id: 'sdk-r1',
          status: 'finished',
          class: { code: 'AMB' },
          type: [{
            text: '門急診',
            coding: [{
              system: ENCOUNTER_KIND_SYSTEM,
              code: 'outpatient-or-emergency',
              display: '門急診',
            }],
          }],
          period: { start: '2026-05-13T00:00:00+08:00' },
        },
      ])

      expect(result.current[0].type).toBe('outpatient-or-emergency')
    })

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

  describe('NHI care-discipline classification', () => {
    it.each([
      ['western', 'outpatient'],
      ['tcm', 'tcm-outpatient'],
      ['dental', 'dental-outpatient'],
    ])('classifies %s from the bridge v1.6 encounter-kind code', (
      expectedDiscipline,
      kindCode,
    ) => {
      const { result } = render([{
        id: `enc-${kindCode}`,
        status: 'finished',
        class: { code: 'AMB' },
        type: [
          {
            coding: [{
              system: ENCOUNTER_KIND_SYSTEM,
              code: kindCode,
            }],
          },
          {
            text: '申報資料',
            coding: [{
              system: ENCOUNTER_CHANNEL_SYSTEM,
              code: 'claims',
              display: '申報資料',
            }],
          },
        ],
        period: { start: '2026-06-23T00:00:00+08:00' },
      }])

      expect(result.current[0].careDiscipline).toBe(expectedDiscipline)
      expect(result.current[0].type).toBe('outpatient')
    })

    it('falls back to western for an ordinary AMB encounter with no discipline coding', () => {
      const { result } = render([{
        id: 'ordinary-amb',
        status: 'finished',
        class: { code: 'AMB' },
        period: { start: '2026-08-12' },
      }])

      expect(result.current[0].type).toBe('outpatient')
      expect(result.current[0].careDiscipline).toBe('western')
    })

    it('keeps read-only compatibility with the transitional custom TCM code', () => {
      const { result } = render([{
        id: 'legacy-custom-tcm',
        status: 'finished',
        class: { code: 'AMB' },
        type: [{ text: '門診' }],
        serviceType: {
          coding: [{
            system: 'https://nhi-fhir-bridge.github.io/CodeSystem/clinical-service-domain',
            code: 'traditional-chinese-medicine',
          }],
        },
        period: { start: '2026-08-12' },
      }])

      expect(result.current[0].type).toBe('outpatient')
      expect(result.current[0].careDiscipline).toBe('tcm')
    })

    it('classifies Medcloud General Dental serviceType as dental', () => {
      const { result } = render([{
        id: 'medcloud-dental',
        status: 'finished',
        class: { code: 'AMB' },
        type: [{
          text: '門診',
          coding: [{
            system: ENCOUNTER_KIND_SYSTEM,
            code: 'outpatient',
            display: '門診',
          }],
        }],
        serviceType: {
          coding: [{
            system: 'http://terminology.hl7.org/CodeSystem/service-type',
            code: '88',
            display: 'General Dental',
          }],
        },
        period: { start: '2024-09-26' },
      }])

      expect(result.current[0].type).toBe('outpatient')
      expect(result.current[0].careDiscipline).toBe('dental')
    })

    it.each([
      ['dental', 'http://terminology.hl7.org/CodeSystem/service-type', '87'],
      ['dental', 'http://terminology.hl7.org/CodeSystem/service-type', '88'],
      ['dental', 'http://terminology.hl7.org/CodeSystem/service-type', '94'],
      ['dental', 'http://snomed.info/sct', '722163006'],
      ['dental', 'https://twcore.mohw.gov.tw/ig/twcore/CodeSystem/medical-treatment-department-nhi-tw', '50'],
      ['tcm', 'http://terminology.hl7.org/CodeSystem/service-type', '13'],
      ['tcm', 'http://terminology.hl7.org/CodeSystem/service-type', '18'],
    ])('classifies standard %s coding from %s#%s', (
      expectedDiscipline,
      system,
      code,
    ) => {
      const { result } = render([{
        id: `standard-${code}`,
        status: 'finished',
        class: { code: 'AMB' },
        type: [{ text: '門診' }],
        // No display on purpose: this verifies code-system matching rather
        // than allowing the multilingual text fallback to satisfy the test.
        serviceType: { coding: [{ system, code }] },
        period: { start: '2026-08-12' },
      }])

      expect(result.current[0].careDiscipline).toBe(expectedDiscipline)
    })

    it.each([
      ['SNOMED first', [
        { system: 'http://snomed.info/sct', code: '722163006' },
        { system: 'HTTP://TERMINOLOGY.HL7.ORG/CodeSystem/Service-Type', code: '88' },
      ]],
      ['HL7 first', [
        { system: 'HTTP://TERMINOLOGY.HL7.ORG/CodeSystem/Service-Type', code: '88' },
        { system: 'http://snomed.info/sct', code: '722163006' },
      ]],
    ])('classifies multi-coding dental serviceType with %s', (_case, coding) => {
      const { result } = render([{
        id: `multi-dental-${_case}`,
        status: 'finished',
        class: { code: 'AMB' },
        serviceType: { coding },
        period: { start: '2026-08-12' },
      }])

      expect(result.current).toHaveLength(1)
      expect(result.current[0].careDiscipline).toBe('dental')
    })

    it('prioritizes explicit serviceType over a conflicting legacy type code', () => {
      const { result } = render([{
        id: 'service-type-wins',
        status: 'finished',
        class: { code: 'AMB' },
        type: [{
          coding: [{
            system: ENCOUNTER_KIND_SYSTEM,
            code: 'tcm-outpatient',
          }],
        }],
        serviceType: {
          coding: [{
            system: 'http://terminology.hl7.org/CodeSystem/service-type',
            code: '88',
          }],
        },
        period: { start: '2026-08-12' },
      }])

      expect(result.current[0].careDiscipline).toBe('dental')
    })

    it('classifies the official versioned TW Core TCM code without display or text', () => {
      const { result } = render([{
        id: 'tw-core-tcm',
        status: 'finished',
        class: { code: 'AMB' },
        type: [{ text: '門診' }],
        serviceType: {
          coding: [{
            system: 'https://twcore.mohw.gov.tw/ig/twcore/CodeSystem/medical-consultation-department-nhi-tw',
            version: '2024-05-27',
            code: '60',
          }],
        },
        period: { start: '2026-08-12' },
      }])

      expect(result.current[0].type).toBe('outpatient')
      expect(result.current[0].careDiscipline).toBe('tcm')
    })

    it.each([
      [
        'unknown code',
        'https://twcore.mohw.gov.tw/ig/twcore/CodeSystem/medical-consultation-department-nhi-tw',
        '99',
      ],
      [
        'wrong system',
        'https://example.org/CodeSystem/medical-consultation-department-nhi-tw',
        '60',
      ],
    ])('does not classify TCM from the %s', (_case, system, code) => {
      const { result } = render([{
        id: `not-tcm-${_case}`,
        status: 'finished',
        class: { code: 'AMB' },
        type: [{ text: '門診' }],
        serviceType: { coding: [{ system, code }] },
        period: { start: '2026-08-12' },
      }])

      expect(result.current[0].careDiscipline).toBe('western')
    })

    it('accepts the FHIR R5 CodeableReference serviceType shape', () => {
      const { result } = render([{
        id: 'r5-dental',
        status: 'finished',
        class: { coding: [{ code: 'AMB' }] },
        type: [{ text: '門診' }],
        serviceType: [{
          concept: {
            coding: [{
              system: 'http://snomed.info/sct',
              code: '408461007',
            }],
          },
        }],
        period: { start: '2026-08-12' },
      }])

      expect(result.current[0].careDiscipline).toBe('dental')
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
