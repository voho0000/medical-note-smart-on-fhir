"use client"

// Headless, always-mounted runner for the adaptive "small record → default to
// 全部資料" behavior. Mounted inside DataSelectionProvider (not the 資料選擇
// tab) so the auto-select applies app-wide — chat / summary / safety all get
// the full record for a data-sparse patient even if the user never opens the
// data-selection panel. Renders nothing.
import { useMemo } from "react"
import { useClinicalData } from "@/src/application/hooks/clinical-data/use-clinical-data-query.hook"
import { useClinicalDataMapper } from "@/src/application/hooks/data/use-clinical-data-mapper.hook"
import { useAdaptiveDataDefaults } from "./hooks/useAdaptiveDataDefaults"

interface RawClinicalData {
  isLoading: boolean
}

export function AdaptiveDataDefaultsRunner() {
  const raw = useClinicalData() as RawClinicalData
  const mapper = useClinicalDataMapper()
  const mapped = useMemo(
    () => (!raw || raw.isLoading ? null : mapper.toClinicalDataCollection(raw)),
    [raw, mapper],
  )
  useAdaptiveDataDefaults(mapped)
  return null
}
