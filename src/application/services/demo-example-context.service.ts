import { GenerateClinicalContextUseCase } from '@/src/core/use-cases/clinical-context/generate-clinical-context.use-case'
import { LocalBundleService } from '@/src/infrastructure/fhir/services/local-bundle.service'
import {
  ALL_DATA_FILTERS,
  ALL_DATA_SELECTION,
} from '@/src/shared/constants/data-selection.constants'
import { buildPatientTextLiterals } from '@/src/shared/utils/pii-text-scrub'

const DEMO_FETCH_TIMEOUT_MS = 15_000

export interface DemoExampleContext {
  clinicalContext: string
  piiLiterals: string[]
}

let cachedContext: DemoExampleContext | null = null
let pendingContext: Promise<DemoExampleContext> | null = null

async function fetchDemoExampleContext(): Promise<DemoExampleContext> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), DEMO_FETCH_TIMEOUT_MS)

  try {
    const base = process.env.NEXT_PUBLIC_BASE_PATH || ''
    const response = await fetch(`${base}/demo/demo-bundle.json`, {
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`Failed to load demo data (${response.status})`)

    const parsed = LocalBundleService.parse(await response.json())
    if (!parsed) throw new Error('Demo data does not contain a patient')

    const formatter = new GenerateClinicalContextUseCase()
    const sections = formatter.execute(parsed.patient, parsed.collection, {
      selection: ALL_DATA_SELECTION,
      filters: ALL_DATA_FILTERS,
    })
    const clinicalContext = formatter.formatSections(sections)
    if (!clinicalContext.trim() || clinicalContext === 'No clinical data available.') {
      throw new Error('Demo clinical context is empty')
    }

    return {
      clinicalContext,
      piiLiterals: buildPatientTextLiterals(parsed.patient),
    }
  } finally {
    clearTimeout(timeoutId)
  }
}

/** Load a read-only AI context from the bundled trial patient without
 * replacing or reading the patient currently open in the workspace. */
export async function loadDemoExampleContext(): Promise<DemoExampleContext> {
  if (cachedContext) return cachedContext
  if (!pendingContext) {
    pendingContext = fetchDemoExampleContext()
      .then((context) => {
        cachedContext = context
        return context
      })
      .finally(() => {
        pendingContext = null
      })
  }
  return pendingContext
}
