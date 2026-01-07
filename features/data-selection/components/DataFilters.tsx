"use client"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useLanguage } from "@/src/application/providers/language.provider"
import type { DataFilters } from "@/src/core/entities/clinical-context.entity"

interface FilterProps {
  filters: DataFilters
  onFilterChange: (key: keyof DataFilters, value: any) => void
}

export function ConditionFilter({ filters, onFilterChange }: FilterProps) {
  const { t } = useLanguage()
  
  return (
    <div className="mt-2 pl-6 space-y-2">
      <div className="flex items-center space-x-2 text-sm">
        <span className="text-muted-foreground">{t.dataSelection.conditionStatus}</span>
        <Select
          value={filters.conditionStatus || 'active'}
          onValueChange={(value) => onFilterChange('conditionStatus', value as 'active' | 'all')}
          defaultValue="active"
        >
          <SelectTrigger className="h-8 w-36">
            <SelectValue placeholder="Select status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">{t.dataSelection.activeOnly}</SelectItem>
            <SelectItem value="all">{t.dataSelection.allConditions}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

export function MedicationFilter({ filters, onFilterChange }: FilterProps) {
  const { t } = useLanguage()
  
  return (
    <div className="mt-2 pl-6 space-y-2">
      <div className="flex items-center space-x-2 text-sm">
        <span className="text-muted-foreground">{t.dataSelection.medicationStatus}</span>
        <Select
          value={filters.medicationStatus}
          onValueChange={(value) => onFilterChange('medicationStatus', value as 'active' | 'all')}
        >
          <SelectTrigger className="h-8 w-36">
            <SelectValue placeholder="Select status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">{t.dataSelection.activeOnly}</SelectItem>
            <SelectItem value="all">{t.dataSelection.allMedications}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

export function VitalSignsFilter({ filters, onFilterChange }: FilterProps) {
  const { t } = useLanguage()
  
  return (
    <div className="mt-2 pl-6 space-y-3">
      <div className="space-y-2">
        <div className="flex items-center space-x-2 text-sm">
          <span className="text-muted-foreground">{t.dataSelection.reportVersion}</span>
          <Select
            value={filters.vitalSignsVersion || 'latest'}
            onValueChange={(value) => onFilterChange('vitalSignsVersion', value as 'latest' | 'all')}
            defaultValue="latest"
          >
            <SelectTrigger className="h-8 w-40">
              <SelectValue placeholder="Select version" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="latest">{t.dataSelection.latestOnly}</SelectItem>
              <SelectItem value="all">{t.dataSelection.allVersions}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="flex items-center space-x-2 text-sm">
          <span className="text-muted-foreground">{t.timeRanges.timeRange}</span>
          <Select
            value={filters.vitalSignsTimeRange || '1m'}
            onValueChange={(value) => onFilterChange('vitalSignsTimeRange', value as '24h' | '3d' | '1w' | '1m' | '3m' | 'all')}
            defaultValue="1m"
          >
            <SelectTrigger className="h-8 w-36">
              <SelectValue placeholder="Select time range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">{t.timeRanges['24h']}</SelectItem>
              <SelectItem value="3d">{t.timeRanges['3d']}</SelectItem>
              <SelectItem value="1w">{t.timeRanges['1w']}</SelectItem>
              <SelectItem value="1m">{t.timeRanges['1m']}</SelectItem>
              <SelectItem value="3m">{t.timeRanges['3m']}</SelectItem>
              <SelectItem value="all">{t.timeRanges.all}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )
}

export function LabReportFilter({ filters, onFilterChange }: FilterProps) {
  const { t } = useLanguage()
  
  return (
    <div className="mt-2 pl-6 space-y-3">
      <div className="space-y-2">
        <div className="flex items-center space-x-2 text-sm">
          <span className="text-muted-foreground">{t.dataSelection.reportVersion}</span>
          <Select
            value={filters.labReportVersion}
            onValueChange={(value) => onFilterChange('labReportVersion', value as 'latest' | 'all')}
            defaultValue="latest"
          >
            <SelectTrigger className="h-8 w-40">
              <SelectValue>
                {filters.labReportVersion === 'latest' ? t.dataSelection.latestReportOnly : t.dataSelection.allReports}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="latest">{t.dataSelection.latestReportOnly}</SelectItem>
              <SelectItem value="all">{t.dataSelection.allReports}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      
      <div className="space-y-2">
        <div className="flex items-center space-x-2 text-sm">
          <span className="text-muted-foreground">{t.timeRanges.timeRange}</span>
          <Select
            value={filters.reportTimeRange || '1m'}
            onValueChange={(value) => onFilterChange('reportTimeRange', value as '1w' | '1m' | '3m' | '6m' | '1y' | 'all')}
            defaultValue="1m"
          >
            <SelectTrigger className="h-8 w-36">
              <SelectValue placeholder="Select time range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1w">{t.timeRanges['1w']}</SelectItem>
              <SelectItem value="1m">{t.timeRanges['1m']}</SelectItem>
              <SelectItem value="3m">{t.timeRanges['3m']}</SelectItem>
              <SelectItem value="6m">{t.timeRanges['6m']}</SelectItem>
              <SelectItem value="1y">{t.timeRanges['1y']}</SelectItem>
              <SelectItem value="all">{t.timeRanges.all}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )
}

export function ProcedureFilter({ filters, onFilterChange }: FilterProps) {
  const { t } = useLanguage()
  
  return (
    <div className="mt-2 pl-6 space-y-3">
      <div className="space-y-2">
        <div className="flex items-center space-x-2 text-sm">
          <span className="text-muted-foreground">{t.dataSelection.reportVersion}</span>
          <Select
            value={filters.procedureVersion || 'latest'}
            onValueChange={(value) => onFilterChange('procedureVersion', value as 'latest' | 'all')}
            defaultValue="latest"
          >
            <SelectTrigger className="h-8 w-40">
              <SelectValue>
                {filters.procedureVersion === 'latest' ? t.dataSelection.latestReportOnly : t.dataSelection.allReports}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="latest">{t.dataSelection.latestReportOnly}</SelectItem>
              <SelectItem value="all">{t.dataSelection.allReports}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      
      <div className="space-y-2">
        <div className="flex items-center space-x-2 text-sm">
          <span className="text-muted-foreground">{t.timeRanges.timeRange}</span>
          <Select
            value={filters.procedureTimeRange || 'all'}
            onValueChange={(value) => onFilterChange('procedureTimeRange', value as '1w' | '1m' | '3m' | '6m' | '1y' | 'all')}
            defaultValue="all"
          >
            <SelectTrigger className="h-8 w-36">
              <SelectValue placeholder="Select time range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1w">{t.timeRanges['1w']}</SelectItem>
              <SelectItem value="1m">{t.timeRanges['1m']}</SelectItem>
              <SelectItem value="3m">{t.timeRanges['3m']}</SelectItem>
              <SelectItem value="6m">{t.timeRanges['6m']}</SelectItem>
              <SelectItem value="1y">{t.timeRanges['1y']}</SelectItem>
              <SelectItem value="all">{t.timeRanges.all}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )
}
