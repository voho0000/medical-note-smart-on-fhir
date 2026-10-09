// Systematic sweep: every 免疫 alias, decorated the ways hospitals print it and
// the app's normalizer already strips elsewhere (Serum / 血清 prefix, (STAT),
// a bilingual 「中文 ;(English)」 pair, Ab / 抗體 / anti-, full-width,
// spacing / hyphen variants), must land in the same category and column as
// the undecorated name. Every denied name must stay out of 免疫 under the
// same decorations.
import { categorizeObservation } from '@/src/shared/utils/lab-categories'
import { getLabPivotTestIdentity } from '@/src/shared/utils/lab-pivot.utils'
import {
  AMBIGUOUS_SHORT_IMMUNOLOGY_NAMES,
  IMMUNOLOGY_TEXT_TO_KEY,
} from '@/src/shared/utils/immunology-analytes'

const LAB = [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'laboratory' }] }]
const NHI = 'https://twcore.mohw.gov.tw/ig/twcore/CodeSystem/medical-service-payment-tw'

function obs(text: string, nhi?: string) {
  return {
    resourceType: 'Observation',
    status: 'final',
    category: LAB,
    code: { text, coding: nhi ? [{ system: NHI, code: nhi, display: '示例醫令' }] : [] },
    valueQuantity: { value: 12.3, unit: 'mg/dL' },
    effectiveDateTime: '2026-01-01T08:00:00+08:00',
  }
}

function placement(text: string, nhi?: string): string {
  const o = obs(text, nhi)
  const category = categorizeObservation(o)?.id ?? 'none'
  return category === 'immuno' ? `immuno/${getLabPivotTestIdentity(o, 'immuno').testKey}` : category
}

const fullWidth = (s: string) => s.replace(/[!-~]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0xFEE0))
const isLatin = (s: string) => /^[\x20-\x7E]+$/.test(s)

/** Decorations that do not change what the name says. */
function neutralDecorations(name: string): string[] {
  const out = [`Serum ${name}`, `血清${name}`, `${name} (STAT)`, `${name}(STAT)`, `免疫檢驗 ;(${name})`, `${name}.`]
  if (isLatin(name)) out.push(fullWidth(name), name.toLowerCase())
  if (/-/.test(name)) out.push(name.replace(/-/g, ' '), name.replace(/-/g, ''))
  // Dropping the hyphen of SS-A / SS-B gives the bare short name SSA / SSB,
  // which is deliberately context-dependent; that is not a decoration.
  return out.filter((d) => !AMBIGUOUS_SHORT_IMMUNOLOGY_NAMES.has(d))
}

/** Decorations that qualify a name as an antibody (Ab / 抗體 / anti-). */
function antibodyDecorations(name: string): string[] {
  if (!isLatin(name) || /\bAB\b|ANTIBOD|^ANTI/i.test(name)) return []
  return [`${name} Ab`, `${name} antibody`, `${name}抗體`, `anti-${name}`, `Anti ${name}`, `Serum anti-${name} Ab`]
}

const ALIASES = Object.keys(IMMUNOLOGY_TEXT_TO_KEY)
const ANTIBODY_KEYS = new Set(Object.values(IMMUNOLOGY_TEXT_TO_KEY).filter((k) => k.startsWith('ANTI-')))

describe('every 免疫 alias × neutral decorations lands where the plain name does', () => {
  const cases = ALIASES.flatMap((alias) => neutralDecorations(alias).map((d) => [alias, d] as const))
  it(`covers ${cases.length} decorated names`, () => {
    const failures: string[] = []
    for (const [alias, decorated] of cases) {
      for (const nhi of [undefined, '12064B']) {
        const want = placement(alias, nhi)
        const got = placement(decorated, nhi)
        if (got !== want) failures.push(`${JSON.stringify(decorated)} [${nhi ?? 'no code'}]: ${got} ≠ ${want}`)
      }
    }
    expect(failures).toEqual([])
  })

  it('places every unambiguous alias in 免疫 without any code', () => {
    const failures = ALIASES
      .filter((alias) => !AMBIGUOUS_SHORT_IMMUNOLOGY_NAMES.has(alias))
      .filter((alias) => placement(alias) !== `immuno/${IMMUNOLOGY_TEXT_TO_KEY[alias]}`)
      .map((alias) => `${alias}: ${placement(alias)}`)
    expect(failures).toEqual([])
  })
})

describe('a parenthetical alias counts only when it restates the name', () => {
  it.each([
    ['免疫球蛋白E (IgE)', 'immuno/IGE'],
    ['Immunoglobulin G (IgG)', 'immuno/IGG'],
    ['補體C3 (C3)', 'immuno/C3'],
    ['(IgM)', 'immuno/IGM'],
    ['Serum (IgA)', 'immuno/IGA'],
    ['IgG (Nephelometry)', 'immuno/IGG'],
  ])('%s → %s', (name, want) => {
    expect(placement(name)).toBe(want)
  })
})

describe('antibody aliases × Ab / 抗體 / anti- land in their 免疫 column', () => {
  const cases = ALIASES
    .filter((alias) => ANTIBODY_KEYS.has(IMMUNOLOGY_TEXT_TO_KEY[alias]))
    .flatMap((alias) => antibodyDecorations(alias).map((d) => [alias, d] as const))
  it(`covers ${cases.length} decorated names (qualified, so no context needed)`, () => {
    const failures = cases
      .filter(([alias, decorated]) => placement(decorated) !== `immuno/${IMMUNOLOGY_TEXT_TO_KEY[alias]}`)
      .map(([alias, decorated]) => `${decorated}: ${placement(decorated)} ≠ immuno/${IMMUNOLOGY_TEXT_TO_KEY[alias]}`)
    expect(failures).toEqual([])
  })
})

describe('denied names stay out of 免疫 under every decoration', () => {
  const DENIED: Array<[string, string?]> = [
    ['CMV IgG'], ['EBV IgM'], ['HSV IgG'], ['VZV IgG'], ['Rubella IgG'], ['Toxoplasma IgM'], ['Mycoplasma IgM'],
    ['HAV IgM'], ['HBc IgM'], ['CSF IgG'], ['Urine IgG'], ['IgG index'], ['IgG/Alb'], ['C3d'], ['C3NeF'], ['C4d'],
    ['IgG4-RD'], ['Kappa free light chain'], ['Lambda FLC'], ['Immunofixation IgG'], ['IgG electrophoresis'],
    ['Coombs IgG'], ['Pleural IgG'],
    // A trailing antibody class qualifies ANOTHER test; it is not the analyte.
    ['Anti-cardiolipin (IgG)'], ['Anti-cardiolipin (IgM)'], ['Dengue (IgM)'], ['Dengue (IgG)'],
    ['β2-GP1 (IgG)'], ['Beta-2 glycoprotein I (IgM)'], ['Mycoplasma (IgM)'], ['CMV (IgG)'], ['HBc (IgM)'],
    ['Anti-CCP (IgG)'], ['Chlamydia pneumoniae (IgG)'], ['Aspergillus (IgE)'], ['Gliadin (IgA)'],
    ['tTG (IgA)'], ['Measles (IgG)'], ['抗心脂抗體 (IgG)'], ['登革熱 (IgM)'],
    // Denied orders / sections with a plain immunology name.
    ['IgG', '12103B'], ['IgM', '12160B'], ['IgG', '14032C'], ['IgM', '14031C'], ['IgG', '11003C'], ['C3', '08011C'],
    ['IgG', '13001C'], ['IgA', '06013C'], ['IgG', '07001C'],
    // Bare ambiguous short names with no immunology context.
    ...[...AMBIGUOUS_SHORT_IMMUNOLOGY_NAMES].map((n) => [n] as [string]),
  ]
  const cases = DENIED.flatMap(([name, nhi]) => [name, ...neutralDecorations(name)].map((d) => [d, nhi] as const))
  it(`covers ${cases.length} decorated denied names`, () => {
    const failures = cases
      .filter(([decorated, nhi]) => placement(decorated, nhi).startsWith('immuno'))
      .map(([decorated, nhi]) => `${decorated} [${nhi ?? 'no code'}]: ${placement(decorated, nhi)}`)
    expect(failures).toEqual([])
  })
})
