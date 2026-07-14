/**
 * Prompt Gallery Types
 * Unified data structure for Chat templates and custom Summary modules.
 */

export type PromptType = 'chat' | 'summary'

/**
 * The original gallery stored custom-summary templates as `insight` records.
 * Keep the compatibility rule at the data boundary so the retired product
 * term never leaks back into components or newly written Firestore records.
 *
 * The seeded citizen prompts predate custom modules in Medical Summary. They
 * are all self-contained, record-grounded outputs, so they can safely serve
 * both as chat shortcuts and as reusable summary modules. Adding `summary`
 * here makes existing seeded documents upgrade without requiring a production
 * Firestore migration before the refreshed gallery can render correctly.
 */
const BUILT_IN_SUMMARY_PROMPT_IDS = new Set([
  'patient-explain-labs',
  'patient-admission-for-family',
  'patient-medication-info',
  'patient-which-specialty',
  'patient-questions-for-doctor',
  'patient-lifestyle-diet',
  'patient-warning-signs',
  'patient-self-care-monitoring',
  'medical-discharge',
])

export function normalizePromptTypes(promptId: string, rawTypes: unknown): PromptType[] {
  const normalized: PromptType[] = []
  const add = (type: PromptType) => {
    if (!normalized.includes(type)) normalized.push(type)
  }

  if (Array.isArray(rawTypes)) {
    for (const type of rawTypes) {
      if (type === 'chat') add('chat')
      if (type === 'summary' || type === 'insight') add('summary')
    }
  }

  if (BUILT_IN_SUMMARY_PROMPT_IDS.has(promptId)) add('summary')
  if (normalized.length === 0) add('chat')
  return normalized
}

export type PromptAudience = 'medical' | 'patient'

export type PromptCategory = 
  | 'soap'           // SOAP notes
  | 'admission'      // Admission notes
  | 'discharge'      // Discharge summaries
  | 'safety'         // Safety alerts
  | 'summary'        // Clinical summaries
  | 'progress'       // Progress notes
  | 'consult'        // Consultation notes
  | 'procedure'      // Procedure notes
  | 'other'          // Other categories

export type PromptSpecialty = 
  | 'general'        // 一般科
  | 'internal'       // 內科
  | 'surgery'        // 外科
  | 'emergency'      // 急診
  | 'pediatrics'     // 小兒科
  | 'obstetrics'     // 婦產科
  | 'psychiatry'     // 精神科
  | 'neurology'      // 神經科
  | 'rehabilitation' // 復健科
  | 'anesthesiology' // 麻醉科
  | 'ophthalmology'  // 眼科
  | 'dermatology'    // 皮膚科
  | 'urology'        // 泌尿科
  | 'orthopedics'    // 骨科
  | 'ent'            // 耳鼻喉科
  | 'radiology'      // 放射診斷科
  | 'radiation_oncology' // 放射腫瘤科
  | 'pathology'      // 病理科
  | 'nuclear_medicine' // 核子醫學科
  | 'plastic_surgery' // 整形外科
  | 'family_medicine' // 家庭醫學科
  | 'other'          // 其他

export interface SharedPrompt {
  id: string
  title: string
  description?: string
  prompt: string
  
  // Classification
  types: PromptType[]
  category: PromptCategory
  specialty: PromptSpecialty[]
  audience: PromptAudience[]  // Audiences this prompt is suitable for. Empty array treated as ['medical'] for backward compatibility.
  tags: string[]
  
  // Metadata
  createdAt: Date
  updatedAt: Date
  
  // Optional: For future community features
  authorId?: string
  authorName?: string
  isAnonymous?: boolean
  usageCount?: number
}

export interface PromptGalleryFilter {
  type?: PromptType
  category?: PromptCategory
  specialty?: PromptSpecialty
  audience?: PromptAudience
  searchQuery?: string
  tags?: string[]
}

export interface PromptGallerySort {
  field: 'createdAt' | 'updatedAt' | 'title' | 'usageCount'
  direction: 'asc' | 'desc'
}
