/**
 * Utility functions for calculating report row counts
 * Used by both Data Selection and Reports features to ensure consistent counting
 */

const getCodeableConceptText = (concept: any): string => {
  if (!concept) return ""
  if (typeof concept === "string") return concept
  if (concept.text) return concept.text
  if (Array.isArray(concept.coding) && concept.coding.length > 0) {
    return concept.coding[0].display || concept.coding[0].code || ""
  }
  return ""
}

const inferGroupFromCategory = (category: any): string => {
  if (!category) return "lab"
  const categoryArray = Array.isArray(category) ? category : [category]
  
  for (const cat of categoryArray) {
    const text = getCodeableConceptText(cat).toLowerCase()
    if (text.includes("imaging") || text.includes("radiology")) return "imaging"
    if (text.includes("laboratory") || text.includes("lab")) return "lab"
  }
  return "lab"
}

const inferGroupFromObservation = (obs: any): string => {
  const category = obs?.category
  if (!category) return "lab"
  const categoryArray = Array.isArray(category) ? category : [category]
  
  for (const cat of categoryArray) {
    const text = getCodeableConceptText(cat).toLowerCase()
    if (text.includes("imaging")) return "imaging"
    if (text.includes("laboratory") || text.includes("lab")) return "lab"
  }
  return "lab"
}

export interface ReportsRowCounts {
  total: number
  lab: number
  imaging: number
  procedures: number
}

export interface ReportFilters {
  labReportVersion?: 'all' | 'latest'
  reportTimeRange?: string
  procedureVersion?: 'all' | 'latest'
  procedureTimeRange?: string
}

const isWithinTimeRange = (dateString: string | undefined, range: string): boolean => {
  if (!dateString) return false
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return false
  
  const now = new Date()
  const diffInMs = now.getTime() - date.getTime()
  const diffInDays = diffInMs / (1000 * 60 * 60 * 24)
  
  switch (range) {
    case '24h': return diffInDays <= 1
    case '3d': return diffInDays <= 3
    case '1w': return diffInDays <= 7
    case '1m': return diffInDays <= 30
    case '3m': return diffInDays <= 90
    case '6m': return diffInDays <= 180
    case '1y': return diffInDays <= 365
    case 'all':
    default:
      return true
  }
}

const getLatestVersions = (items: any[]) => {
  const latestVersions = new Map()
  
  items.forEach(item => {
    const [baseId] = item.id?.split('/_history/') || []
    if (!baseId) return
    
    const existing = latestVersions.get(baseId)
    const currentVersion = parseInt(item.meta?.versionId || '0', 10)
    const existingVersion = parseInt(existing?.meta?.versionId || '0', 10)
    
    if (!existing || currentVersion > existingVersion) {
      latestVersions.set(baseId, item)
    }
  })
  
  return Array.from(latestVersions.values())
}

/**
 * Calculate the number of rows that will be displayed in the Reports feature
 * This matches the logic in ReportsCard to ensure Data Selection shows consistent counts
 */
export function calculateReportsRowCounts(
  diagnosticReports: any[],
  observations: any[],
  procedures: any[],
  filters?: ReportFilters
): ReportsRowCounts {
  // Start with all diagnostic reports
  let filteredReports = diagnosticReports || []
  
  // Apply version filter: 'latest' = filter to latest versions, 'all' = keep all
  if (filters?.labReportVersion === 'latest') {
    filteredReports = getLatestVersions(filteredReports)
  }

  // Apply time range filter
  const timeRange = filters?.reportTimeRange
  if (timeRange && timeRange !== 'all') {
    filteredReports = filteredReports.filter((dr: any) => {
      const date = dr.effectiveDateTime || dr.issued
      return isWithinTimeRange(date, timeRange)
    })
  }

  // Count diagnostic report rows - each valid DiagnosticReport = 1 row
  const validReports = filteredReports.filter((dr: any) => {
    if (!dr) return false
    const obs = Array.isArray(dr._observations) ? dr._observations.filter((o: any) => !!o) : []
    return obs.length > 0 || dr.conclusion || (Array.isArray(dr.note) && dr.note.length > 0)
  })
  const reportRowCount = validReports.length

  // Count orphan observations (not already in filtered diagnostic reports)
  const seenIds = new Set<string>()
  ;validReports.forEach((dr: any) => {
    if (!dr) return
    const obs = Array.isArray(dr._observations) ? dr._observations : []
    obs.forEach((o: any) => {
      if (o?.id) seenIds.add(o.id)
    })
  })

  let orphanObs = (observations || []).filter((o: any) => !o.id || !seenIds.has(o.id))
  
  // Apply time range filter to orphan observations as well
  if (timeRange && timeRange !== 'all') {
    orphanObs = orphanObs.filter((o: any) => {
      const date = o.effectiveDateTime || o.issued
      return isWithinTimeRange(date, timeRange)
    })
  }
  
  const panels = orphanObs.filter((o: any) =>
    (Array.isArray(o.component) && o.component.length > 0) ||
    (Array.isArray(o.hasMember) && o.hasMember.length > 0) ||
    !!o.valueQuantity ||
    !!o.valueString
  )

  const groupKey = (o: any) =>
    (o.encounter?.reference || "") +
    "|" +
    (o.effectiveDateTime ? new Date(o.effectiveDateTime).toISOString().slice(0, 10) : "unknown") +
    "|" +
    (getCodeableConceptText(o.code) || "Observation")

  const groups = new Map<string, any[]>()
  for (const o of panels) {
    const k = groupKey(o)
    const arr = groups.get(k) || []
    arr.push(o)
    groups.set(k, arr)
  }
  const orphanRowCount = groups.size

  // Count procedure rows with filters
  let filteredProcedures = procedures || []
  
  // Apply time range filter to procedures
  const procedureTimeRange = filters?.procedureTimeRange
  if (procedureTimeRange && procedureTimeRange !== 'all') {
    filteredProcedures = filteredProcedures.filter((p: any) => {
      const performed = p.performedDateTime || p.performedPeriod?.end || p.performedPeriod?.start
      return isWithinTimeRange(performed, procedureTimeRange)
    })
  }
  
  // Apply version filter to procedures (latest only)
  if (filters?.procedureVersion === 'latest') {
    const byName = new Map<string, any>()
    filteredProcedures.forEach((procedure: any) => {
      const name = getCodeableConceptText(procedure.code) || 'Procedure'
      const existing = byName.get(name)
      const performed = procedure.performedDateTime || procedure.performedPeriod?.end || procedure.performedPeriod?.start
      const existingPerformed = existing?.performedDateTime || existing?.performedPeriod?.end || existing?.performedPeriod?.start
      
      if (!existing || (performed && existingPerformed && performed > existingPerformed)) {
        byName.set(name, procedure)
      }
    })
    filteredProcedures = Array.from(byName.values())
  }
  
  const procedureRowCount = filteredProcedures.length

  const totalRows = reportRowCount + orphanRowCount + procedureRowCount

  // Count by category (using valid reports only)
  let labCount = 0
  let imagingCount = 0

  // Count diagnostic reports by group
  validReports.forEach((dr: any) => {
    const group = inferGroupFromCategory(dr.category)
    if (group === "lab") labCount++
    else if (group === "imaging") imagingCount++
  })

  // Count orphan observations by group
  Array.from(groups.values()).forEach((lst) => {
    const first = lst[0]
    const group = inferGroupFromObservation(first)
    if (group === "lab") labCount++
    else if (group === "imaging") imagingCount++
  })

  return {
    total: totalRows,
    lab: labCount,
    imaging: imagingCount,
    procedures: procedureRowCount
  }
}
