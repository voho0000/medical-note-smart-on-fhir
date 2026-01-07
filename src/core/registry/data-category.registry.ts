// Data Category Registry
// Central registry for all data categories
// To add a new category, simply register it here

import type { DataCategory, DataCategoryRegistry, FilterValue } from '../interfaces/data-category.interface'
import type { DataSelection, DataFilters } from '../entities/clinical-context.entity'

class DataCategoryRegistryImpl {
  private categories: DataCategoryRegistry = new Map()
  
  register(category: DataCategory): void {
    if (this.categories.has(category.id)) {
      console.warn(`Category ${category.id} is already registered. Overwriting.`)
    }
    this.categories.set(category.id, category)
  }
  
  unregister(categoryId: string): void {
    this.categories.delete(categoryId)
  }
  
  get(categoryId: string): DataCategory | undefined {
    return this.categories.get(categoryId)
  }
  
  getAll(): DataCategory[] {
    return Array.from(this.categories.values()).sort((a, b) => a.order - b.order)
  }
  
  getAllIds(): string[] {
    return this.getAll().map(c => c.id)
  }
  
  // Generate default selection (all enabled)
  getDefaultSelection(): DataSelection {
    const selection = {} as any
    this.categories.forEach((_, id) => {
      selection[id] = true
    })
    return selection as DataSelection
  }
  
  // Generate default filters from all category filter configs
  getDefaultFilters(): DataFilters {
    const filters = {} as any
    this.categories.forEach((category) => {
      category.filters?.forEach((filter) => {
        filters[filter.key] = filter.defaultValue
      })
    })
    return filters as DataFilters
  }
  
  // Get count for a specific category
  getCategoryCount(categoryId: string, clinicalData: any, filters: DataFilters): number {
    const category = this.categories.get(categoryId)
    if (!category) return 0
    
    const data = category.extractData(clinicalData)
    return category.getCount(data, filters as any, clinicalData)
  }
  
  // Get context section for a specific category
  getCategoryContext(
    categoryId: string,
    clinicalData: any,
    filters: DataFilters
  ) {
    const category = this.categories.get(categoryId)
    if (!category) return null
    
    const data = category.extractData(clinicalData)
    return category.getContextSection(data, filters as any, clinicalData)
  }
  
  // Get all context sections for selected categories
  getAllContextSections(
    selection: DataSelection,
    clinicalData: any,
    filters: DataFilters
  ) {
    const sections: any[] = []
    
    this.getAll().forEach((category) => {
      if (!(selection as any)[category.id]) return
      
      const context = this.getCategoryContext(category.id, clinicalData, filters)
      if (context) {
        if (Array.isArray(context)) {
          sections.push(...context)
        } else {
          sections.push(context)
        }
      }
    })
    
    return sections
  }
}

// Singleton instance
export const dataCategoryRegistry = new DataCategoryRegistryImpl()

// Helper function to register a category
export function registerDataCategory(category: DataCategory): void {
  dataCategoryRegistry.register(category)
}
