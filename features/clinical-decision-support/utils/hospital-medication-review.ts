import type { CdssLocale, CdssMedicationClassId, CdssRecommendation, CdssResult } from '../types'
import type { HospitalAwareCdssProfile } from './hospital-medication-profile'

// The released care pack assumes the national cloud's two-state prescription
// model. These EHR states must remain unknown in its output too. This adapter
// is applied at pack evaluation, before rendering, saving, or telemetry.
const HARMFUL_ROWS: Readonly<Record<string, CdssMedicationClassId>> = {
  'hf-harm:nsaid': 'nsaid-or-cox2-inhibitor',
  'hf-harm:non-dhp-ccb': 'non-dihydropyridine-calcium-channel-blocker',
  'hf-harm:thiazolidinedione': 'thiazolidinedione',
  'hf-harm:saxagliptin': 'saxagliptin',
  'hf-harm:antiarrhythmic': 'hf-avoided-antiarrhythmic',
}

export function applyHospitalMedicationReview(
  result: CdssResult, profile: HospitalAwareCdssProfile, locale: CdssLocale,
): CdssResult {
  const unresolved = profile.hospitalMedicationEvidence?.filter((entry) => !entry.ingredientName
    && (entry.useState === 'confirmed-current' || entry.useState === 'active-order-unconfirmed'
      || entry.useState === 'historical-record-current-status-unknown')) ?? []
  const pending = Object.entries(profile.medicationClassContexts ?? {}).filter(([, context]) =>
    context?.state === 'active-order-unconfirmed' || context?.state === 'historical-record-current-status-unknown'
      || (context?.state === 'uncertain' && unresolved.length > 0))
  if (!profile.hospitalMedicationEvidence?.length || !pending.length) return result
  const pendingClasses = new Set(pending.map(([classId]) => classId))
  const pendingKeys = new Set(pending.map(([, context]) => context!.factKey))
  const english = locale === 'en'
  const label = english ? 'Confirm current medication use' : '核對目前用藥'
  const message = english
    ? 'Hospital prescriptions are available, but current use is unconfirmed. Confirm actual use, dose, and stop/hold status before applying this medication decision.'
    : '資料有院內處方，但目前使用尚未確認。先核對實際用藥、劑量與停藥／暫停狀態，再套用本項用藥判讀。'

  const adapt = (item: CdssRecommendation): CdssRecommendation => {
    let changedTable = false
    const evidenceTables = item.evidenceTables?.map((table) => {
      const items = table.items.map((row) => {
        const classId = HARMFUL_ROWS[row.id]
        const matching = classId && pendingClasses.has(classId)
          ? profile.medicationClassContexts?.[classId]?.state === 'uncertain' ? unresolved
            : profile.hospitalMedicationEvidence!.filter((entry) => entry.classIds.includes(classId)
            && (entry.useState === 'active-order-unconfirmed' || entry.useState === 'historical-record-current-status-unknown'))
          : []
        const pendingSource = row.sources?.some((source) => profile.hospitalMedicationEvidence!.some((entry) =>
          entry.source.resourceId === source.resourceId && entry.source.resourceType === source.resourceType
          && (entry.useState === 'active-order-unconfirmed' || entry.useState === 'historical-record-current-status-unknown')))
        if (!matching.length && !pendingSource) return row
        changedTable = true
        const names = [...new Set(matching.map((entry) => entry.ingredientName).filter(Boolean))]
        return { ...row, direction: 'unknown' as const, defaultEnabled: false,
          value: matching.length && matching.every((entry) => !entry.ingredientName)
            ? english ? 'Unresolved hospital ingredients; reconcile medications first' : '院內成分未確認，需先核對用藥'
            : english ? `Current use needs confirmation${names.length ? `: ${names.join(', ')}` : ''}`
              : `目前使用待確認${names.length ? `：${names.join('、')}` : ''}`,
          sources: matching.length ? matching.flatMap((entry) => profile.facts[entry.factKey]?.sources ?? []) : row.sources,
        }
      })
      if (items.every((row, index) => row === table.items[index])) return table
      const enabled = items.filter((row) => profile.evidenceOverrides?.[row.id] ?? row.defaultEnabled)
      return { ...table, items,
        supportsCount: enabled.filter((row) => row.direction === 'supports').length,
        againstCount: enabled.filter((row) => row.direction === 'against').length,
        unknownCount: items.filter((row) => row.direction === 'unknown').length,
      }
    })
    const affected = changedTable || item.patientEvidence.some((entry) => entry.factKeys.some((key) => pendingKeys.has(key)))
    if (!affected) return item
    // An unconfirmed second drug must not downgrade an already established
    // safety finding (for example a confirmed NSAID plus an unconfirmed CCB).
    const knownSafetyFinding = item.domain === 'safety' && item.status === 'actionable'
      && evidenceTables?.some((table) => table.supportsCount > 0)
    if (knownSafetyFinding) return { ...item, evidenceTables,
      recommendation: `${item.recommendation} ${message}`,
      nextActions: [...item.nextActions, message],
      clinicalReviewItems: [...new Set([...(item.clinicalReviewItems ?? []), label])],
    }
    // Decision maps read visitDecision before the module status. Retire the
    // unconfirmed start/titrate step so they show the reconciliation decision.
    return { ...item, evidenceTables, status: 'needs-data', visitDecision: undefined,
      title: `${label}：${item.moduleName || item.title}`,
      recommendation: message,
      rationale: message,
      nextActions: [message],
      missingData: [...new Set([...(item.missingData ?? []), label])],
      clinicalReviewItems: [...new Set([...(item.clinicalReviewItems ?? []), label])],
    }
  }
  return { ...result,
    recommendations: result.recommendations.map(adapt),
    automatedChecks: result.automatedChecks?.map((check) => {
      if (!check.recommendation) return check
      const recommendation = adapt(check.recommendation)
      return recommendation === check.recommendation ? check
        : { ...check, label: recommendation.title, value: message, recommendation }
    }),
  }
}
