import type { HospitalMedicationEvidence } from '../utils/hospital-medication-profile'
import { hospitalMedicationUseLabel } from '../utils/hospital-medication-profile'
import type { CdssLocale } from '../types'

export function HospitalMedicationReview({ evidence, locale }: {
  evidence?: readonly HospitalMedicationEvidence[]
  locale: CdssLocale
}) {
  const pending = evidence?.filter((item) => item.useState === 'active-order-unconfirmed'
    || item.useState === 'historical-record-current-status-unknown'
    || (item.useState === 'confirmed-current' && !item.ingredientName)) ?? []
  if (!pending.length) return null
  const english = locale === 'en'
  return (
    <section className="rounded-lg border border-border bg-background p-3" aria-labelledby="hospital-medication-review-title" data-testid="cdss-hospital-medication-review">
      <h3 id="hospital-medication-review-title" className="text-sm font-semibold text-foreground">
        {english ? `Confirm current use of ${pending.length} hospital prescription(s)` : `${pending.length} 筆院內處方，目前使用待確認`}
      </h3>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        {english ? 'Resolved ingredients are available to CDSS. A prescription alone does not confirm actual use; review the list before interpreting medication guidance.'
          : '已確認的成分已提供給 CDSS。開立紀錄無法確認實際服藥，請先核對用藥清單，再解讀相關用藥指引。'}
      </p>
      <details className="mt-2">
        <summary className="min-h-11 cursor-pointer content-center text-sm text-primary focus-visible:outline-2 focus-visible:outline-ring">
          {english ? 'Review ingredients and source prescriptions' : '查看成分與原始處方'}
        </summary>
        <ul className="divide-y divide-border text-xs">
          {pending.map((item) => (
            <li key={item.factKey} className="space-y-1 break-words py-2" data-testid="cdss-hospital-medication-evidence">
              <p className="font-medium text-foreground">{item.ingredientName || (english ? 'Ingredient unresolved' : '成分未確認')}</p>
              <p>{item.name.recordedProductName || item.name.recordedGenericName}</p>
              <p className="text-muted-foreground">{item.source.date} · {hospitalMedicationUseLabel(item.useState, english)}</p>
              <p className="text-muted-foreground">
                {item.fromOfficialTerminology ? (english ? 'Official NHI drug master' : '健保藥品主檔')
                  : !item.ingredientName ? (english ? 'No ingredient mapping applied' : '尚未套用成分對照')
                    : item.name.source === 'verified-product-alias' ? (english ? 'Verified product ingredient alias' : '已查證商品成分對照')
                      : (english ? 'Ingredient stated in the source name' : '來源藥名明列成分')}
                {item.name.referenceUrl && <a className="ml-2 text-primary underline underline-offset-2" href={item.name.referenceUrl} target="_blank" rel="noopener noreferrer">{english ? 'Reference' : '對照來源'}</a>}
              </p>
            </li>
          ))}
        </ul>
      </details>
    </section>
  )
}
