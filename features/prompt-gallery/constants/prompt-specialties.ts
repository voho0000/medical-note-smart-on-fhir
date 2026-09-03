import type { PromptSpecialty } from '../types/prompt.types'

/** MOHW internal-medicine training standard, 2024-12-12, §3.1.2 note 1.
 * Keep rheumatology/immunology and hematology/oncology separate.
 * See docs/prompt-gallery-specialties.md for sources and classification scope.
 */
export const INTERNAL_MEDICINE_SUBSPECIALTIES = [
  'cardiology',
  'gastroenterology',
  'pulmonology',
  'nephrology',
  'rheumatology',
  'immunology',
  'hematology',
  'medical_oncology',
  'endocrinology',
  'infectious_diseases',
] as const satisfies readonly PromptSpecialty[]

/** Shared by gallery filters and publishing so every selectable tag is discoverable.
 * These are navigation groups, not specialty certification hierarchies.
 */
export const PROMPT_SPECIALTY_GROUPS = [
  { id: 'general', specialties: ['general', 'family_medicine', 'occupational_medicine', 'other'] },
  { id: 'internal', specialties: ['internal', ...INTERNAL_MEDICINE_SUBSPECIALTIES] },
  { id: 'surgical', specialties: ['surgery', 'neurosurgery', 'orthopedics', 'urology', 'plastic_surgery', 'ent'] },
  {
    id: 'clinical',
    specialties: ['emergency', 'critical_care', 'pediatrics', 'obstetrics', 'neurology', 'psychiatry', 'rehabilitation', 'anesthesiology', 'ophthalmology', 'dermatology'],
  },
  { id: 'diagnostics', specialties: ['radiology', 'radiation_oncology', 'nuclear_medicine', 'pathology', 'anatomic_pathology', 'clinical_pathology'] },
] as const satisfies readonly { id: string; specialties: readonly PromptSpecialty[] }[]

/** Expand broad legacy tags at query time, without relabelling saved templates.
 * A specific subspecialty only matches its own tag; an old `internal` tag does
 * not establish that a template applies to any particular subspecialty.
 */
export function getPromptSpecialtyFilterValues(specialty: PromptSpecialty): PromptSpecialty[] {
  if (specialty === 'internal') return ['internal', ...INTERNAL_MEDICINE_SUBSPECIALTIES]
  if (specialty === 'pathology') return ['pathology', 'anatomic_pathology', 'clinical_pathology']
  return [specialty]
}
