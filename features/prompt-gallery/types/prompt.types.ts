/**
 * Prompt Gallery Types
 * Unified data structure for both Chat prompts and Clinical Insights
 */

export type PromptType = 'chat' | 'insight'

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
  types: PromptType[]  // Changed from single type to array
  category: PromptCategory
  specialty: PromptSpecialty[]
  tags: string[]
  
  // Metadata
  createdAt: Date
  updatedAt: Date
  
  // Author information
  authorId?: string
  isAnonymous?: boolean
  authorName?: string
  usageCount?: number
}

export interface PromptGalleryFilter {
  type?: PromptType
  category?: PromptCategory
  specialty?: PromptSpecialty
  searchQuery?: string
  tags?: string[]
}

export interface PromptGallerySort {
  field: 'createdAt' | 'updatedAt' | 'title' | 'usageCount'
  direction: 'asc' | 'desc'
}
