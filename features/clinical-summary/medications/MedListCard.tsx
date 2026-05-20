// MedListCard
//   ┌─ Top tabs (like ReportsCard):  用藥 │ 過敏 │ 疫苗
//   │     ↓ 用藥 selected
//   │       Inner toggle: [清單 | 時間軸]
//   │     ↓ 過敏 selected
//   │       Active allergies list (was AllergiesCard)
//   │     ↓ 疫苗 selected
//   │       Vaccine list (point events, no timeline)
//
// AllergiesCard is no longer a separate card — registered as disabled in
// feature-registry. The three concerns are clinically related (drug + drug
// reaction + drug-derived prophylaxis) so consolidating them under one
// header keeps the left panel scannable.
"use client"

import { useState } from "react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useAudience } from "@/src/application/providers/audience.provider"
import { FeatureCard } from "@/src/shared/components"
import { TAB_ACTIVE_CLASSES } from "@/src/shared/config/ui-theme.config"
import { cn } from "@/src/shared/utils/cn.utils"
import { useMedications } from './hooks/useMedications'
import { useMedicationRows } from './hooks/useMedicationRows'
import { useVaccineRows } from './hooks/useVaccineRows'
import { useAllergies } from '../allergies/hooks/useAllergies'
import { useActiveAllergies } from '../allergies/hooks/useActiveAllergies'
import { useClinicalData } from '@/src/application/hooks/clinical-data/use-clinical-data-query.hook'
import { MedicationList } from './components/MedicationList'
import { VaccineList } from './components/VaccineList'
import { MedicationTimeline } from './timeline/MedicationTimeline'
import { AllergyList } from '../allergies/components/AllergyList'

type DataTab = 'medications' | 'allergies' | 'vaccines'
type MedView = 'list' | 'timeline'

export function MedListCard() {
  const { t, locale } = useLanguage()
  const { audience } = useAudience()
  const mt = (t.medications as any)

  const { medications, isLoading: medsLoading, error: medsError } = useMedications()
  const { allergies, isLoading: allergiesLoading, error: allergiesError } = useAllergies()
  // FHIR R4 Immunization resources — distinct from MedicationRequests that
  // happen to be vaccine products. Bridge ships these from 疾病管制署.
  const { immunizations } = useClinicalData()
  const rows = useMedicationRows(medications, audience, locale)
  const vaccines = useVaccineRows(immunizations, audience, locale)
  const activeAllergies = useActiveAllergies(allergies)

  const [tab, setTab] = useState<DataTab>('medications')
  const [view, setView] = useState<MedView>('list')

  const tabMedicationsLabel = mt.tabMedications ?? '用藥'
  const tabAllergiesLabel = mt.tabAllergies ?? t.allergies.title
  const tabVaccinesLabel = mt.tabVaccines ?? '疫苗'
  const listLabel = mt.viewList ?? '清單'
  const timelineLabel = mt.viewTimeline ?? '時間軸'

  // Card-level isEmpty: only suppress the whole card when ALL three concerns
  // are empty (otherwise we'd hide allergies just because there's no meds).
  const isEmpty = rows.length === 0 && vaccines.length === 0 && activeAllergies.length === 0

  // FeatureCard expects a single isLoading / error pair — combine the two
  // queries pessimistically: any loading → show loading; any error → show
  // first non-null error.
  const isLoading = medsLoading || allergiesLoading
  const error = medsError || allergiesError

  const tabConfigs: Array<{ value: DataTab; label: string; count: number }> = [
    { value: 'medications', label: tabMedicationsLabel, count: rows.length },
    { value: 'allergies',   label: tabAllergiesLabel,   count: activeAllergies.length },
    { value: 'vaccines',    label: tabVaccinesLabel,    count: vaccines.length },
  ]

  return (
    <FeatureCard
      // No title — the top tab bar (用藥 / 過敏 / 疫苗) already labels the
      // active concern; a separate redundant header would only burn space.
      title=""
      featureId="medications"
      isLoading={isLoading}
      error={error}
      isEmpty={isEmpty}
      emptyMessage={t.medications.noData}
    >
      <Tabs value={tab} onValueChange={(v) => setTab(v as DataTab)} className="w-full">
        {/* Top tab bar (matches ReportsCard styling) */}
        <TabsList className="!flex !justify-start shrink-0 mb-3 !flex-nowrap w-full min-w-0 overflow-x-auto h-9 bg-muted/40 p-1 border border-border/50 gap-1">
          {tabConfigs.map((c) => (
            <TabsTrigger
              key={c.value}
              value={c.value}
              className={cn(
                '!flex-1 !min-w-fit px-3 text-sm whitespace-nowrap inline-flex items-center gap-1',
                TAB_ACTIVE_CLASSES.clinical,
              )}
            >
              {c.label}
              <span className="rounded-full bg-muted/70 px-1 py-0 text-[10px] tabular-nums text-muted-foreground">
                {c.count}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="medications" className="mt-0 space-y-3">
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
        </TabsContent>

        <TabsContent value="allergies" className="mt-0">
          <AllergyList allergies={activeAllergies} isLoading={false} error={null} />
        </TabsContent>

        <TabsContent value="vaccines" className="mt-0">
          <VaccineList vaccines={vaccines} />
        </TabsContent>
      </Tabs>
    </FeatureCard>
  )
}
