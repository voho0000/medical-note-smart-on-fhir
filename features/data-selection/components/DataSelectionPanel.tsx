// features/data-selection/components/DataSelectionPanel.tsx
"use client"

import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Info } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

import { DataType, DataSelection } from "../hooks/useDataSelection"

type ClinicalData = {
  conditions: any[]
  medications: any[]
  allergies: any[]
  diagnosticReports: any[]
  observations: any[]
}

interface DataItem {
  id: DataType
  label: string
  description: string
  count: number
  category?: string
}

interface DataSelectionPanelProps {
  clinicalData: ClinicalData
  selectedData: DataSelection
  onSelectionChange: (selectedData: DataSelection) => void
}

export function DataSelectionPanel({ 
  clinicalData, 
  selectedData, 
  onSelectionChange 
}: DataSelectionPanelProps) {
  const dataCategories: DataItem[] = [
    {
      id: 'conditions',
      label: 'Medical Conditions',
      description: 'Active and historical medical conditions',
      count: clinicalData.conditions.length,
      category: 'clinical'
    } as const,
    {
      id: 'medications',
      label: 'Medications',
      description: 'Current and past medications',
      count: clinicalData.medications.length,
      category: 'medication'
    } as const,
    {
      id: 'allergies',
      label: 'Allergies & Intolerances',
      description: 'Known allergies and adverse reactions',
      count: clinicalData.allergies.length,
      category: 'clinical'
    } as const,
    {
      id: 'diagnosticReports',
      label: 'Diagnostic Reports',
      description: 'Lab results and diagnostic imaging reports',
      count: clinicalData.diagnosticReports.length,
      category: 'diagnostics'
    } as const,
    {
      id: 'observations',
      label: 'Vital Signs',
      description: 'Vital signs and other clinical measurements',
      count: clinicalData.observations.length,
      category: 'clinical'
    } as const
  ]

  const handleToggle = (id: DataType, checked: boolean) => {
    onSelectionChange({
      ...selectedData,
      [id]: checked
    } as DataSelection)
  }

  const handleToggleAll = (checked: boolean) => {
    const newSelection = { ...selectedData } as DataSelection
    dataCategories.forEach(item => {
      newSelection[item.id] = checked
    })
    onSelectionChange(newSelection)
  }

  const allSelected = dataCategories.every(item => selectedData[item.id])
  const someSelected = dataCategories.some(item => selectedData[item.id]) && !allSelected

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-medium">Data Categories</h2>
          <p className="text-sm text-muted-foreground">
            Select which data categories to include in your notes
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => handleToggleAll(!allSelected)}
          >
            {allSelected ? 'Deselect All' : someSelected ? 'Select All' : 'Select All'}
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {dataCategories.map(({ id, label, description, count, category }) => (
          <Card key={id} className="p-4 hover:bg-muted/50 transition-colors">
            <div className="flex items-start space-x-3">
              <Checkbox
                id={`data-${id}`}
                checked={!!selectedData[id]}
                onCheckedChange={(checked) => handleToggle(id, checked as boolean)}
                className="mt-1"
              />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Label 
                      htmlFor={`data-${id}`} 
                      className="font-medium text-sm flex items-center"
                    >
                      {label}
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-4 w-4 ml-1">
                              <Info className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="sr-only">Info</span>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p>{description}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </Label>
                  </div>
                  <Badge 
                    variant={selectedData[id] ? "default" : "secondary"}
                    className="ml-2"
                  >
                    {count} {count === 1 ? 'item' : 'items'}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {description}
                </p>
                {category && (
                  <div className="mt-2">
                    <Badge variant="outline" className="text-xs">
                      {category}
                    </Badge>
                  </div>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
