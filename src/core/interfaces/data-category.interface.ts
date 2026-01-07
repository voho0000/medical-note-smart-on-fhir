// Core Interface: Data Category
// This defines the contract for all data categories in the application
// Adding a new category only requires implementing this interface

import type { ReactNode, ComponentType } from 'react'

export type TimeRange = '24h' | '3d' | '1w' | '1m' | '3m' | '6m' | '1y' | 'all'

export interface ClinicalContextSection {
  title: string
  items: string[]
}

// Generic filter value types
export type FilterValue = string | boolean | number

// Filter configuration for a category
export interface CategoryFilter {
  key: string
  type: 'select' | 'toggle'
  label: string
  options?: { value: string; label: string }[]
  defaultValue: FilterValue
}

// Props interface for filter components
export interface CategoryFilterProps {
  filters: Record<string, FilterValue>
  onFilterChange: (key: string, value: FilterValue) => void
}

// The main interface that all data categories must implement
export interface DataCategory<TData = any> {
  // Unique identifier for this category
  id: string
  
  // Display information
  label: string
  labelKey: string  // i18n key for label
  description: string
  descriptionKey: string  // i18n key for description
  
  // UI grouping (e.g., 'patient', 'clinical', 'diagnostics', 'procedures')
  group: string
  
  // Order for display (lower = higher priority)
  order: number
  
  // Filter configuration for this category
  filters?: CategoryFilter[]
  
  // Optional React component for rendering filters
  // If provided, this component will be used instead of auto-generating filters
  FilterComponent?: ComponentType<CategoryFilterProps>
  
  // Extract relevant data from clinical data
  extractData: (clinicalData: any) => TData[]
  
  // Calculate count based on data and filters
  getCount: (data: TData[], filters: Record<string, FilterValue>, allClinicalData?: any) => number
  
  // Generate clinical context section for AI
  getContextSection: (
    data: TData[],
    filters: Record<string, FilterValue>,
    allClinicalData?: any
  ) => ClinicalContextSection | ClinicalContextSection[] | null
}

// Registry type
export type DataCategoryRegistry = Map<string, DataCategory>

// Note: DataSelection and DataFilters types are defined in clinical-context.entity.ts
// to maintain backward compatibility with existing code
