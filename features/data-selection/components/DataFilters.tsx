"use client"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { DataFilters } from "@/src/core/entities/clinical-context.entity"

interface FilterProps {
  filters: DataFilters
  onFilterChange: (key: keyof DataFilters, value: any) => void
}

export function MedicationFilter({ filters, onFilterChange }: FilterProps) {
  return (
    <div className="mt-2 pl-6 space-y-2">
      <div className="flex items-center space-x-2 text-sm">
        <span className="text-muted-foreground">Medication Status:</span>
        <Select
          value={filters.medicationStatus}
          onValueChange={(value) => onFilterChange('medicationStatus', value as 'active' | 'all')}
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
}

export function VitalSignsFilter({ filters, onFilterChange }: FilterProps) {
  return (
    <div className="mt-2 pl-6 space-y-3">
      <div className="space-y-2">
        <div className="flex items-center space-x-2 text-sm">
          <span className="text-muted-foreground">Report Version:</span>
          <Select
            value={filters.vitalSignsVersion || 'latest'}
            onValueChange={(value) => onFilterChange('vitalSignsVersion', value as 'latest' | 'all')}
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
            onValueChange={(value) => onFilterChange('vitalSignsTimeRange', value as '24h' | '3d' | '1w' | '1m' | '3m' | 'all')}
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
}

export function LabReportFilter({ filters, onFilterChange }: FilterProps) {
  return (
    <div className="mt-2 pl-6 space-y-3">
      <div className="space-y-2">
        <div className="flex items-center space-x-2 text-sm">
          <span className="text-muted-foreground">Report Version:</span>
          <Select
            value={filters.labReportVersion}
            onValueChange={(value) => onFilterChange('labReportVersion', value as 'latest' | 'all')}
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
            onValueChange={(value) => onFilterChange('reportTimeRange', value as '1w' | '1m' | '3m' | '6m' | '1y' | 'all')}
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
}
