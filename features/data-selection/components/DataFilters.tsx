"use client"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { useLanguage } from "@/src/application/providers/language.provider"
import type { CategoryFilterProps, FilterValue } from "@/src/core/interfaces/data-category.interface"

// Legacy interface for backward compatibility
interface FilterProps {
  filters: Record<string, FilterValue>
  onFilterChange: (key: string, value: FilterValue) => void
}

export function ConditionFilter({ filters, onFilterChange }: CategoryFilterProps) {
  const { t } = useLanguage()
  
  return (
    <div className="mt-2 pl-6 space-y-2">
      <div className="flex items-center space-x-2 text-sm">
        <span className="text-muted-foreground">{t.dataSelection.conditionStatus}</span>
        <Select
          value={(filters.conditionStatus as string) || 'active'}
          onValueChange={(value) => onFilterChange('conditionStatus', value)}
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

export function MedicationFilter({ filters, onFilterChange }: CategoryFilterProps) {
  const { t } = useLanguage()
  const dt = t.dataSelection as any

  return (
    <div className="mt-2 pl-6 space-y-2">
      <div className="flex items-center space-x-2 text-sm">
        <span className="text-muted-foreground">{t.dataSelection.medicationStatus}</span>
        <Select
          value={(filters.medicationStatus as string) || 'active'}
          onValueChange={(value) => onFilterChange('medicationStatus', value)}
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

      <div className="flex items-center space-x-2 text-sm">
        <span className="text-muted-foreground">{dt.medicationChronic ?? 'Chronic / Acute:'}</span>
        <Select
          value={(filters.medicationChronic as string) || 'all'}
          onValueChange={(value) => onFilterChange('medicationChronic', value)}
        >
          <SelectTrigger className="h-8 w-40">
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{dt.medicationChronicAll ?? 'All'}</SelectItem>
            <SelectItem value="chronic">{dt.medicationChronicOnly ?? 'Chronic (慢箋) Only'}</SelectItem>
            <SelectItem value="acute">{dt.medicationAcuteOnly ?? 'Acute Only'}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center space-x-2 text-sm">
        <span className="text-muted-foreground">{t.timeRanges.timeRange}</span>
        <Select
          value={(filters.medicationTimeRange as string) || 'all'}
          onValueChange={(value) => onFilterChange('medicationTimeRange', value)}
        >
          <SelectTrigger className="h-8 w-36">
            <SelectValue placeholder="Select time range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1m">{t.timeRanges['1m']}</SelectItem>
            <SelectItem value="3m">{t.timeRanges['3m']}</SelectItem>
            <SelectItem value="6m">{t.timeRanges['6m']}</SelectItem>
            <SelectItem value="1y">{t.timeRanges['1y']}</SelectItem>
            <SelectItem value="all">{t.timeRanges.all}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

export function ProblemListFilter({ filters, onFilterChange }: CategoryFilterProps) {
  const { t } = useLanguage()
  const dt = t.dataSelection as any

  return (
    <div className="mt-2 pl-6 space-y-2">
      <div className="flex items-center space-x-2 text-sm">
        <span className="text-muted-foreground">{dt.problemListStatus ?? 'Status:'}</span>
        <Select
          value={(filters.problemListStatus as string) || 'active'}
          onValueChange={(value) => onFilterChange('problemListStatus', value)}
        >
          <SelectTrigger className="h-8 w-36">
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">{t.dataSelection.activeOnly}</SelectItem>
            <SelectItem value="all">{dt.problemListAll ?? 'All Problems'}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

export function ImmunizationFilter({ filters, onFilterChange }: CategoryFilterProps) {
  const { t } = useLanguage()
  const tr = t.timeRanges as any

  return (
    <div className="mt-2 pl-6 space-y-2">
      <div className="flex items-center space-x-2 text-sm">
        <span className="text-muted-foreground">{t.timeRanges.timeRange}</span>
        <Select
          value={(filters.immunizationTimeRange as string) || 'all'}
          onValueChange={(value) => onFilterChange('immunizationTimeRange', value)}
        >
          <SelectTrigger className="h-8 w-36">
            <SelectValue placeholder="Select time range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1y">{t.timeRanges['1y']}</SelectItem>
            <SelectItem value="3y">{tr['3y'] ?? 'Last 3 years'}</SelectItem>
            <SelectItem value="5y">{tr['5y'] ?? 'Last 5 years'}</SelectItem>
            <SelectItem value="all">{t.timeRanges.all}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

export function VitalSignsFilter({ filters, onFilterChange }: CategoryFilterProps) {
  const { t } = useLanguage()
  
  return (
    <div className="mt-2 pl-6 space-y-3">
      <div className="space-y-2">
        <div className="flex items-center space-x-2 text-sm">
          <span className="text-muted-foreground">{t.dataSelection.reportVersion}</span>
          <Select
            value={(filters.vitalSignsVersion as string) || 'latest'}
            onValueChange={(value) => onFilterChange('vitalSignsVersion', value)}
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
            value={(filters.vitalSignsTimeRange as string) || '1m'}
            onValueChange={(value) => onFilterChange('vitalSignsTimeRange', value)}
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

export function LabReportFilter({ filters, onFilterChange }: CategoryFilterProps) {
  const { t } = useLanguage()
  
  return (
    <div className="mt-2 pl-6 space-y-3">
      <div className="space-y-2">
        <div className="flex items-center space-x-2 text-sm">
          <span className="text-muted-foreground">{t.dataSelection.reportVersion}</span>
          <Select
            value={(filters.labReportVersion as string) || 'latest'}
            onValueChange={(value) => onFilterChange('labReportVersion', value)}
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
            value={(filters.labReportTimeRange as string) || 'all'}
            onValueChange={(value) => onFilterChange('labReportTimeRange', value)}
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

export function ImagingReportFilter({ filters, onFilterChange }: CategoryFilterProps) {
  const { t } = useLanguage()
  
  return (
    <div className="mt-2 pl-6 space-y-3">
      <div className="space-y-2">
        <div className="flex items-center space-x-2 text-sm">
          <span className="text-muted-foreground">{t.dataSelection.reportVersion}</span>
          <Select
            value={(filters.imagingReportVersion as string) || 'latest'}
            onValueChange={(value) => onFilterChange('imagingReportVersion', value)}
            defaultValue="latest"
          >
            <SelectTrigger className="h-8 w-40">
              <SelectValue>
                {filters.imagingReportVersion === 'latest' ? t.dataSelection.latestReportOnly : t.dataSelection.allReports}
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
            value={(filters.imagingReportTimeRange as string) || 'all'}
            onValueChange={(value) => onFilterChange('imagingReportTimeRange', value)}
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

export function ProcedureFilter({ filters, onFilterChange }: CategoryFilterProps) {
  const { t } = useLanguage()
  
  return (
    <div className="mt-2 pl-6 space-y-3">
      <div className="space-y-2">
        <div className="flex items-center space-x-2 text-sm">
          <span className="text-muted-foreground">{t.dataSelection.reportVersion}</span>
          <Select
            value={(filters.procedureVersion as string) || 'latest'}
            onValueChange={(value) => onFilterChange('procedureVersion', value)}
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
            value={(filters.procedureTimeRange as string) || 'all'}
            onValueChange={(value) => onFilterChange('procedureTimeRange', value)}
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
