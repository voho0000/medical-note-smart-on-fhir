// Custom Hook: Grouped Rows
import { useMemo } from 'react'
import type { Row } from '../types'

export function useGroupedRows(rows: Row[]) {
  return useMemo(() => {
    const lab = rows.filter((row) => row.group === "lab")
    const imaging = rows.filter((row) => row.group === "imaging")
    const proceduresOnly = rows.filter((row) => row.group === "procedures")
    const vitals = rows.filter((row) => row.group === "vitals")
    const other = rows.filter((row) => row.group === "other")
    
    return {
      all: rows,
      lab,
      imaging,
      procedures: proceduresOnly,
      vitals,
      other,
    }
  }, [rows])
}
