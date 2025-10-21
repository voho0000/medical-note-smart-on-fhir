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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { DataType, DataSelection, DataFilters } from "../hooks/useDataSelection"

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
  filters: DataFilters
  onSelectionChange: (selectedData: DataSelection) => void
  onFiltersChange: (filters: DataFilters) => void
}

export function DataSelectionPanel({ 
  clinicalData, 
  selectedData,
  filters,
  onSelectionChange,
  onFiltersChange 
}: DataSelectionPanelProps) {
  const dataCategories: DataItem[] = [
    {
      id: 'conditions',
      label: 'Medical Conditions',
      description: 'Active and historical medical conditions',
      count: clinicalData.conditions?.length || 0,
      category: 'clinical'
    },
    {
      id: 'medications',
      label: 'Medications',
      description: 'Current and past medications',
      count: clinicalData.medications?.length || 0,
      category: 'medication'
    },
    {
      id: 'allergies',
      label: 'Allergies & Intolerances',
      description: 'Known allergies and adverse reactions',
      count: clinicalData.allergies?.length || 0,
      category: 'clinical'
    },
    {
      id: 'diagnosticReports',
      label: 'Diagnostic Reports',
      description: 'Lab results and diagnostic imaging reports',
      count: clinicalData.diagnosticReports?.length || 0,
      category: 'diagnostics'
    },
    {
      id: 'observations',
      label: 'Vital Signs',
      description: 'Vital signs and other clinical measurements',
      count: clinicalData.observations?.length || 0,
      category: 'clinical'
    }
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

  const handleFilterChange = (key: keyof DataFilters, value: any) => {
    onFiltersChange({
      ...filters,
      [key]: value
    })
  }

  const allSelected = dataCategories.every(item => selectedData[item.id])
  const someSelected = dataCategories.some(item => selectedData[item.id]) && !allSelected

  const renderMedicationFilter = () => (
    <div className="mt-2 pl-6 space-y-2">
      <div className="flex items-center space-x-2 text-sm">
        <span className="text-muted-foreground">Medication Status:</span>
        <Select
          value={filters.medicationStatus}
          onValueChange={(value) => handleFilterChange('medicationStatus', value as 'active' | 'all')}
        >
          <SelectTrigger className="h-8 w-36">
            <SelectValue placeholder="Select status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active only</SelectItem>
            <SelectItem value="all">All medications</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )

  const renderVitalSignsFilters = () => (
    <div className="mt-2 pl-6 space-y-3">
      <div className="space-y-2">
        <div className="flex items-center space-x-2 text-sm">
          <span className="text-muted-foreground">Report Version:</span>
          <Select
            value={filters.vitalSignsVersion || 'latest'}
            onValueChange={(value) => handleFilterChange('vitalSignsVersion', value as 'latest' | 'all')}
            defaultValue="latest"
          >
            <SelectTrigger className="h-8 w-40">
              <SelectValue placeholder="Select version" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="latest">Latest only</SelectItem>
              <SelectItem value="all">All versions</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="flex items-center space-x-2 text-sm">
          <span className="text-muted-foreground">Time Range:</span>
          <Select
            value={filters.vitalSignsTimeRange || '1m'}
            onValueChange={(value) => handleFilterChange('vitalSignsTimeRange', value as '24h' | '3d' | '1w' | '1m' | '3m' | 'all')}
            defaultValue="1m"
          >
            <SelectTrigger className="h-8 w-36">
              <SelectValue placeholder="Select time range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">Last 24 hours</SelectItem>
              <SelectItem value="3d">Last 3 days</SelectItem>
              <SelectItem value="1w">Last week</SelectItem>
              <SelectItem value="1m">Last month</SelectItem>
              <SelectItem value="3m">Last 3 months</SelectItem>
              <SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )

  const renderLabReportFilters = () => (
    <div className="mt-2 pl-6 space-y-3">
      <div className="space-y-2">
        <div className="flex items-center space-x-2 text-sm">
          <span className="text-muted-foreground">Report Version:</span>
          <Select
            value={filters.labReportVersion}
            onValueChange={(value) => handleFilterChange('labReportVersion', value as 'latest' | 'all')}
            defaultValue="latest"
          >
            <SelectTrigger className="h-8 w-40">
              <SelectValue>
                {filters.labReportVersion === 'latest' ? 'Latest report only' : 'All reports'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="latest">Latest report only</SelectItem>
              <SelectItem value="all">All reports</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      
      <div className="space-y-2">
        <div className="flex items-center space-x-2 text-sm">
          <span className="text-muted-foreground">Time Range:</span>
          <Select
            value={filters.reportTimeRange || '1m'}
            onValueChange={(value) => handleFilterChange('reportTimeRange', value as '1w' | '1m' | '3m' | '6m' | '1y' | 'all')}
            defaultValue="1m"
          >
            <SelectTrigger className="h-8 w-36">
              <SelectValue placeholder="Select time range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1w">Last week</SelectItem>
              <SelectItem value="1m">Last month</SelectItem>
              <SelectItem value="3m">Last 3 months</SelectItem>
              <SelectItem value="6m">Last 6 months</SelectItem>
              <SelectItem value="1y">Last year</SelectItem>
              <SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )

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
        {dataCategories.map(({ id, label, description, count }) => (
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
                
                {/* Medication specific filters */}
                {id === 'medications' && selectedData.medications && renderMedicationFilter()}
                {id === 'observations' && selectedData.observations && renderVitalSignsFilters()}
                {id === 'diagnosticReports' && selectedData.diagnosticReports && renderLabReportFilters()}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}