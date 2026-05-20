// ICD-10 code lookup utility
// Resolves ICD-10 codes (e.g., "C50.912") to human-readable descriptions.
// Lookup order: bundle Condition resources → built-in common Taiwan dictionary → undefined

export interface IcdCode {
  code: string
  description?: string
}

/**
 * Parse a comma/semicolon separated string of ICD codes into individual codes.
 * Example: "C50.912,N95.1,N73.9" → ["C50.912", "N95.1", "N73.9"]
 */
export function parseIcdCodes(text: string | undefined | null): string[] {
  if (!text) return []
  return text
    .split(/[,;、]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * Build a lookup dictionary from FHIR Condition resources.
 * Maps both full code (C50.912) and prefix (C50) → display text.
 *
 * Bridge contract: Condition.code typically has both
 *   - coding[].display  (English from the ICD code system)
 *   - text              (中文 description)
 *
 * `locale` decides which one wins when both are present:
 *   'en' → English coding[].display first
 *   else → 中文 text first
 *
 * Non-UI callers (AI context, clinical-insights) keep the prior English-
 * first behaviour by leaving the locale unspecified.
 */
export function buildIcdDictionary(
  conditions: any[],
  locale: string = 'en',
): Map<string, string> {
  const dict = new Map<string, string>()
  if (!Array.isArray(conditions)) return dict
  const preferText = locale !== 'en'
  for (const c of conditions) {
    const codings = c?.code?.coding ?? []
    const text = c?.code?.text
    for (const coding of codings) {
      const code = coding?.code
      const display = coding?.display
      const picked = preferText ? (text || display) : (display || text)
      if (code && picked) dict.set(code, picked)
    }
  }
  return dict
}

/**
 * Built-in fallback dictionary for common Taiwan outpatient ICD-10 codes.
 * Add codes here as needed. Lookup is by prefix when a full code isn't found.
 */
const BUILTIN_ICD: Record<string, string> = {
  // Neoplasms
  'C50': '乳房惡性腫瘤 (Malignant neoplasm of breast)',
  'C16': '胃惡性腫瘤 (Stomach cancer)',
  'C18': '結腸惡性腫瘤 (Colon cancer)',
  'C20': '直腸惡性腫瘤 (Rectal cancer)',
  'C22': '肝惡性腫瘤 (Liver cancer)',
  'C25': '胰臟惡性腫瘤 (Pancreatic cancer)',
  'C34': '肺及支氣管惡性腫瘤 (Lung cancer)',
  'C53': '子宮頸惡性腫瘤 (Cervical cancer)',
  'C54': '子宮體惡性腫瘤 (Uterine cancer)',
  'C56': '卵巢惡性腫瘤 (Ovarian cancer)',
  'C61': '攝護腺惡性腫瘤 (Prostate cancer)',
  'C73': '甲狀腺惡性腫瘤 (Thyroid cancer)',

  // Cardiovascular
  'I10': '原發性高血壓 (Essential hypertension)',
  'I11': '高血壓性心臟病 (Hypertensive heart disease)',
  'I20': '心絞痛 (Angina pectoris)',
  'I21': '急性心肌梗塞 (Acute myocardial infarction)',
  'I25': '慢性缺血性心臟病 (Chronic ischemic heart disease)',
  'I48': '心房顫動 (Atrial fibrillation)',
  'I50': '心臟衰竭 (Heart failure)',
  'I63': '腦梗塞 (Cerebral infarction)',

  // Endocrine
  'E11': '第二型糖尿病 (Type 2 diabetes mellitus)',
  'E10': '第一型糖尿病 (Type 1 diabetes mellitus)',
  'E78': '血脂異常 (Disorders of lipoprotein metabolism)',
  'E03': '甲狀腺機能低下 (Hypothyroidism)',
  'E05': '甲狀腺機能亢進 (Hyperthyroidism)',

  // Respiratory
  'J06': '上呼吸道感染 (Acute upper respiratory infections)',
  'J18': '肺炎 (Pneumonia)',
  'J20': '急性支氣管炎 (Acute bronchitis)',
  'J44': '慢性阻塞性肺病 (COPD)',
  'J45': '氣喘 (Asthma)',

  // Digestive
  'K21': '胃食道逆流 (GERD)',
  'K29': '胃炎 (Gastritis)',
  'K70': '酒精性肝病 (Alcoholic liver disease)',
  'K74': '肝硬化 (Cirrhosis)',
  'K76': '肝病 (Other diseases of liver)',
  'K80': '膽結石 (Cholelithiasis)',

  // Genitourinary
  'N18': '慢性腎臟病 (Chronic kidney disease)',
  'N39': '泌尿道感染 (UTI)',
  'N40': '攝護腺肥大 (Prostatic hyperplasia)',
  'N63': '乳房腫塊 (Lump in breast)',
  'N73': '骨盆腔發炎 (Pelvic inflammatory disease)',
  'N92': '經期過多 (Excessive menstruation)',
  'N95': '更年期及女性更年期狀態 (Menopausal state)',

  // Mental/Neurological
  'F32': '憂鬱症 (Depressive episode)',
  'F33': '反覆性憂鬱症 (Recurrent depressive disorder)',
  'F41': '焦慮症 (Anxiety disorders)',
  'G40': '癲癇 (Epilepsy)',
  'G47': '睡眠障礙 (Sleep disorders)',

  // Musculoskeletal
  'M16': '髖關節炎 (Coxarthrosis)',
  'M17': '膝關節炎 (Gonarthrosis)',
  'M19': '其他關節炎 (Other arthrosis)',
  'M54': '背痛 (Dorsalgia)',
  'M81': '骨質疏鬆 (Osteoporosis)',

  // Aftercare / general
  'Z00': '一般健康檢查 (General examination)',
  'Z51': '其他術後照護 (Other aftercare)',
  'Z08': '惡性腫瘤後續追蹤 (Follow-up after cancer treatment)',
  'Z09': '其他疾病後續追蹤 (Follow-up after other treatment)',
}

/**
 * Look up an ICD-10 code description.
 * Tries: exact match in dict → prefix match in dict → built-in dict → undefined.
 */
export function lookupIcd(code: string, dict?: Map<string, string>): string | undefined {
  if (!code) return undefined
  // Try exact match
  if (dict?.has(code)) return dict.get(code)
  if (BUILTIN_ICD[code]) return BUILTIN_ICD[code]
  // Prefix match (e.g., "C50.912" → "C50")
  const prefix = code.split('.')[0]
  if (prefix !== code) {
    if (dict?.has(prefix)) return dict.get(prefix)
    if (BUILTIN_ICD[prefix]) return BUILTIN_ICD[prefix]
  }
  return undefined
}

/**
 * Convenience: parse + lookup in one call.
 */
export function resolveIcdCodes(
  text: string | undefined | null,
  dict?: Map<string, string>
): IcdCode[] {
  return parseIcdCodes(text).map((code) => ({
    code,
    description: lookupIcd(code, dict),
  }))
}
