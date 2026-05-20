// MedListCard
//   ┌─ Outer tabs:  [用藥 | 疫苗]
//   │     ↓ 用藥 selected
//   │       Inner toggle: [清單 | 時間軸]
//   │     ↓ 疫苗 selected
//   │       Flat list (no timeline — vaccines are point events)
"use client"

import { useState } from "react"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useAudience } from "@/src/application/providers/audience.provider"
import { FeatureCard } from "@/src/shared/components"
import { cn } from "@/src/shared/utils/cn.utils"
import { useMedications } from './hooks/useMedications'
import { useMedicationRows } from './hooks/useMedicationRows'
import { useVaccineRows } from './hooks/useVaccineRows'
import { MedicationList } from './components/MedicationList'
import { VaccineList } from './components/VaccineList'
import { MedicationTimeline } from './timeline/MedicationTimeline'

type DataTab = 'medications' | 'vaccines'
type MedView = 'list' | 'timeline'

export function MedListCard() {
  const { t, locale } = useLanguage()
  const { audience } = useAudience()
  const mt = (t.medications as any)

  const { medications, isLoading, error } = useMedications()
  const rows = useMedicationRows(medications, audience, locale)
  const vaccines = useVaccineRows(medications, audience, locale)

  const [tab, setTab] = useState<DataTab>('medications')
  const [view, setView] = useState<MedView>('list')

  const tabMedicationsLabel = mt.tabMedications ?? '用藥'
  const tabVaccinesLabel = mt.tabVaccines ?? '疫苗'
  const listLabel = mt.viewList ?? '清單'
  const timelineLabel = mt.viewTimeline ?? '時間軸'

  // Card-level isEmpty: only suppress the whole card when there is neither
  // medications nor vaccines (otherwise we'd hide vaccines just because the
  // patient currently has no medications, or vice versa).
  const isEmpty = rows.length === 0 && vaccines.length === 0

  return (
    <FeatureCard
      title={t.medications.title}
      featureId="medications"
      isLoading={isLoading}
      error={error}
      isEmpty={isEmpty}
      emptyMessage={t.medications.noData}
    >
      <div className="space-y-3">
        {/* ── Outer: 用藥 / 疫苗 ───────────────────────────────────── */}
        <div className="inline-flex rounded-md border bg-muted/40 p-0.5 text-xs">
          {(['medications', 'vaccines'] as DataTab[]).map((d) => {
            const count = d === 'medications' ? rows.length : vaccines.length
            const label = d === 'medications' ? tabMedicationsLabel : tabVaccinesLabel
            return (
              <button
                key={d}
                type="button"
                onClick={() => setTab(d)}
                className={cn(
                  'px-3 py-1 rounded-sm transition-colors inline-flex items-center gap-1',
                  tab === d
                    ? 'bg-background text-foreground shadow-sm font-medium'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {label}
                <span className={cn(
                  'rounded-full px-1 py-0 text-[10px] tabular-nums',
                  tab === d ? 'bg-muted text-foreground/70' : 'bg-muted/60 text-muted-foreground',
                )}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        {/* ── Inner view (only meaningful for 用藥) ─────────────────── */}
        {tab === 'medications' && (
          <>
            <div className="inline-flex rounded-md border bg-muted/40 p-0.5 text-xs">
              {(['list', 'timeline'] as MedView[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  className={cn(
                    'px-3 py-1 rounded-sm transition-colors',
                    view === v
                      ? 'bg-background text-foreground shadow-sm font-medium'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {v === 'list' ? listLabel : timelineLabel}
                </button>
              ))}
            </div>
            {view === 'list' ? (
              <MedicationList medications={rows} isLoading={false} error={null} />
            ) : (
              <MedicationTimeline medications={medications} />
            )}
          </>
        )}

        {tab === 'vaccines' && <VaccineList vaccines={vaccines} />}
      </div>
    </FeatureCard>
  )
}
