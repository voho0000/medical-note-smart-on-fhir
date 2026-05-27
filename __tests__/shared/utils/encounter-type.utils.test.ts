// Unit tests for Encounter.type helpers, covering bridge v0.9.2 contract
// (two CodeableConcepts, each self-describing via coding.system) and the
// pre-v0.9.2 single-entry fallback. Cases A-D mirror the regression
// matrix in the bridge integration doc 2026-05-27.
import {
  ENCOUNTER_KIND_SYSTEM,
  ENCOUNTER_CHANNEL_SYSTEM,
  findEncounterTypeBySystem,
  getEncounterKindText,
  getEncounterChannelText,
} from '@/src/shared/utils/encounter-type.utils'

describe('encounter-type.utils', () => {
  describe('v0.9.2 bundles (two CodeableConcepts, kind + channel)', () => {
    // Case A — 門診 / IC卡 (e.g. "長庚嘉義" 截圖)
    const caseA = {
      type: [
        { text: '門診', coding: [{ system: ENCOUNTER_KIND_SYSTEM, code: 'outpatient', display: '門診' }] },
        { text: 'IC卡資料', coding: [{ system: ENCOUNTER_CHANNEL_SYSTEM, code: 'ic-card', display: 'IC卡資料' }] },
      ],
      class: { code: 'AMB' },
    }
    // Case B — 藥局 / IC卡 (e.g. "益安大藥局" 截圖)
    const caseB = {
      type: [
        { text: '藥局', coding: [{ system: ENCOUNTER_KIND_SYSTEM, code: 'pharmacy', display: '藥局' }] },
        { text: 'IC卡資料', coding: [{ system: ENCOUNTER_CHANNEL_SYSTEM, code: 'ic-card', display: 'IC卡資料' }] },
      ],
      class: { code: 'AMB' },
    }
    // Case C — 住院 / 申報資料
    const caseC = {
      type: [
        { text: '住院', coding: [{ system: ENCOUNTER_KIND_SYSTEM, code: 'inpatient', display: '住院' }] },
        { text: '申報資料', coding: [{ system: ENCOUNTER_CHANNEL_SYSTEM, code: 'claims', display: '申報資料' }] },
      ],
      class: { code: 'IMP' },
    }

    it.each([
      ['Case A (outpatient + ic-card)', caseA, '門診', 'IC卡資料'],
      ['Case B (pharmacy + ic-card)', caseB, '藥局', 'IC卡資料'],
      ['Case C (inpatient + claims)', caseC, '住院', '申報資料'],
    ])('%s: kind=%s, channel=%s', (_, enc, expectedKind, expectedChannel) => {
      expect(getEncounterKindText(enc)).toBe(expectedKind)
      expect(getEncounterChannelText(enc)).toBe(expectedChannel)
    })

    it('survives reversed array order (system lookup, not index)', () => {
      // FHIR R4 doesn't guarantee Encounter.type ordering — bridge could
      // emit channel-first in a future release without breaking us.
      const reversed = {
        type: [
          { text: 'IC卡資料', coding: [{ system: ENCOUNTER_CHANNEL_SYSTEM, code: 'ic-card' }] },
          { text: '門診', coding: [{ system: ENCOUNTER_KIND_SYSTEM, code: 'outpatient' }] },
        ],
      }
      expect(getEncounterKindText(reversed)).toBe('門診')
      expect(getEncounterChannelText(reversed)).toBe('IC卡資料')
    })

    it('falls back to coding.display when text is absent', () => {
      const noText = {
        type: [
          { coding: [{ system: ENCOUNTER_KIND_SYSTEM, code: 'outpatient', display: '門診' }] },
        ],
      }
      expect(getEncounterKindText(noText)).toBe('門診')
    })

    it('handles future unknown values that only carry system + display', () => {
      // Per bridge doc: when NHI adds new values (e.g. 「夜診」), bridge
      // emits coding without code but keeps system + display. SMART app
      // should still locate the dimension by system.
      const future = {
        type: [
          { text: '夜診', coding: [{ system: ENCOUNTER_KIND_SYSTEM, display: '夜診' }] },
        ],
      }
      expect(getEncounterKindText(future)).toBe('夜診')
    })
  })

  describe('v0.9.1 and earlier bundles (single text-only entry)', () => {
    it('returns undefined for kind/channel (no coding.system), letting caller fall back', () => {
      // Case D — pre-v0.9.2 bundle. The single entry carries either kind
      // OR channel text but never coding, so system lookup must miss.
      const legacy = { type: [{ text: 'IC卡資料' }], class: { code: 'AMB' } }
      expect(getEncounterKindText(legacy)).toBeUndefined()
      expect(getEncounterChannelText(legacy)).toBeUndefined()
    })
  })

  describe('findEncounterTypeBySystem', () => {
    it('returns the matching entry, not just its text', () => {
      const enc = {
        type: [
          { text: '門診', coding: [{ system: ENCOUNTER_KIND_SYSTEM, code: 'outpatient' }] },
        ],
      }
      const entry = findEncounterTypeBySystem(enc, ENCOUNTER_KIND_SYSTEM)
      expect(entry?.coding?.[0]?.code).toBe('outpatient')
    })

    it('returns undefined when no entry matches', () => {
      const enc = { type: [{ text: '門診' }] }
      expect(findEncounterTypeBySystem(enc, ENCOUNTER_KIND_SYSTEM)).toBeUndefined()
    })

    it('safely handles missing / malformed encounter', () => {
      expect(findEncounterTypeBySystem({}, ENCOUNTER_KIND_SYSTEM)).toBeUndefined()
      expect(findEncounterTypeBySystem({ type: null }, ENCOUNTER_KIND_SYSTEM)).toBeUndefined()
      expect(findEncounterTypeBySystem(undefined as any, ENCOUNTER_KIND_SYSTEM)).toBeUndefined()
    })
  })
})
