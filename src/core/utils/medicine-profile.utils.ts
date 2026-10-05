// What a medicine IS, as facts the model reads instead of recalling: its
// mechanism (FDA Established Pharmacologic Class, MED-RT, ChEMBL or SNOMED CT,
// keyed by WHO ATC) and whether it is anticholinergic (ACB scale / Beers, or an
// antimuscarinic mechanism). An ATC group is not a mechanism — G04BD holds both
// antimuscarinics and the β3 agonist mirabegron, which a run called
// "anticholinergic" (owner, 2026-10-05). A combination product is read
// ingredient by ingredient: one ATC combination code covers products with
// different ingredients (R05FA02 is dextromethorphan in some, codeine in
// others). Built by scripts/build-drug-mechanism-table.ts.

import {
  ACB_BY_ATC,
  ATC_BY_INGREDIENT,
  MECHANISM_BY_ATC,
} from '@/src/shared/constants/drug-mechanism.generated'
import { splitIngredients } from './ingredient-name.utils'

const ANTIMUSCARINIC_MECHANISM = /muscarinic[^;]*antagonist|anticholinergic/i

/** Stored with a source prefix ("e:", "m:", "c:", "s:", "g:"). */
const mechanismOf = (atc?: string): string | undefined => (atc ? MECHANISM_BY_ATC[atc]?.slice(2) : undefined)

export interface MedicineProfile {
  /** "beta3-Adrenergic Agonist"; for a combination, each ingredient the
   *  sources know ("losartan: Angiotensin 2 Receptor Blocker; hydrochlorothiazide:
   *  Thiazide Diuretic"). */
  mechanism?: string
  /** True when every ingredient has a mechanism. Only then does a missing
   *  `anticholinergic` mean "not anticholinergic" rather than "unknown". */
  complete: boolean
  /** "ACB 3", "ACB 1", or "antimuscarinic" when the mechanism is one the ACB
   *  scale does not score; for a combination, followed by the ingredient
   *  ("ACB 3 (chlorpheniramine)"). */
  anticholinergic?: string
}

interface Component { name: string; atc?: string; mechanism?: string; acb?: number }

// Eye, ear, skin, nose and mouth preparations and inhaled antimuscarinics act
// where they are applied; burden scales do not count them.
const LOCAL_USE = /^(S|D|R01|A01|R03BB)/

function anticholinergicOf(c: Component): string | undefined {
  if (c.acb) return `ACB ${c.acb}`
  // Only when antimuscarinic is the medicine's first listed mechanism:
  // mirtazapine lists it after its serotonin and α2 actions and is not a
  // burden drug.
  const primary = c.mechanism?.split(';')[0] ?? ''
  return ANTIMUSCARINIC_MECHANISM.test(primary) && !LOCAL_USE.test(c.atc ?? '') ? 'antimuscarinic' : undefined
}

const component = (name: string, atc?: string): Component =>
  ({ name, atc, mechanism: mechanismOf(atc), acb: atc ? ACB_BY_ATC[atc] : undefined })

export function medicineProfile(input: { atcCode?: string; ingredientText?: string }): MedicineProfile {
  const ingredients = input.ingredientText ? splitIngredients(input.ingredientText) : []
  if (ingredients.length > 1) {
    const components = ingredients.map((name) => component(name, ATC_BY_INGREDIENT[name]))
    const known = components.filter((c) => c.mechanism)
    const strongest = components
      .map((c) => ({ c, label: anticholinergicOf(c) }))
      .filter((x) => x.label)
      .sort((a, b) => (b.c.acb ?? 0) - (a.c.acb ?? 0))[0]
    return {
      ...(known.length ? { mechanism: known.slice(0, 3).map((c) => `${c.name}: ${c.mechanism}`).join('; ') } : {}),
      complete: known.length === components.length,
      ...(strongest ? { anticholinergic: `${strongest.label} (${strongest.c.name})` } : {}),
    }
  }
  const single = component('', input.atcCode)
  const anticholinergic = anticholinergicOf(single)
  return {
    ...(single.mechanism ? { mechanism: single.mechanism } : {}),
    complete: !!single.mechanism,
    ...(anticholinergic ? { anticholinergic } : {}),
  }
}

/** Whether a SOURCE LIST line says "anticholinergic": ACB 2–3 or an
 *  antimuscarinic mechanism. ACB 1 ("possible") stays off the line but still
 *  counts as anticholinergic when an alert says so. */
export const showsAnticholinergic = (label?: string): boolean => !!label && !/^ACB 1\b/.test(label)

/** The words a SOURCE LIST line prints: "anticholinergic ACB 3",
 *  "anticholinergic ACB 3 (chlorpheniramine)", or "anticholinergic" for an
 *  antimuscarinic the ACB scale does not score. */
export const anticholinergicLineLabel = (label: string): string =>
  `anticholinergic${label.replace(/^antimuscarinic/, '').replace(/^(?=ACB)/, ' ')}`
