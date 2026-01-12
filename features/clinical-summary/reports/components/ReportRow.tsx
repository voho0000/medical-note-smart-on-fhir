// Report Row Component
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import type { Row } from '../types'
import { getConceptText } from '../utils/fhir-helpers'
import { ObservationBlock } from './ObservationBlock'
import { useLanguage } from "@/src/application/providers/language.provider"

interface ReportRowProps {
  row: Row
  defaultOpen: string[]
}

export function ReportRow({ row, defaultOpen }: ReportRowProps) {
  const { t } = useLanguage()
  const isSingleSimpleObs = row.obs.length === 1 && 
    (!row.obs[0].component || row.obs[0].component.length === 0)

  if (isSingleSimpleObs) {
    return (
      <div className="border rounded-lg bg-muted/40 p-3">
        <div className="flex w-full flex-col gap-1 mb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold text-foreground">{row.title}</span>
            <Badge variant="outline" className="text-xs font-normal">{row.meta}</Badge>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            {row.obs[0]?.status && (
              <span className="inline-flex items-center gap-1">
                <span className="font-medium text-foreground/80">{t.reports.status}:</span> {row.obs[0]?.status}
              </span>
            )}
            {row.obs[0]?.category && (
              <span className="inline-flex items-center gap-1">
                <span className="font-medium text-foreground/80">{t.reports.category}:</span> {getConceptText(row.obs[0]?.category)}
              </span>
            )}
          </div>
        </div>
        <ObservationBlock observation={row.obs[0]} />
      </div>
    )
  }

  return (
    <Accordion type="multiple" defaultValue={defaultOpen.includes(row.id) ? [row.id] : []} className="w-full">
      <AccordionItem value={row.id} className="border rounded-lg bg-muted/40 px-3">
        <AccordionTrigger className="py-3">
          <div className="flex w-full flex-col gap-1 text-left">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-foreground">{row.title}</span>
              <Badge variant="outline" className="text-xs font-normal">{row.meta}</Badge>
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              {row.obs[0]?.status && (
                <span className="inline-flex items-center gap-1">
                  <span className="font-medium text-foreground/80">{t.reports.status}:</span> {row.obs[0]?.status}
                </span>
              )}
              {row.obs[0]?.category && (
                <span className="inline-flex items-center gap-1">
                  <span className="font-medium text-foreground/80">{t.reports.category}:</span> {getConceptText(row.obs[0]?.category)}
                </span>
              )}
            </div>
          </div>
        </AccordionTrigger>
        <AccordionContent className="pb-4">
          <div className="grid gap-3">
            {row.obs.map((obs, i) => (
              <ObservationBlock
                key={obs.id ? `obs-${obs.id}` : `obs-${i}`}
                observation={obs}
              />
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}
