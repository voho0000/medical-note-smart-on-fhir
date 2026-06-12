// Filter component registry (audit C3).
//
// Core's DataCategory definitions reference custom filter UIs by
// `filterComponentKey`; this is the feature-layer side of that contract,
// mapping each key to its React component. Adding a new key: extend
// DataFilterKey in src/core/interfaces/data-category.interface.ts and
// register the component here.

import type { ComponentType } from 'react'
import type { CategoryFilterProps, DataFilterKey } from '@/src/core/interfaces/data-category.interface'
import {
  VitalSignsFilter,
  ConditionFilter,
  ImagingReportFilter,
  ImmunizationFilter,
  LabReportFilter,
  MedicationFilter,
  ProblemListFilter,
  ProcedureFilter,
} from './DataFilters'

const FILTER_COMPONENTS: Record<DataFilterKey, ComponentType<CategoryFilterProps>> = {
  vitalSigns: VitalSignsFilter,
  condition: ConditionFilter,
  imagingReport: ImagingReportFilter,
  immunization: ImmunizationFilter,
  labReport: LabReportFilter,
  medication: MedicationFilter,
  problemList: ProblemListFilter,
  procedure: ProcedureFilter,
}

export function getFilterComponent(
  key: DataFilterKey | undefined
): ComponentType<CategoryFilterProps> | undefined {
  return key ? FILTER_COMPONENTS[key] : undefined
}
