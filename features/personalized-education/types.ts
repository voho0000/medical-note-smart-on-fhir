export interface EducationCoding {
  system?: string
  code?: string
  display?: string
}

export interface EducationObservation {
  id?: string
  codings: EducationCoding[]
  value?: number
  unit?: string
  date?: string
  status?: string
}

export interface EducationMedication {
  id: string
  codings: EducationCoding[]
  status?: string
  authoredOn?: string
  source: '處方紀錄' | '用藥陳述'
}

export interface PatientEducationContext {
  patientKey: string
  age: number | null
  diagnosisCodings: EducationCoding[]
  observations: EducationObservation[]
  medications: EducationMedication[]
}

export interface EducationSource {
  id: string
  label: string
  url: string
}

export interface EducationFact {
  id: string
  label: string
  value: string
  detail: string
  tone?: 'default' | 'attention'
}

export interface EducationSection {
  id: string
  eyebrow: string
  title: string
  summary: string
  explanation: string[]
  actionTitle: string
  action: string
  sourceIds: string[]
  tone?: 'default' | 'attention' | 'medication'
}

export interface EducationActionChoice {
  id: string
  label: string
  detail: string
}

export interface EducationLesson {
  id: string
  title: string
  takeaway: string
  detail: string
  action: string
  sourceIds: string[]
}

export interface EducationLessonGroup {
  id: string
  title: string
  description: string
  lessons: EducationLesson[]
}

export interface EducationPlan {
  packId: string
  title: string
  intro: string
  eligibilityEvidence: string[]
  facts: EducationFact[]
  sections: EducationSection[]
  actionChoices: EducationActionChoice[]
  lessonGroups: EducationLessonGroup[]
  sources: Record<string, EducationSource>
}

export interface DiseaseEducationPack {
  id: string
  disease: string
  version: string
  isEligible: (context: PatientEducationContext) => boolean
  buildPlan: (context: PatientEducationContext) => EducationPlan
}
