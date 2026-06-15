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
    // A deny provision (DNR / refuse CPR) is the clinically load-bearing case.
    const items = data.map((c) => {
      const label = directiveLabel(c)
      const decision =
        c.provision?.type === 'deny' ? 'Declined' :
        c.provision?.type === 'permit' ? 'Agreed' : undefined
      const date = c.dateTime ? new Date(c.dateTime).toLocaleDateString() : undefined
      const meta = [decision, date].filter(Boolean).join(', ')
      return meta ? `${label} (${meta})` : label
    })
    return { title: 'Advance Directives', items }
  },
}
