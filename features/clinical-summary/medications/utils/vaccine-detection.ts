// Vaccine detection for MedicationRequest resources.
//
// NHI 健保存摺 bills vaccines as drugs, so the bridge ships them as
// MedicationRequest (not FHIR R4 Immunization). This is the bridge's
// "faithful transport" choice — see the bridge audit doc — so the SMART
// app routes vaccines into a dedicated view at consumption time instead.
//
// Detection signals (any match):
//   - category contains a vaccine class keyword
//   - drug name (text or coding[].display) contains a vaccine keyword
// Both Chinese (健保署 藥理分類) and English LOINC-style labels are checked.

const CATEGORY_KEYWORDS = [
  // Chinese 藥理分類
  '類毒素',     // TOXOIDS (e.g. tetanus, diphtheria)
  '疫苗',       // generic 疫苗類
  '預防接種',
  '免疫',       // 免疫球蛋白 — borderline; clinically grouped with vaccines for inventory
  // English
  'toxoid',
  'vaccine',
  'immuniz',
]

const NAME_KEYWORDS = [
  '疫苗',
  'vaccine',
  'vaccin',
  // Common product-name suffixes
  'toxoid',
  // COVID-era names: many ship without the literal word "vaccine"
  'comirnaty', 'spikevax', 'astrazeneca', 'novavax', 'medigen',
]

function lower(s?: string): string {
  return typeof s === 'string' ? s.toLowerCase() : ''
}

/**
 * Returns true if the MedicationRequest looks like a vaccine. Conservative
 * fallback when neither category nor name carries a marker — treats as
 * "not vaccine" so unknown drugs stay in the medication list rather than
 * surprise-jumping into the vaccine tab.
 */
export function isVaccine(med: any): boolean {
  if (!med) return false

  const categoryText = lower(med.category?.[0]?.text)
  const categoryDisplay = lower(med.category?.[0]?.coding?.[0]?.display)
  const categoryHaystack = `${categoryText} ${categoryDisplay}`
  if (CATEGORY_KEYWORDS.some(kw => categoryHaystack.includes(kw))) return true

  const nameText = lower(med.medicationCodeableConcept?.text)
  const nameDisplay = lower(med.medicationCodeableConcept?.coding?.[0]?.display)
  const refDisplay = lower(med.medicationReference?.display)
  const nameHaystack = `${nameText} ${nameDisplay} ${refDisplay}`
  if (NAME_KEYWORDS.some(kw => nameHaystack.includes(kw))) return true

  return false
}
