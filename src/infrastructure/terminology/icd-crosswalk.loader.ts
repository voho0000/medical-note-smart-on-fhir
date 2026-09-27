import type { IcdCrosswalk } from '@/src/core/utils/icd-code-reference.utils'

const CROSSWALK_PATH = '/terminology/icd10cm-to-icd9cm-gem-2018.json'

let pending: Promise<IcdCrosswalk> | null = null

/**
 * Loads the ICD-10-CM -> ICD-9-CM crosswalk (~360 KB gzip) on first use only.
 * A failed load is not cached, so a later generation can retry.
 */
export function loadIcdCrosswalk(): Promise<IcdCrosswalk> {
  if (!pending) {
    const base = process.env.NEXT_PUBLIC_BASE_PATH || ''
    pending = fetch(`${base}${CROSSWALK_PATH}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`Failed to load ICD crosswalk (${response.status})`)
        const data = await response.json() as Partial<IcdCrosswalk>
        if (!data.map || !data.names) throw new Error('Malformed ICD crosswalk')
        return { map: data.map, names: data.names }
      })
      .catch((error: unknown) => {
        pending = null
        throw error
      })
  }
  return pending
}
