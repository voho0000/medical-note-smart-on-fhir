// Improved Medication List Component with Collapsible Sections
"use client"

import { useState } from 'react'
import { ChevronDown, ChevronRight, History } from 'lucide-react'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import type { MedicationRow } from '../types'
import { MedicationItem } from './MedicationItem'
import { useGroupedMedications } from '../hooks/useGroupedMedications'

interface MedicationListProps {
  medications: MedicationRow[]
  isLoading: boolean
  error: Error | null
}

export function MedicationList({ medications, isLoading, error }: MedicationListProps) {
  const [showInactive, setShowInactive] = useState(false)
  const { activeMedications, inactiveMedicationGroups } = useGroupedMedications(medications)

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading medications…</div>
  }

  if (error) {
    return (
      <div className="text-sm text-red-600">
        {error instanceof Error ? error.message : String(error)}
      </div>
    )
  }

  if (medications.length === 0) {
    return <div className="text-sm text-muted-foreground">No medications found.</div>
  }

  const totalInactive = inactiveMedicationGroups.reduce((sum, group) => sum + group.count, 0)

  return (
    <div className="space-y-4">
      {/* Active Medications */}
      {activeMedications.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">
            Active Medications ({activeMedications.length})
          </h3>
          <div className="space-y-2">
            {activeMedications.map((medication) => (
              <MedicationItem key={medication.id} medication={medication} />
            ))}
          </div>
        </div>
      )}

      {/* Inactive Medications - Collapsible */}
      {totalInactive > 0 && (
        <div className="space-y-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowInactive(!showInactive)}
            className="w-full justify-between px-0 hover:bg-transparent"
          >
            <div className="flex items-center gap-2">
              {showInactive ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <History className="h-4 w-4" />
              <span className="text-sm font-semibold">
                Medication History ({totalInactive} stopped)
              </span>
            </div>
          </Button>

          {showInactive && (
            <div className="ml-6 space-y-3 border-l-2 border-muted pl-4">
              {inactiveMedicationGroups.map((group) => (
                <div key={group.name} className="space-y-2">
                  {group.count === 1 ? (
                    // Single medication - show directly
                    <MedicationItem medication={group.medications[0]} />
                  ) : (
                    // Multiple medications with same name - use accordion
                    <Accordion type="single" collapsible className="w-full">
                      <AccordionItem value={group.name} className="border rounded-lg">
                        <AccordionTrigger className="px-3 py-2 hover:no-underline">
                          <div className="flex items-center justify-between w-full pr-2">
                            <span className="font-medium text-sm">{group.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {group.count} prescriptions
                            </span>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="px-3 pb-3">
                          <div className="space-y-3 pt-2">
                            {group.medications.map((med, idx) => (
                              <div key={med.id} className="space-y-1">
                                <div className="flex items-center justify-between">
                                  <span className="text-sm font-medium text-foreground">#{idx + 1}</span>
                                  <span className="text-xs text-muted-foreground">
                                    {med.startedOn}
                                    {med.stoppedOn && ` → ${med.stoppedOn}`}
                                  </span>
                                </div>
                                <div className="ml-6 space-y-0.5 text-sm text-muted-foreground">
                                  {med.dose && <div>• Dose: {med.dose}</div>}
                                  {med.frequency && <div>• Frequency: {med.frequency}</div>}
                                  {med.route && <div>• Route: {med.route}</div>}
                                  {med.durationDays && <div>• Duration: {med.durationDays} days</div>}
                                  {!med.dose && !med.frequency && !med.route && !med.durationDays && (
                                    <div className="text-xs italic">No detailed information available</div>
                                  )}
                                </div>
                                {idx < group.medications.length - 1 && (
                                  <div className="border-b mt-2" />
                                )}
                              </div>
                            ))}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
