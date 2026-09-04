// Shared template text storage used by both gallery publishing and private
// template persistence. Keep the Firebase implementation out of feature imports.
export {
  isTemplateTextReference,
  readTemplateText,
  removeTemplateText,
  splitTemplateText,
  writeTemplateText,
} from '@/src/infrastructure/firebase/template-text-storage'
export type { TemplateTextReference } from '@/src/infrastructure/firebase/template-text-storage'
