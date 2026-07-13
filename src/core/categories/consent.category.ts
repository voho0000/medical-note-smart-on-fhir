// Advance Directives Category (FHIR Consent)
import type { DataCategory, ClinicalContextSection } from '../interfaces/data-category.interface'
import type { ConsentEntity } from '../entities/clinical-data.entity'
import { getCodeableConceptText } from '../utils/data-grouping.utils'

const directiveLabel = (c: ConsentEntity): string =>
  getCodeableConceptText(c.category?.[0]) !== 'Unknown'
    ? getCodeableConceptText(c.category?.[0])
    : getCodeableConceptText(c.scope, 'Advance directive')

export const advanceDirectivesCategory: DataCategory<ConsentEntity> = {
  id: 'advanceDirectives',
  label: 'Advance Directives',
  labelKey: 'dataSelection.advanceDirectives',
  description: 'DNR / palliative / organ-donation / AD wishes',
  descriptionKey: 'dataSelection.advanceDirectivesDesc',
  group: 'patient',
  order: 4,

  extractData: (clinicalData) => clinicalData?.consents || [],

  getCount: (data) => data.length,

  getContextSection: (data): ClinicalContextSection | null => {
    if (data.length === 0) return null
    // Preserve raw Consent semantics. `provision.type=deny` denies the provision's
    // coded action; it does NOT universally mean the patient "declined the
    // directive", so translating it to Declined/Agreed inverted some DNR data.
    const items = data.map((c) => {
      const label = directiveLabel(c)
      const date = c.dateTime ? new Date(c.dateTime).toLocaleDateString() : undefined
      const status = c.status || 'unknown'
      const invalid = status === 'entered-in-error' ? 'INVALIDATED—do not use clinically' : undefined
      const provision = c.provision?.type ? `provision=${c.provision.type} (applies to the coded action; not a generic yes/no)` : undefined
      const meta = [`status=${status}`, invalid, provision, date].filter(Boolean).join(', ')
      return meta ? `${label} (${meta})` : label
    })
    return { title: 'Advance Directives', items }
  },
}
