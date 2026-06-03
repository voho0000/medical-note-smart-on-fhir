// Audience/language-aware English display names for NHI medical-order codes
// (健保醫令碼) and a handful of HIS-local order codes that the bridge only
// labels in Chinese.
//
// WHY this exists
// ---------------
// A DiagnosticReport's display name comes from `code.text`. For panels,
// cultures, serology and imaging the bridge fills `code.text` with the official
// NHI 醫令中文名 — and the source data carries NO English at all (verified
// against the imported bundle: zero reports have an English `coding[].display`
// when `code.text` is Chinese). For common single analytes the bridge DOES emit
// an English short code in `code.text`, but inconsistently — the same order code
// 08003C appears as both "Hb" and "血色素檢查" across reports.
//
// Keying by the stable NHI/HIS order code normalises that inconsistency and lets
// us show clinical English in medical audience (and English UI) while keeping the
// bridge's formal Chinese name for patient + zh-TW.
//
// DISPLAY ONLY. Sort / search / AI-prompt / grouping keep using the canonical
// analyte keys and the bridge's raw `code.text` — see
// memory/feedback_display_vs_canonical_separation.md. Adding a code here changes
// only the rendered report title, never how reports are grouped or matched.

import type { AudienceMode, DisplayLang } from './lab-normalize'

export const NHI_ORDER_CODE_TO_EN: Record<string, string> = {
  // ── Urine / stool ──────────────────────────────────────────────
  '06012C': 'Urinalysis, routine',
  '06013C': 'Urinalysis, biochemistry',
  '07001C': 'Fecal occult blood, chemical',
  '09134C': 'Fecal occult blood, immunochemical (FIT)',

  // ── Hematology / coagulation ───────────────────────────────────
  '08003C': 'Hemoglobin (Hb)',
  '08004C': 'Hematocrit (Hct)',
  '08008C': 'Reticulocyte count',
  '08010C': 'Eosinophil count',
  '08011C': 'Complete blood count (CBC)',
  '08013C': 'WBC differential count',
  '08026C': 'Prothrombin time (PT)',
  '08036C': 'Activated partial thromboplastin time (aPTT)',
  '08075C': 'Osmolality, serum',
  '08079B': 'D-dimer',

  // ── Chemistry ──────────────────────────────────────────────────
  '09001C': 'Total cholesterol',
  '09002C': 'Blood urea nitrogen (BUN)',
  '09004C': 'Triglycerides',
  '09005C': 'Glucose, fasting',
  '09140C': 'Glucose, postprandial',
  '09011C': 'Calcium',
  '09012C': 'Phosphorus',
  '09013C': 'Uric acid',
  '09015C': 'Creatinine, serum',
  '09016C': 'Creatinine, urine',
  '09021C': 'Sodium',
  '09022C': 'Potassium',
  '09024C': 'Carbon dioxide (CO2)',
  '09025C': 'AST (GOT)',
  '09026C': 'ALT (GPT)',
  '09027C': 'Alkaline phosphatase (ALP)',
  '09031C': 'Gamma-GT (GGT)',
  '09035C': 'Total iron-binding capacity (TIBC)',
  '09037C': 'Ammonia',
  '09038C': 'Albumin',
  '09040C': 'Total protein',
  '09041B': 'Blood gas analysis',
  '09043C': 'HDL cholesterol',
  '09046B': 'Magnesium',
  '09059B': 'Lactate',
  '09064C': 'Lipase',
  '09065B': 'Protein electrophoresis',
  '09106C': 'Free thyroxine (Free T4)',

  // ── Immunology / serology / tumor markers ──────────────────────
  '11001C': 'ABO blood typing',
  '11003C': 'Rh(D) typing',
  '11004C': 'Irregular antibody screen',
  '12001C': 'Syphilis test (VDRL/RPR)',
  '12007C': 'Alpha-fetoprotein (AFP)',
  '12015C': 'C-reactive protein (CRP)',
  '12021C': 'Carcinoembryonic antigen (CEA)',
  '12025B': 'Immunoglobulin G (IgG)',
  '12027B': 'Immunoglobulin A (IgA)',
  '12029B': 'Immunoglobulin M (IgM)',
  '12031C': 'Immunoglobulin E (IgE)',
  '12053C': 'Antinuclear antibody (ANA)',
  '12056B': 'Anti-mitochondrial antibody (AMA)',
  '12069B': 'Cryptococcal antigen',
  '12079C': 'CA 19-9',
  '12103B': 'Immunoelectrophoresis',
  '12111C': 'Microalbumin',
  '12116C': 'Ferritin',
  '12160B': 'Immunoglobulin kappa/lambda light chains',
  '12184C': 'Nucleic acid amplification (DNA), quantitative',
  '12192C': 'Procalcitonin (PCT)',
  '12193C': 'B-type natriuretic peptide (BNP)',
  '30022C': 'Specific allergen IgE',

  // ── Microbiology ───────────────────────────────────────────────
  '13007C': 'Bacterial culture & identification',
  '13013C': 'Acid-fast bacilli identification',
  '13016B': 'Blood culture',
  '13025C': 'Acid-fast smear (concentrated)',
  '13026C': 'Acid-fast bacilli (AFB) culture',

  // ── Virology / hepatitis / antigens ────────────────────────────
  '14004B': 'Cytomegalovirus antibody (CMV)',
  '14032C': 'Hepatitis B surface antigen (HBsAg)',
  '14048B': 'Cytomegalovirus antigen/antibody (CMV)',
  '14051C': 'Hepatitis C virus antibody (anti-HCV)',
  '14065C': 'Influenza A virus antigen',
  '14066C': 'Influenza B virus antigen',
  '14084C': 'SARS-CoV-2 antigen',

  // ── Imaging / procedures (HIS-local-report) ────────────────────
  '18001C': 'Electrocardiogram (ECG)',
  '18005C': 'Echocardiography',
  '18007C': 'Color Doppler echocardiography',
  '18019C': 'Holter ECG monitoring',
  '19005C': 'Ultrasonography, other',
  '19009C': 'Abdominal ultrasonography, follow-up',
  '20019B': 'Sensory nerve conduction velocity',
  '20023B': 'F-wave study',
  '21010C': 'Bladder ultrasound (post-void residual)',
  '25004C': 'Surgical pathology, level IV',
  '28016C': 'Upper GI panendoscopy',
  '28017C': 'Colonoscopy',
  '32001C': 'Chest X-ray',
  '32006C': 'KUB X-ray',
  '32009C': 'Skull X-ray',
  '32011C': 'Spine X-ray',
  '32017C': 'Lower-limb bone/joint X-ray',
  '32018C': 'Lower-limb bone/joint X-ray',
  '32022C': 'Pelvis & hip joint X-ray',
  '33070B': 'CT, without contrast',
  '33072B': 'CT, with/without contrast',

  // ── HIS-local-lab (already bilingual at source) ────────────────
  '代謝症候群篩檢 (Metabolic Syndrome Screening)': 'Metabolic Syndrome Screening',
}

// Official 健保醫令中文名 keyed by NHI order code. These are the formal names
// the patient sees in their 健康存摺 (National Health Insurance personal health
// record). For patient + zh-TW we show THIS instead of our short canonical lay
// name so the report row matches 健康存摺 exactly (e.g. 09025C →
// 血清麩胺酸苯醋酸轉氨基脢, not 麩草轉胺脢).
//
// SOURCE OF TRUTH: harvested verbatim from the bridge's own DiagnosticReport
// `code.text` — the same NHI 醫令名 field 健康存摺 reads. The bridge emits the
// same order code inconsistently (09025C arrives as both "SGOT (AST)" and
// "血清麩胺酸苯醋酸轉氨基脢" across labs); keying by the stable order code
// normalises that so every row shows the one official name. NOT hand-authored,
// so no fabrication risk. Strings preserved exactly (incl. full/half-width
// parens, em/en dashes, and the source's double spaces) for 完全一致 fidelity.
export const NHI_ORDER_CODE_TO_ZH: Record<string, string> = {
  // ── Urine / stool ──────────────────────────────────────────────
  '06012C': '尿一般檢查(包括蛋白、糖、尿膽元、膽紅素、尿沈渣、比重、顏色、混濁度、白血球酯脢、潛血、酸鹼度及酮體)',
  '06013C': '尿生化檢查(包括蛋白、糖、尿膽元、膽紅素、比重、顏色、混濁度、酸鹼度、白血球酯脢及酮體)',
  '07001C': '糞便潛血化學法',
  '09134C': '糞便潛血免疫分析',

  // ── Hematology / coagulation ───────────────────────────────────
  '08003C': '血色素檢查',
  '08004C': '血球比容值測定',
  '08008C': '網狀紅血球計數',
  '08010C': '嗜酸性白血球計算',
  '08011C': '全套血液檢查I(八項)',
  '08013C': '白血球分類計數',
  '08026C': '凝血酶原時間 (一段式)',
  '08036C': '部分凝血活酶時間',
  '08075C': '血液滲透壓',
  '08079B': 'D雙合體試驗',

  // ── Chemistry ──────────────────────────────────────────────────
  '09001C': '總膽固醇',
  '09002C': '血中尿素氮',
  '09004C': '三酸甘油脂',
  '09005C': '血液及體液葡萄糖-空腹',
  '09140C': '血液及體液葡萄糖-餐後',
  '09011C': '鈣',
  '09012C': '磷',
  '09013C': '尿酸',
  '09015C': '肌酸酐、血',
  '09016C': '肌酐、尿',
  '09021C': '鈉',
  '09022C': '鉀',
  '09024C': '二氧化碳',
  '09025C': '血清麩胺酸苯醋酸轉氨基脢',
  '09026C': '血清麩胺酸丙酮酸轉氨基脢',
  '09027C': '鹼性磷酯酶',
  '09031C': '麩胺轉酸脢',
  '09035C': '總鐵結合能力',
  '09037C': '血氨',
  '09038C': '白蛋白',
  '09040C': '全蛋白',
  '09041B': '血液氣體分析',
  '09043C': '高密度脂蛋白-膽固醇',
  '09046B': '鎂',
  '09059B': '乳酸',
  '09064C': '解脂酶',
  '09065B': '蛋白電泳分析',
  '09106C': '游離甲狀腺素免疫分析',

  // ── Immunology / serology / tumor markers ──────────────────────
  '11001C': 'ABO血型測定檢驗',
  '11003C': 'RH(D)型檢驗',
  '11004C': '抗體反應 (不規則抗體)',
  '12001C': '梅毒試驗',
  '12007C': 'α-胎兒蛋白檢驗',
  '12015C': 'C反應性蛋白試驗 -  免疫比濁法',
  '12021C': '癌胚胎抗原檢驗',
  '12025B': '免疫球蛋白G—免疫比濁法',
  '12027B': '免疫球蛋白A—免疫比濁法',
  '12029B': '免疫球蛋白M—免疫比濁法',
  '12031C': '免疫球蛋白E',
  '12053C': '抗核抗體(間接免疫螢光法)',
  '12056B': '粒腺體抗體',
  '12069B': '隱球菌抗原',
  '12079C': 'CA–199腫瘤標記 (EIA/LIA法)',
  '12103B': '免疫電泳分析',
  '12111C': '微白蛋白 (免疫比濁法)',
  '12116C': '鐵蛋白',
  '12160B': '免疫球蛋白κ/λ',
  '12184C': '去氧核糖核酸類定量擴增試驗',
  '12192C': '前降鈣素原',
  '12193C': 'B型利納肽(B型利納利尿胜肽)',
  '30022C': '特異過敏原免疫檢驗',

  // ── Microbiology ───────────────────────────────────────────────
  '13007C': '細菌培養鑑定檢查(包括一般細菌、真菌、原蟲等為對象的培養鑑定,抗酸菌除外)',
  '13013C': '抗酸菌鑑定檢查',
  '13016B': '血液培養',
  '13025C': '抗酸性濃縮抹片染色檢查',
  '13026C': '抗酸菌培養(限同時使用固態培養基及具自動化偵測功能之液態培養系統)',

  // ── Virology / hepatitis / antigens ────────────────────────────
  '14004B': '巨大細胞病毒抗體  酵素免疫法',
  '14032C': 'B型肝炎表面抗原(定性)-EIA/LIA',
  '14048B': '巨細胞病毒核抗原抗體',
  '14051C': 'C型肝炎病毒抗體檢查',
  '14065C': '流行性感冒A型病毒抗原',
  '14066C': '流行性感冒B型病毒抗原',
  '14084C': '新型冠狀病毒抗原檢測',

  // ── Imaging / procedures (HIS-local-report) ────────────────────
  '18001C': '心電圖',
  '18005C': '超音波心臟圖(包括單面、雙面)',
  '18007C': '杜卜勒氏彩色心臟血流圖',
  '18019C': '攜帶式心電圖記錄檢查',
  '19005C': '其他超音波',
  '19009C': '腹部超音波，追蹤性',
  '20019B': '感覺神經傳導速度測定',
  '20023B': 'F波',
  '21010C': '膀胱超音波尿量測量',
  '25004C': '第四級外科病理',
  '28016C': '上消化道泛內視鏡檢查',
  '28017C': '大腸鏡檢查',
  '32001C': '胸腔檢查（包括各種角度部位之胸腔檢查）',
  '32006C': '腎臟、輸尿管、膀胱檢查',
  '32009C': '頭顱檢查（包括各種角度部位之頭顱檢查）',
  '32011C': '脊椎檢查（包括各種角度部位之頸椎、胸椎、腰椎、薦椎、尾骨及薦髂關節等之檢查）',
  '32017C': '下肢骨各處骨頭及關節檢查（包括各種角度與部位之檢查）',
  '32018C': '下肢骨各處骨頭及關節檢查（包括各種角度與部位之檢查）',
  '32022C': '骨盆及髖關節檢查（包括各種角度與部位之檢查）',
  '33070B': '電腦斷層造影  －  無造影劑',
  '33072B': '電腦斷層造影  －  有/無造影劑',
}

/**
 * Audience/language-aware display name for a NHI/HIS order code.
 *
 * Returns the curated English name when the audience is medical (always) or the
 * UI language is English. For patient + zh-TW, returns the official 健保醫令中文名
 * (matching 健康存摺) when known, else the supplied `fallback`. Unmapped codes
 * always return `fallback` so coverage gaps surface as the original Chinese
 * rather than silently disappearing.
 *
 * Pure function — no React context — so it is callable from any layer.
 */
export function getOrderNameDisplay(
  orderCode: string | undefined | null,
  fallback: string,
  audience: AudienceMode,
  language: DisplayLang,
): string {
  if (audience === 'patient' && language === 'zh-TW') {
    const zh = orderCode ? NHI_ORDER_CODE_TO_ZH[orderCode] : undefined
    return zh || fallback
  }
  const en = orderCode ? NHI_ORDER_CODE_TO_EN[orderCode] : undefined
  if (en) return en
  return fallback
}
