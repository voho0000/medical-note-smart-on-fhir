// FHIR Status and Category Translations (EN -> ZH)

export const STATUS_TRANSLATIONS: Record<string, string> = {
  // Common statuses
  'active': '進行中',
  'completed': '已完成',
  'entered-in-error': '錯誤輸入',
  'stopped': '已停止',
  'on-hold': '暫停',
  'cancelled': '已取消',
  'draft': '草稿',
  'final': '最終結果',
  'amended': '已修改',
  'corrected': '已更正',
  'preliminary': '初步結果',
  'registered': '已登記',
  'unknown': '未知',
  'preparation': '準備中',
  'in-progress': '進行中',
  'not-done': '未完成',
  'suspended': '暫停',
  'aborted': '中止',
}

export const CATEGORY_TRANSLATIONS: Record<string, string> = {
  // Lab categories
  'laboratory': '實驗室檢驗',
  'vital-signs': '生命徵象',
  'imaging': '影像檢查',
  'procedure': '處置',
  'survey': '問卷調查',
  'exam': '體格檢查',
  'therapy': '治療',
  'social-history': '社會史',
  'activity': '活動',
  
  // Procedure categories
  'surgical': '手術',
  'diagnostic': '診斷性',
  'therapeutic': '治療性',
  'counseling': '諮詢',
  'education': '衛教',
  
  // Lab test categories
  'chemistry': '生化檢驗',
  'hematology': '血液學',
  'microbiology': '微生物學',
  'pathology': '病理學',
  'radiology': '放射科',
  'cardiology': '心臟科',
  'genetics': '遺傳學',
  'toxicology': '毒物學',
}

/**
 * Translate FHIR status to Chinese
 */
export function translateStatus(status: string | undefined): string {
  if (!status) return '—'
  const normalized = status.toLowerCase().trim()
  return STATUS_TRANSLATIONS[normalized] || status
}

/**
 * Translate FHIR category to Chinese
 */
export function translateCategory(category: string | undefined): string {
  if (!category) return '—'
  const normalized = category.toLowerCase().trim()
  return CATEGORY_TRANSLATIONS[normalized] || category
}

/**
 * Translate multiple categories (comma-separated)
 */
export function translateCategories(categories: string | undefined): string {
  if (!categories || categories === '—') return '—'
  
  return categories
    .split(',')
    .map(cat => translateCategory(cat.trim()))
    .join('、')
}
