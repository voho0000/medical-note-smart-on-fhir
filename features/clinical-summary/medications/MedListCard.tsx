// MedListCard — toggles between traditional list view and Gantt timeline.
"use client"

import { useState } from "react"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useAudience } from "@/src/application/providers/audience.provider"
import { FeatureCard } from "@/src/shared/components"
import { cn } from "@/src/shared/utils/cn.utils"
import { useMedications } from './hooks/useMedications'
import { useMedicationRows } from './hooks/useMedicationRows'
import { MedicationList } from './components/MedicationList'
import { MedicationTimeline } from './timeline/MedicationTimeline'

type View = 'list' | 'timeline'

export function MedListCard() {
  const { t, locale } = useLanguage()
  const { audience } = useAudience()
  const mt = (t.medications as any)
  const { medications, isLoading, error } = useMedications()
  const rows = useMedicationRows(medications, audience, locale)
  const [view, setView] = useState<View>('list')

  const listLabel = mt.viewList ?? '清單'
  const timelineLabel = mt.viewTimeline ?? '時間軸'

  return (
    <FeatureCard
      title={t.medications.title}
      featureId="medications"
      isLoading={isLoading}
      error={error}
      isEmpty={rows.length === 0}
      emptyMessage={t.medications.noData}
    >
      <div className="space-y-3">
        {/* ── View toggle ─────────────────────────────────────────────── */}
        <div className="inline-flex rounded-md border bg-muted/40 p-0.5 text-xs">
          {(['list', 'timeline'] as View[]).map((v) => (
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
      </div>
    </FeatureCard>
  )
}
