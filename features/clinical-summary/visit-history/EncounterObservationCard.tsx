"use client"

import { cn } from "@/src/shared/utils/cn.utils"
import { formatDateTime } from "./utils/formatters"

type EncounterObservationComponent = {
  id: string
  title: string
  value: string
  interpretationLabel?: string
  interpretationStyle?: string
  referenceText?: string
}

export type EncounterObservation = {
  id: string
  title: string
  value: string
  interpretationLabel?: string
  interpretationStyle?: string
  referenceText?: string
  effectiveDateTime?: string
  status?: string
  source: "diagnosticReport" | "observation"
  components: EncounterObservationComponent[]
}

export function EncounterObservationCard({ observation }: { observation: EncounterObservation }) {
  return (
    <div className="rounded-lg border bg-background p-3 shadow-sm">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold text-foreground">{observation.title}</div>
            <div className="text-xs text-muted-foreground">
              {observation.effectiveDateTime 
                ? formatDateTime(observation.effectiveDateTime) 
                : observation.source === "diagnosticReport" ? "Diagnostic report" : "Observation"}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold text-foreground">{observation.value}</span>
            {observation.interpretationLabel && observation.interpretationStyle && (
              <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", observation.interpretationStyle)}>
                {observation.interpretationLabel}
              </span>
            )}
          </div>
        </div>

        {observation.referenceText && <div className="text-xs text-muted-foreground">{observation.referenceText}</div>}

        {observation.components.length > 0 && (
          <div className="mt-2 divide-y rounded-md border bg-muted/40">
            {observation.components.map((component) => (
              <div key={component.id} className="grid gap-1 px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-foreground">{component.title}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">{component.value}</span>
                    {component.interpretationLabel && component.interpretationStyle && (
                      <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", component.interpretationStyle)}>
                        {component.interpretationLabel}
                      </span>
                    )}
                  </div>
                </div>
                {component.referenceText && <div className="text-xs text-muted-foreground">{component.referenceText}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
