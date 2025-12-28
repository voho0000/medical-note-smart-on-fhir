// features/data-selection/components/DataSelectionPanel.tsx
"use client"

import { useState, useEffect, useMemo } from "react"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"

import { DataType, DataSelection, DataFilters } from "../hooks/useDataSelection"
import { useClinicalContext } from "../hooks/useClinicalContext"

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
  const { 
    getFormattedClinicalContext, 
    supplementaryNotes, 
    setSupplementaryNotes,
    editedClinicalContext,
    setEditedClinicalContext,
    resetClinicalContextToDefault
  } = useClinicalContext()

  // Helper function to check if a date is within the specified time range
  const isWithinTimeRange = (dateString: string | undefined, range: string): boolean => {
    if (!dateString) return false;
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return false;
    
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInDays = diffInMs / (1000 * 60 * 60 * 24);
    
    switch (range) {
      case '24h': return diffInDays <= 1;
      case '3d': return diffInDays <= 3;
      case '1w': return diffInDays <= 7;
      case '1m': return diffInDays <= 30;
      case '3m': return diffInDays <= 90;
      case '6m': return diffInDays <= 180;
      case '1y': return diffInDays <= 365;
      case 'all':
      default:
        return true;
    }
  };

  // Get the latest version of each item by ID
  const getLatestVersions = (items: any[]) => {
    const latestVersions = new Map();
    
    items.forEach(item => {
      // For FHIR resources, the ID might include the version after a /_history/ part
      // Example: "Observation/123/_history/1"
      const [baseId] = item.id?.split('/_history/') || [];
      if (!baseId) return;
      
      const existing = latestVersions.get(baseId);
      const currentVersion = parseInt(item.meta?.versionId || '0', 10);
      const existingVersion = parseInt(existing?.meta?.versionId || '0', 10);
      
      if (!existing || currentVersion > existingVersion) {
        latestVersions.set(baseId, item);
      }
    });
    
    return Array.from(latestVersions.values());
  };

  // Calculate filtered counts based on time range and version
  const getFilteredCount = (items: any[], dataType: 'diagnosticReports' | 'observations' = 'diagnosticReports') => {
    if (!items || !items.length) return 0;
    if (!filters) return items.length;
    
    // Debug log
    console.log(`Getting filtered count for ${dataType}`, {
      filters,
      itemCount: items.length,
      hasItems: items.length > 0
    });
    
    // Handle version filtering first
    let filteredItems = [...items];
    if (dataType === 'diagnosticReports') {
      console.log('Applying diagnostic reports filter:', {
        labReportVersion: filters.labReportVersion,
        originalCount: filteredItems.length
      });
      if (filters.labReportVersion === 'latest') {
        filteredItems = getLatestVersions(items);
        console.log('After latest version filter:', filteredItems.length);
      }
    } else if (dataType === 'observations') {
      console.log('Applying observations filter:', {
        vitalSignsVersion: filters.vitalSignsVersion,
        originalCount: filteredItems.length
      });
      if (filters.vitalSignsVersion === 'latest') {
        filteredItems = getLatestVersions(items);
        console.log('After latest version filter:', filteredItems.length);
      }
    }
    
    // Then handle time range filtering
    const timeRange = dataType === 'diagnosticReports' 
      ? filters.reportTimeRange 
      : filters.vitalSignsTimeRange;
      
    if (!timeRange || timeRange === 'all') return filteredItems.length;
    
    return filteredItems.filter(item => {
      const date = item.effectiveDateTime;
      return isWithinTimeRange(date, timeRange);
    }).length;
  };

  // Force re-render when filters change
  const [filterKey, setFilterKey] = useState(0);

  // Memoize the data categories to prevent unnecessary re-renders
  const dataCategories = useMemo(() => {
    // This will force a re-render when filterKey changes
    const _ = filterKey;
    return [
      {
        id: 'conditions' as const,
        label: 'Medical Conditions',
        description: 'Active and historical medical conditions',
        count: clinicalData.conditions?.length || 0, // Conditions typically don't have a time range
        category: 'clinical'
      },
      {
        id: 'medications' as const,
        label: 'Medications',
        description: 'Current and past medications',
        count: clinicalData.medications?.length || 0, // Medications typically don't have a time range
        category: 'medication'
      },
      {
        id: 'allergies' as const,
        label: 'Allergies & Intolerances',
        description: 'Known allergies and adverse reactions',
        count: clinicalData.allergies?.length || 0, // Allergies typically don't have a time range
        category: 'clinical'
      },
      {
        id: 'diagnosticReports' as const,
        label: 'Diagnostic Reports',
        description: 'Lab results and diagnostic imaging reports',
        count: getFilteredCount(clinicalData.diagnosticReports || [], 'diagnosticReports'),
        category: 'diagnostics'
      },
      {
        id: 'observations' as const,
        label: 'Vital Signs',
        description: 'Vital signs and other clinical measurements',
        count: getFilteredCount(clinicalData.observations || [], 'observations'),
        category: 'clinical'
      }
    ];
  }, [
    clinicalData.conditions,
    clinicalData.medications,
    clinicalData.allergies,
    clinicalData.diagnosticReports,
    clinicalData.observations,
    filters?.reportTimeRange,
    filters?.vitalSignsTimeRange,
    filters?.labReportVersion,
    filters?.vitalSignsVersion,
    filterKey
  ]);

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
    console.log('Filter changed:', { key, value, currentFilters: filters });
    
    const newFilters = {
      ...filters,
      [key]: value
    };
    
    console.log('New filters:', newFilters);
    
    // Force a re-render by creating a new object reference and updating the filter key
    onFiltersChange({ ...newFilters });
    
    // Force a re-render to ensure the component updates
    setFilterKey(prev => prev + 1);
    
    // Log the current time to verify the function is called
    console.log('Filter change processed at:', new Date().toISOString());
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

  const selectionContent = (
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

  const previewContent = (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-base font-medium">Supplementary Notes</h3>
        <p className="text-sm text-muted-foreground">
          Add additional context or notes to send to the AI
        </p>
      </div>
      <Textarea 
        value={supplementaryNotes}
        onChange={(e) => setSupplementaryNotes(e.target.value)}
        className="min-h-[120px] font-mono text-sm"
        placeholder="Add supplementary notes here..."
      />
      <div className="space-y-1 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium">Formatted Clinical Context</h2>
          <p className="text-sm text-muted-foreground">
            Edit the clinical context to remove unnecessary details
          </p>
        </div>
        <Button 
          variant="outline" 
          size="sm"
          onClick={resetClinicalContextToDefault}
          disabled={!editedClinicalContext}
        >
          Reset to Default
        </Button>
      </div>
      <Textarea 
        value={editedClinicalContext ?? getFormattedClinicalContext()}
        onChange={(e) => setEditedClinicalContext(e.target.value)}
        className="min-h-[250px] font-mono text-sm"
        placeholder="No data selected"
      />
    </div>
  )

  return (
    <Tabs defaultValue="selection" className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="selection">Data Selection</TabsTrigger>
        <TabsTrigger value="preview">Preview</TabsTrigger>
      </TabsList>
      <TabsContent value="selection" className="mt-6">
        {selectionContent}
      </TabsContent>
      <TabsContent value="preview" className="mt-6">
        {previewContent}
      </TabsContent>
    </Tabs>
  )
}