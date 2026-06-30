import { useMemo } from "react"
import { extractEncounterIcds, type IcdCode } from "@/src/shared/utils/icd-lookup"
import { getEncounterChannelText, getEncounterKindText } from "@/src/shared/utils/encounter-type.utils"
import { useLanguage } from "@/src/application/providers/language.provider"

type VisitType = 'outpatient' | 'inpatient' | 'emergency' | 'home' | 'virtual' | 'pharmacy' | 'other'

export interface VisitRecord {
  id: string
  type: VisitType
  date: string
  location?: string
  institution?: string  // hospital / facility name used for filtering
  reason?: string
  /** All ICD diagnoses on the visit, in order: primary first, then secondaries. */
  icdCodes: IcdCode[]
  diagnosis?: string
  status: string
  department?: string
  physician?: string
}

export function useVisitHistory(encounters: any[], icdDict?: Map<string, string>) {
  const { locale } = useLanguage()
  return useMemo<VisitRecord[]>(() => {
    if (!Array.isArray(encounters)) return []
    
    return encounters
      .filter((encounter: any) => {
        const status = encounter.status
        // 'unknown' is included: NHI 健保存摺 IC-card inpatient stays have no
        // discharge date, so the bridge faithfully marks them status="unknown"
        // (an outpatient IC-card visit is "finished" the day it happens, but an
        // admission with no end can't be declared finished). They're still real
        // admissions — without this the visit history dropped them (4 住院 showed
        // as only 2). We still exclude voided/not-yet-happened records
        // (cancelled / entered-in-error / planned) by omission.
        return status === 'finished' || status === 'in-progress' ||
               status === 'arrived' || status === 'unknown'
      })
      .map((encounter: any) => {
        let type: VisitType = 'other'
        // Support both full-word and standard HL7 ActCode short codes (AMB, IMP, EMER…)
        const classCode = (encounter.class?.code || encounter.class?.display || '').toLowerCase()
        const reasonText = (encounter.reasonCode?.[0]?.text || '').toLowerCase()
        // NHI Taiwan may encode type in serviceType or type[].text instead of class.code
        const serviceTypeText = (
          encounter.serviceType?.coding?.[0]?.display ||
          encounter.serviceType?.text || ''
        ).toLowerCase()
        // Prefer the v0.9.2 kind-by-system lookup over array index — bridge
        // v0.9.1 and earlier always put kind in type[0], but FHIR R4 doesn't
        // guarantee that order, so we look it up by coding.system when
        // available and fall back to position only for legacy bundles.
        const typeText = (
          getEncounterKindText(encounter) ||
          encounter.type?.[0]?.coding?.[0]?.display ||
          encounter.type?.[0]?.text ||
          ''
        ).toLowerCase()

        if (['emer', 'emergency', 'ed'].includes(classCode) ||
            reasonText.includes('emergency') ||
            serviceTypeText.includes('急診') || typeText.includes('急診')) {
          type = 'emergency'
        }
        else if (['imp', 'inpatient', 'acute', 'ss', 'obsenc', 'prenc'].includes(classCode) ||
                 reasonText.includes('admission') || reasonText.includes('hospital') ||
                 serviceTypeText.includes('住院') || typeText.includes('住院')) {
          type = 'inpatient'
        }
        // Pharmacy refill — synthesised by synthesizePharmacyEncounters when
        // a MedicationRequest has no clinic encounter (e.g. NHI 慢箋 refills
        // dispensed at a pharmacy). Detected by the 藥局 marker in type.text;
        // must precede the generic 'AMB'→outpatient rule below since the
        // synthetic encounter uses class.code='AMB' for FHIR compliance.
        else if (typeText.includes('藥局') || serviceTypeText.includes('藥局') ||
                 classCode === 'pharm' || classCode === 'pharmacy') {
          type = 'pharmacy'
        }
        else if (['amb', 'ambulatory', 'outpatient', 'op'].includes(classCode) ||
            reasonText.includes('prenatal') || reasonText.includes('check up') || reasonText.includes('postnatal') ||
            serviceTypeText.includes('門診') || typeText.includes('門診')) {
          type = 'outpatient'
        }
        else if (['hh', 'home'].includes(classCode)) {
          type = 'home'
        }
        else if (['vr', 'virtual', 'tele'].includes(classCode)) {
          type = 'virtual'
        }
        
        const isUuid = (s: string) =>
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)
        const providerDisplay = encounter.serviceProvider?.display
        const locationDisplay = encounter.location?.[0]?.location?.display
        // Institution: prefer the service provider (hospital). Falls back to
        // location if the provider is missing or a raw UUID.
        const institution = (providerDisplay && !isUuid(providerDisplay))
          ? providerDisplay
          : (locationDisplay && !isUuid(locationDisplay) ? locationDisplay : '')
        const location = locationDisplay ||
                     (providerDisplay && !isUuid(providerDisplay) ? providerDisplay : '')
        
        // Extract every ICD diagnosis on the visit (primary + secondaries).
        // Falls back to reasonReference / type[].text only when no ICD codes
        // are present.
        const icdCodes = extractEncounterIcds(encounter, icdDict, locale)
        const reason = icdCodes.length > 0
          ? icdCodes.map((c) => c.description ? `${c.code} - ${c.description}` : c.code).join(', ')
          : (encounter.reasonReference?.[0]?.display || encounter.type?.[0]?.text)

        const diagnosis = encounter.diagnosis?.find((d: any) => d.rank === 1)?.condition?.display ||
                         encounter.diagnosis?.[0]?.condition?.display

        // Bridge v0.9.2 splits Encounter.type into two self-describing
        // CodeableConcepts (kind + channel) — see bridge integration
        // doc 2026-05-27. We look up the channel by coding.system rather
        // than relying on array order, since FHIR doesn't guarantee one.
        // When the channel entry is missing (pre-v0.9.2 bundles), fall
        // back to the legacy single-entry text and strip out kind words
        // so the subtitle adds info instead of duplicating the type tag.
        const v092Channel = getEncounterChannelText(encounter)
        let department = v092Channel ||
                        encounter.type?.[0]?.coding?.[0]?.display ||
                        encounter.type?.[0]?.text ||
                        encounter.serviceType?.coding?.[0]?.display ||
                        ''
        if (!v092Channel) {
          // Only strip kind words when we're in the legacy fallback path —
          // v0.9.2 channel text ("IC卡資料"/"申報資料") never contains kind
          // words, so stripping would be a no-op there.
          department = department.replace(/門診|住院|急診|藥局/g, '').trim()
        }

        const participant = encounter.participant?.find((p: any) =>
          p?.individual?.display || p?.actor?.display
        )
        const physician = participant?.individual?.display || participant?.actor?.display || ''

        return {
          id: encounter.id,
          type,
          date: encounter.period?.start || '',
          location,
          institution: institution || undefined,
          reason,
          icdCodes,
          diagnosis,
          status: encounter.status,
          department: department || undefined,
          physician: physician || undefined
        }
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [encounters, icdDict, locale])
}
