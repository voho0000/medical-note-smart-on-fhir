import { useMemo } from 'react'
import { dataCategoryRegistry } from '@/src/core/registry/data-category.registry'
import type { DataFilters } from '@/src/core/entities/clinical-context.entity'
import type { DataCategory } from '@/src/core/interfaces/data-category.interface'

/** A bounded, hook-local cache of immutable source snapshots. No persistence,
 * cross-patient cache or approximate matching. Different filters/formatters
 * always recompute; returning to the same fit tier can reuse its sections. */
export function createRegistryContextCache(clinicalData: unknown, scopeKey: string) {
  const cache = new Map<string, {
    category: DataCategory
    extract: DataCategory['extractData']
    format: DataCategory['getContextSection']
    section: ReturnType<typeof dataCategoryRegistry.getCategoryContext>
  }>()
  return (categoryId: string, filters: DataFilters) => {
    const category = dataCategoryRegistry.get(categoryId)
    if (!category) return null
    const key = `${scopeKey}:${categoryId}:${JSON.stringify(Object.entries(filters).sort(([a], [b]) => a.localeCompare(b)))}`
    const cached = cache.get(key)
    if (cached && cached.category === category && cached.extract === category.extractData && cached.format === category.getContextSection) {
      cache.delete(key)
      cache.set(key, cached)
      return cached.section
    }
    const section = dataCategoryRegistry.getCategoryContext(categoryId, clinicalData, filters)
    cache.set(key, { category, extract: category.extractData, format: category.getContextSection, section })
    // Two expensive categories x five fit tiers, bounded per mounted hook.
    if (cache.size > 10) cache.delete(cache.keys().next().value!)
    return section
  }
}

export function useRegistryContextCache(clinicalData: unknown, nowMs: number, locale: string) {
  return useMemo(() => createRegistryContextCache(clinicalData, `${nowMs}:${locale}`), [clinicalData, nowMs, locale])
}
