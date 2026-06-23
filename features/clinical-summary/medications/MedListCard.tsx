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

import { useEffect, useMemo, useState } from "react"
import { Info, PanelRight, Search, X } from "lucide-react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useRightDetail } from "@/src/application/providers/right-detail.provider"
import { useAudience } from "@/src/application/providers/audience.provider"
import { FeatureCard } from "@/src/shared/components"
import { TAB_ACTIVE_CLASSES } from "@/src/shared/config/ui-theme.config"
import { cn } from "@/src/shared/utils/cn.utils"
import { useMedications } from './hooks/useMedications'
import { useMedicationRows } from './hooks/useMedicationRows'
import { useMedicationSourceMix } from './hooks/useMedicationSourceMix'
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

// Right-pane detail source id for the medication timeline (one per app).
const MED_TIMELINE_ID = 'med-timeline'

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
  const sourceMix = useMedicationSourceMix(rows)
  const vaccines = useVaccineRows(immunizations, audience, locale)
  const activeAllergies = useActiveAllergies(allergies)

  const [tab, setTab] = useState<DataTab>('medications')
  const [view, setView] = useState<MedView>('list')
  const [searchQuery, setSearchQuery] = useState('')

  // 用藥 search — matches the bilingual searchHaystack on each row (drug name
  // 中/英, NHI code, drug class, indication ICD, 機構, date incl. 民國). Both
  // the list and the timeline view are filtered from the same query.
  const q = searchQuery.trim().toLowerCase()
  const filteredRows = useMemo(
    () => (q ? rows.filter((r) => r.searchHaystack.includes(q)) : rows),
    [rows, q],
  )
  const filteredMedications = useMemo(() => {
    if (!q) return medications
    const ids = new Set(filteredRows.map((r) => r.id))
    return medications.filter((m: any) => ids.has(m?.id))
  }, [medications, filteredRows, q])

  const tabMedicationsLabel = mt.tabMedications ?? '用藥'
  const tabAllergiesLabel = mt.tabAllergies ?? t.allergies.title
  const tabVaccinesLabel = mt.tabVaccines ?? '疫苗'
  const listLabel = mt.viewList ?? '清單'
  const timelineLabel = mt.viewTimeline ?? '時間軸'

  // 向右展開：push the timeline into the right pane so the list (left) and the
  // timeline (right) show side-by-side. Kept in sync with the search filter.
  const { detail: rightDetail, toggleDetail, showDetail } = useRightDetail()
  const isTimelineRight = rightDetail?.sourceId === MED_TIMELINE_ID
  const timelineTitle = `${tabMedicationsLabel} · ${timelineLabel}`
  const openTimelineRight = () =>
    toggleDetail({
      sourceId: MED_TIMELINE_ID,
      title: timelineTitle,
      node: <MedicationTimeline medications={filteredMedications} />,
    })
  useEffect(() => {
    if (rightDetail?.sourceId === MED_TIMELINE_ID) {
      showDetail({
        sourceId: MED_TIMELINE_ID,
        title: timelineTitle,
        node: <MedicationTimeline medications={filteredMedications} />,
      })
    }
    // re-sync only when the filtered set changes (not on every rightDetail tick)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredMedications])
  // IPS-source hint copy. Bridge data (the dominant source) never triggers
  // this UI — the strings only render when an IPS bundle is loaded.
  const sourceHintStatement: string = mt.sourceHintStatement
    ?? '此清單來自匯入文件，標示為病人目前服用中的藥物'
  const sourceChipStatement: string = mt.sourceChipStatement ?? '目前服用'

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
        <TabsList className="!flex !justify-start shrink-0 mb-2 !flex-nowrap w-full min-w-0 overflow-x-auto h-9 bg-muted/40 p-1 border border-border/50 gap-1">
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
              <span className="rounded-full bg-muted/70 px-1 py-0 text-[0.625rem] tabular-nums text-muted-foreground">
                {c.count}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="medications" className="mt-0 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
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
              {/* 向右展開：時間軸移到右側面板，與左側清單並排（桌機限定） */}
              {rows.length > 0 && (
                <button
                  type="button"
                  onClick={openTimelineRight}
                  title={mt.openTimelineRight ?? '時間軸移到右側面板並排顯示'}
                  aria-label={mt.openTimelineRight ?? '時間軸移到右側面板'}
                  className={cn(
                    'hidden md:inline-flex items-center rounded-md border px-2 py-1 text-xs transition-colors',
                    isTimelineRight
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  <PanelRight className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {/* Bilingual search — matches drug name (中/英), NHI code, class,
                indication, 機構 and date (西元/民國); filters both views. */}
            <div className="relative flex-1 min-w-[160px]">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <input
                type="search"
                inputMode="search"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                data-1p-ignore="true"
                data-lpignore="true"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={mt.searchPlaceholder ?? '搜尋藥名、分類、適應症、機構、日期…'}
                className="w-full rounded-md border bg-background pl-7 pr-7 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-ring/40 [&::-webkit-search-cancel-button]:appearance-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label={mt.clearSearch ?? '清除'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
          {/* Card-level source hint: surfaces only when every row originated
              from a MedicationStatement (typical IPS dataset). Mixed lists
              fall through to the per-row chip rendered inside MedicationItem. */}
          {sourceMix === 'statement-only' && (
            <div className="flex items-start gap-1.5 rounded-md border border-border/60 bg-muted/30 px-2.5 py-1.5 text-[0.6875rem] text-muted-foreground">
              <Info className="h-3.5 w-3.5 shrink-0 mt-[1px]" aria-hidden />
              <span>{sourceHintStatement}</span>
            </div>
          )}
          {q && filteredRows.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              {mt.searchNoMatch ?? '無符合的藥物'}
            </div>
          ) : view === 'list' ? (
            <MedicationList
              medications={filteredRows}
              isLoading={false}
              error={null}
              showSourceChip={sourceMix === 'mixed'}
              sourceChipStatementLabel={sourceChipStatement}
              sourceChipStatementTooltip={sourceHintStatement}
            />
          ) : (
            <MedicationTimeline medications={filteredMedications} />
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
