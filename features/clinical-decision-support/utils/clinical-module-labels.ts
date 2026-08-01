import type { CdssLocale } from '../types'

interface ClinicalModuleLabel {
  zh: string
  en: string
}

export const CLINICAL_MODULE_LABELS: Readonly<Record<string, ClinicalModuleLabel>> = {
  'confirm-diabetes-diagnosis': { zh: '糖尿病診斷確認', en: 'Diabetes diagnosis confirmation' },
  'complete-kidney-risk': { zh: '糖尿病腎臟風險', en: 'Diabetes kidney risk' },
  'review-egfr-trajectory': { zh: '腎功能趨勢', en: 'Kidney function trend' },
  'sglt2-concordance': { zh: 'SGLT2 用藥一致性', en: 'SGLT2 treatment concordance' },
  'glycemic-safety-older-adult': { zh: '高齡血糖安全', en: 'Older-adult glycemic safety' },
  'blood-pressure-review': { zh: '糖尿病血壓管理', en: 'Diabetes blood pressure management' },
  'kidney-medication-strategy': { zh: '腎臟保護用藥', en: 'Kidney-protective medication' },
  'ascvd-lipid-strategy': { zh: 'ASCVD 血脂治療', en: 'ASCVD lipid treatment' },
  'complication-screening': { zh: '糖尿病併發症篩檢', en: 'Diabetes complication screening' },
  'older-adult-safety': { zh: '高齡整體安全', en: 'Older-adult safety' },
  'dcsi-complication-burden': { zh: '糖尿病併發症負擔（DCSI）', en: 'Diabetes complication burden (DCSI)' },
  'immunization-review': { zh: '疫苗接種', en: 'Immunization' },

  'ckd-classification': { zh: 'CKD 分期', en: 'CKD classification' },
  'ckd-monitoring': { zh: '腎功能趨勢', en: 'Kidney function trend' },
  'ckd-kidney-failure-risk': { zh: '腎衰竭風險（KFRE）', en: 'Kidney failure risk (KFRE)' },
  'ckd-blood-pressure-volume': { zh: '血壓與體液狀態', en: 'Blood pressure and volume status' },
  'ckd-rasi-strategy': { zh: 'ACEI／ARB 腎臟保護', en: 'ACEI/ARB kidney protection' },
  'ckd-sglt2-strategy': { zh: 'SGLT2 心腎保護', en: 'SGLT2 cardiorenal protection' },
  'ckd-finerenone-strategy': { zh: 'Finerenone 腎臟保護', en: 'Finerenone kidney protection' },
  'ckd-cardiovascular-risk': { zh: 'Statin 心血管保護', en: 'Statin cardiovascular protection' },
  'ckd-medication-safety': { zh: '腎毒性與腎功能劑量', en: 'Nephrotoxicity and kidney dosing' },
  'ckd-anemia-monitoring': { zh: '貧血監測', en: 'Anemia monitoring' },
  'ckd-potassium-acidosis': { zh: '血鉀與酸鹼', en: 'Potassium and acid-base status' },
  'ckd-mbd-monitoring': { zh: 'CKD-MBD 監測', en: 'CKD-MBD monitoring' },
  'ckd-nutrition': { zh: 'CKD 營養', en: 'CKD nutrition' },
  'ckd-referral-care': { zh: '腎臟專科轉介', en: 'Nephrology referral' },

  'ckd-anemia-detection-monitoring': { zh: 'CKD 貧血偵測與監測', en: 'CKD anemia detection and monitoring' },
  'ckd-anemia-initial-evaluation': { zh: 'CKD 貧血初始評估', en: 'Initial CKD anemia evaluation' },
  'ckd-anemia-iron-pathway': { zh: 'CKD 貧血鐵狀態與補鐵', en: 'CKD anemia iron pathway' },
  'ckd-anemia-expanded-evaluation-esa-safety': { zh: 'CKD 貧血進階評估與 ESA 安全', en: 'Expanded CKD anemia and ESA safety' },

  'hypertension-severe-safety': { zh: '嚴重高血壓安全', en: 'Severe hypertension safety' },
  'hypertension-measurement': { zh: '血壓量測品質', en: 'Blood pressure measurement quality' },
  'hypertension-control-target': { zh: '血壓控制目標', en: 'Blood pressure target' },
  'hypertension-treatment-strategy': { zh: '降壓治療策略', en: 'Antihypertensive treatment strategy' },
  'hypertension-baseline-evaluation': { zh: '高血壓基礎評估', en: 'Hypertension baseline evaluation' },

  'dyslipidemia-severe-triglycerides': { zh: '嚴重高三酸甘油脂', en: 'Severe hypertriglyceridemia' },
  'dyslipidemia-severe-ldl': { zh: '嚴重高 LDL-C', en: 'Severe LDL-C elevation' },
  'dyslipidemia-risk-and-target': { zh: '血脂風險與目標', en: 'Lipid risk and target' },
  'dyslipidemia-lipid-lowering-therapy': { zh: '降脂治療', en: 'Lipid-lowering treatment' },
  'dyslipidemia-monitoring-and-markers': { zh: '血脂追蹤', en: 'Lipid monitoring' },

  'heart-failure-phenotype': { zh: '心衰竭表型', en: 'Heart failure phenotype' },
  'heart-failure-hfref-gdmt': { zh: 'HFrEF 指引治療', en: 'HFrEF guideline-directed therapy' },
  'heart-failure-mra-safety': { zh: 'MRA 安全', en: 'MRA safety' },
  'heart-failure-medication-safety': { zh: '心衰竭用藥安全', en: 'Heart failure medication safety' },
  'heart-failure-monitoring': { zh: '心衰竭追蹤', en: 'Heart failure monitoring' },

  'cirrhosis-stage-referral': { zh: '肝硬化分期與轉介', en: 'Cirrhosis staging and referral' },
  'cirrhosis-hcc-surveillance': { zh: '肝癌監測', en: 'HCC surveillance' },
  'cirrhosis-portal-hypertension': { zh: '門脈高壓', en: 'Portal hypertension' },
  'cirrhosis-ascites-kidney-safety': { zh: '腹水與腎臟安全', en: 'Ascites and kidney safety' },
  'cirrhosis-hepatic-encephalopathy': { zh: '肝性腦病', en: 'Hepatic encephalopathy' },
  'cirrhosis-severity-monitoring': { zh: '肝硬化嚴重度', en: 'Cirrhosis severity' },
  'cirrhosis-nutrition-prevention': { zh: '肝硬化營養', en: 'Cirrhosis nutrition' },

  'af-documented-cha2ds2-vasc': { zh: '中風風險（CHA₂DS₂-VASc）', en: 'Stroke risk (CHA₂DS₂-VASc)' },
  'af-anticoagulation-concordance': { zh: '抗凝治療一致性', en: 'Anticoagulation concordance' },
  'af-anticoagulant-selection-safety': { zh: '抗凝藥選擇與安全', en: 'Anticoagulant selection and safety' },
  'af-bleeding-risk-data-gaps': { zh: '出血風險資料', en: 'Bleeding-risk data' },

  'aki-creatinine-detection': { zh: 'AKI 偵測與分期', en: 'AKI detection and staging' },
  'aki-follow-up-closure': { zh: 'AKI 追蹤閉環', en: 'AKI follow-up closure' },
  'aki-medication-review': { zh: 'AKI 用藥檢視', en: 'AKI medication review' },
  'aki-kdigo-creatinine-windows': { zh: 'KDIGO 肌酸酐時間窗', en: 'KDIGO creatinine windows' },

  'renal-safety-potassium-triage': { zh: '高血鉀分流', en: 'Hyperkalemia triage' },
  'renal-safety-kidney-deterioration': { zh: '腎功能惡化', en: 'Kidney function deterioration' },
  'renal-safety-medication-reconciliation': { zh: '腎臟用藥整合', en: 'Kidney medication reconciliation' },
}

export function clinicalModuleLabel(
  id: string,
  locale: CdssLocale,
  fallback: string,
): string {
  const label = CLINICAL_MODULE_LABELS[id]
  if (!label) return fallback
  return locale === 'en' ? label.en : label.zh
}
