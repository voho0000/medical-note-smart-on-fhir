// Trend charts pull in the whole charting library, but they only ever mount
// after the clinician clicks a trend. Keep them out of first paint, then warm
// the shared chunk while the browser is idle so the first click does not pay
// the download/parse cost. The cached promise also deduplicates idle, hover,
// focus and click requests.
//
// Extracted from CumulativeLabReport.tsx so the pivot table (which owns the
// hover/focus preload on every column header) can warm the same single cached
// promise without importing the report shell back.
export type CumulativeLabTrendModule = typeof import("./CumulativeLabTrendDetail")

let cumulativeLabTrendModulePromise: Promise<CumulativeLabTrendModule> | null = null
let resolvedCumulativeLabTrendModule: CumulativeLabTrendModule | null = null

export function loadCumulativeLabTrendModule(): Promise<CumulativeLabTrendModule> {
  if (resolvedCumulativeLabTrendModule) {
    return Promise.resolve(resolvedCumulativeLabTrendModule)
  }
  cumulativeLabTrendModulePromise ??= import("./CumulativeLabTrendDetail").then((module) => {
    resolvedCumulativeLabTrendModule = module
    return module
  })
  return cumulativeLabTrendModulePromise
}

export function preloadCumulativeLabTrendModule(): void {
  void loadCumulativeLabTrendModule()
}

/** Already-resolved module, when one exists — lets the caller mount the real
 *  component synchronously instead of paying next/dynamic's loading frame. */
export function getResolvedCumulativeLabTrendModule(): CumulativeLabTrendModule | null {
  return resolvedCumulativeLabTrendModule
}
