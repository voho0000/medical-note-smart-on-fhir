"use client"

import type { ReactElement, ReactNode } from 'react'
import { TapTooltip } from '@/src/shared/components/TapTooltip'
import { clinicalTooltipSurfaceClass } from '@/features/clinical-summary/components/clinical-metadata-styles'
import { useLanguage } from '@/src/application/providers/language.provider'
import type { MedicationRow } from '../types'

interface MedicationTerminologyTooltipProps {
  medication: Pick<MedicationRow, 'drugTerminology'>
  enabled: boolean
  /** Facts about THIS prescription — dose, frequency, days supplied — shown
   *  under the drug-master rows. The card above describes the drug; this
   *  describes the fill, and 總覽 needs both in one place because its row has
   *  no space for either. Callers with nothing to add omit it and the card is
   *  exactly what it was. */
  extra?: ReactNode
  children: ReactElement
}

export function MedicationTerminologyTooltip({
  medication,
  enabled,
  extra,
  children,
}: MedicationTerminologyTooltipProps) {
  const { t, locale } = useLanguage()
  const mt = (t.medications as any)
  const terminology = medication.drugTerminology

  // `extra` alone is worth a card: a drug missing from the NHI master still
  // has a dose and a supply, and dropping the tooltip would make those rows
  // silently behave differently from their neighbours.
  if (!enabled || (!terminology && !extra)) return children

  const atcNames = [
    terminology?.atcNameEn,
    terminology?.atcNameZh,
  ].filter((value, index, values): value is string =>
    Boolean(value) && values.indexOf(value) === index,
  )
  const rows = !terminology ? [] : [
    [mt.terminologyIngredientLabel ?? 'Ingredient / strength', terminology.ingredientText],
    [mt.terminologyOfficialNameZhLabel ?? 'Chinese product name', terminology.officialNameZh],
    [mt.terminologyOfficialNameEnLabel ?? 'English product name', terminology.officialNameEn],
    [mt.terminologyDoseFormLabel ?? 'Dose form', terminology.doseForm],
    [
      mt.terminologyAtcLabel ?? 'ATC class',
      terminology.atcCode
        ? `${terminology.atcCode}${atcNames.length > 0 ? ` · ${atcNames.join('／')}` : ''}`
        : undefined,
    ],
    [
      mt.terminologyAtcLevel2Label ?? 'ATC therapeutic subgroup',
      terminology.atcLevel2Code
        ? `${terminology.atcLevel2Code} · ${
          locale === 'en'
            ? terminology.atcLevel2NameEn
              || terminology.atcLevel2NameZh
              || terminology.atcLevel2Code
            : terminology.atcLevel2NameZh
              || terminology.atcLevel2NameEn
              || terminology.atcLevel2Code
        }`
        : undefined,
    ],
  ].filter((row): row is [string, string] => Boolean(row[1]))

  // The compact row shows ONE drug name; ingredient, strength, dose form, the
  // other-language product name and the ATC class exist only here. asChild
  // keeps the caller's own span as the trigger (an extra wrapper would break
  // the row's three-lane grid) — that span already carries tabIndex, so the
  // record stays reachable by hover, keyboard AND tap.
  return (
    <TapTooltip
      asChild
      sideOffset={4}
      contentTestId="medication-terminology-tooltip"
      contentClassName={`${clinicalTooltipSurfaceClass} max-w-[min(92vw,30rem)] whitespace-normal text-xs leading-relaxed`}
      content={(
        <>
          <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-2 gap-y-0.5 text-left">
            {rows.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-secondary-foreground/65">{label}</dt>
                <dd className="min-w-0 break-words font-medium">{value}</dd>
              </div>
            ))}
          </dl>
          {extra && (
            <div className={rows.length > 0
              ? 'mt-1.5 border-t border-secondary-foreground/15 pt-1.5'
              : undefined}
            >
              {extra}
            </div>
          )}
          {terminology && (
            <div className="mt-1.5 border-t border-secondary-foreground/15 pt-1 text-[0.6875rem] text-secondary-foreground/70">
              {mt.terminologySource ?? 'NHI drug master'}
              {' · '}
              {mt.terminologySnapshotLabel ?? 'Version'}: {terminology.snapshotId}
            </div>
          )}
        </>
      )}
    >
      {children}
    </TapTooltip>
  )
}
