import type {
  CdssClinicalHandoff,
  CdssFact,
  CdssLocale,
  CdssPatientProfile,
  CdssRecommendation,
  ClinicalEvidence,
  ClinicalGuidelinePack,
  GuidelineReference,
} from '../types'

function text(locale: CdssLocale, zh: string, en: string): string {
  return locale === 'en' ? en : zh
}

function evidence(
  profile: CdssPatientProfile,
  locale: CdssLocale,
  factKey: string,
  labelZh: string,
  labelEn: string,
): ClinicalEvidence | undefined {
  const fact = profile.facts[factKey]
  if (!fact) return undefined
  return {
    label: text(locale, labelZh, labelEn),
    value: fact[locale === 'en' ? 'en' : 'zh'],
    factKeys: [factKey],
    sources: fact.sources,
  }
}

function compactEvidence(
  values: readonly (ClinicalEvidence | undefined)[],
): ClinicalEvidence[] {
  return values.filter((value): value is ClinicalEvidence => Boolean(value))
}

function kdigoReference(locale: CdssLocale): GuidelineReference {
  return {
    id: 'kdigo-aki-2012-definition-staging',
    title: 'KDIGO Clinical Practice Guideline for Acute Kidney Injury',
    publisher: 'Kidney Disease: Improving Global Outcomes (KDIGO)',
    version: '2012',
    url: 'https://kdigo.org/wp-content/uploads/2016/10/KDIGO-2012-AKI-Guideline-English.pdf',
    recommendationId: 'Chapter 2.1',
    locator: 'AKI definition and staging, Tables 1–2',
    summary: text(
      locale,
      '成人 AKI 的 creatinine 條件包括 48 小時內上升 ≥0.3 mg/dL，或 7 日內升至基準值 ≥1.5 倍；嚴重度依最高符合條件分為第 1–3 期。',
      'Creatinine criteria for adult AKI include a rise of at least 0.3 mg/dL within 48 hours or at least 1.5 times baseline within 7 days; severity is staged 1–3 by the highest criterion met.',
    ),
  }
}

function parkReference(locale: CdssLocale): GuidelineReference {
  return {
    id: 'park-aki-alert-2018',
    title: 'Impact of Electronic AKI Alerts With Automated Nephrologist Consultation',
    publisher: 'American Journal of Kidney Diseases',
    version: '2018;71(1):9–19',
    url: 'https://doi.org/10.1053/j.ajkd.2017.06.008',
    locator: 'Before-and-after quality-improvement study',
    summary: text(
      locale,
      '院內 AKI 警示結合少量點擊即可產生的腎臟科會診；研究觀察到較少漏追蹤、較多早期會診、較少重度 AKI 與較快恢復，但沒有死亡率改善。',
      'The inpatient AKI alert was linked to a nephrology consult generated in a few clicks. The study observed less missed follow-up, more early consultation, less severe AKI, and faster recovery, without a mortality benefit.',
    ),
  }
}

function kdigoThreeMonthReference(locale: CdssLocale): GuidelineReference {
  return {
    id: 'kdigo-aki-2012-three-month-follow-up',
    title: 'KDIGO Clinical Practice Guideline for Acute Kidney Injury',
    publisher: 'Kidney Disease: Improving Global Outcomes (KDIGO)',
    version: '2012',
    url: 'https://kdigo.org/wp-content/uploads/2016/10/KDIGO-2012-AKI-Guideline-English.pdf',
    recommendationId: 'Recommendation 2.3.4',
    locator: 'Chapter 2.3: evaluation and general management',
    summary: text(
      locale,
      'AKI 後 3 個月評估是否恢復、出現新的 CKD 或原有 CKD 惡化；後續依 CKD 或高風險路徑照護。',
      'Evaluate patients 3 months after AKI for resolution, new CKD, or worsening pre-existing CKD, then manage through the CKD or increased-risk pathway as appropriate.',
    ),
  }
}

function dayDifference(later?: string, earlier?: string): number | undefined {
  if (!later || !earlier) return undefined
  const laterTime = Date.parse(later)
  const earlierTime = Date.parse(earlier)
  if (!Number.isFinite(laterTime) || !Number.isFinite(earlierTime)) return undefined
  return Math.floor((laterTime - earlierTime) / 86_400_000)
}

function formatFact(fact: CdssFact | undefined, locale: CdssLocale): string {
  if (!fact) return text(locale, '健康存摺資料未提供', 'Not available in My Health Bank data')
  return fact[locale === 'en' ? 'en' : 'zh']
}

function buildDetection(
  profile: CdssPatientProfile,
  locale: CdssLocale,
): CdssRecommendation {
  const assessment = profile.akiAssessment
  const event = assessment?.event
  const current = event?.recency === 'current-window'

  if (!assessment || assessment.state === 'insufficient-data') {
    return {
      id: 'aki-creatinine-detection',
      domain: 'safety',
      priority: 'medium',
      status: 'needs-data',
      overviewEvidenceFactKey: 'serumCreatinine',
      title: text(
        locale,
        '目前不足以比對 AKI：需要至少兩筆有日期的血清 creatinine',
        'AKI comparison is not currently possible: at least two dated serum creatinine values are needed',
      ),
      recommendation: text(
        locale,
        '先查找完整院內病歷與近期血清 creatinine；健康存摺只有單筆或沒有可驗證的 LOINC／單位時，不推算 AKI。',
        'Retrieve the complete chart and recent serum creatinine first. AKI is not inferred when My Health Bank contains only one result or lacks a governed LOINC code or unit.',
      ),
      rationale: text(
        locale,
        'AKI 是短時間內相對於個人基準值的變化，不能只用一個絕對數值判定。',
        'AKI is a short-term change from the patient’s baseline and cannot be determined from one absolute value.',
      ),
      patientEvidence: compactEvidence([
        evidence(profile, locale, 'serumCreatinine', '最新 creatinine', 'Latest creatinine'),
      ]),
      missingData: [
        text(
          locale,
          '48 小時與 7 日視窗內可比較的血清 creatinine',
          'Comparable serum creatinine in the 48-hour and 7-day windows',
        ),
      ],
      nextActions: [
        text(
          locale,
          '核對院內檢驗系統；若病人目前有少尿、脫水、感染、低血壓或其他急性不適，直接依臨床狀況評估，不等待本系統。',
          'Check the institutional laboratory system. If the patient currently has oliguria, dehydration, infection, hypotension, or another acute concern, evaluate clinically without waiting for this system.',
        ),
      ],
      guidelineReferences: [kdigoReference(locale)],
      safetyBoundary: text(
        locale,
        '缺資料代表未知，不代表沒有 AKI。',
        'Missing data means unknown; it does not mean AKI is absent.',
      ),
    }
  }

  if (assessment.state === 'not-detected' || !event) {
    return {
      id: 'aki-creatinine-detection',
      domain: 'safety',
      priority: 'routine',
      status: 'no-action',
      overviewEvidenceFactKey: profile.facts.serumCreatinineTrend
        ? 'serumCreatinineTrend'
        : 'serumCreatinine',
      title: text(
        locale,
        '現有健康存摺資料未出現 creatinine 型 AKI 訊號',
        'No creatinine-defined AKI signal appears in the available My Health Bank data',
      ),
      recommendation: text(
        locale,
        '維持臨床監測；若病人有急性症狀或尿量下降，仍應查找更即時的院內資料。',
        'Continue clinical monitoring. If acute symptoms or reduced urine output are present, retrieve more timely institutional data.',
      ),
      rationale: text(
        locale,
        '系統已比對 48 小時絕對變化與 7 日相對變化，但健康存摺的時間性與完整性不足以排除 AKI。',
        'The system compared the 48-hour absolute change and 7-day relative change, but the timeliness and completeness of My Health Bank cannot exclude AKI.',
      ),
      patientEvidence: compactEvidence([
        evidence(profile, locale, 'serumCreatinineTrend', 'creatinine 趨勢', 'Creatinine trend'),
        evidence(profile, locale, 'serumCreatinine', '最新 creatinine', 'Latest creatinine'),
      ]),
      nextActions: [
        text(
          locale,
          '有新的 creatinine 匯入時重新運算；臨床疑慮高時以院內即時資料與尿量為準。',
          'Re-run when a new creatinine result is imported; use real-time institutional data and urine output when clinical concern is high.',
        ),
      ],
      guidelineReferences: [kdigoReference(locale)],
      safetyBoundary: text(
        locale,
        '本結果只表示「現有可比較資料未觸發」，不是 AKI 排除診斷。',
        'This result means only that the available comparable data did not trigger; it is not an exclusion diagnosis.',
      ),
    }
  }

  return {
    id: 'aki-creatinine-detection',
    domain: 'safety',
    priority: current ? 'high' : 'medium',
    status: current ? 'actionable' : 'review',
    overviewEvidenceFactKey: 'akiCreatinineSignal',
    title: current
      ? text(
          locale,
          `偵測到近期 creatinine 型 AKI 第 ${event.stage} 期訊號`,
          `Recent creatinine-defined AKI stage ${event.stage} signal detected`,
        )
      : text(
          locale,
          `健康存摺中有歷史 creatinine 型 AKI 第 ${event.stage} 期訊號`,
          `A historical creatinine-defined AKI stage ${event.stage} signal appears in My Health Bank`,
        ),
    recommendation: current
      ? text(
          locale,
          '立即核對院內原始檢驗、採檢時間、尿量、體液與血流動力狀態，再由臨床人員確認 AKI 與嚴重度。',
          'Immediately verify the institutional source results, collection times, urine output, volume status, and hemodynamics before a clinician confirms AKI and severity.',
        )
      : text(
          locale,
          '先確認這次歷史事件是否已在院內處理、是否曾惡化，以及後續腎功能是否已追蹤。',
          'Confirm whether this historical event was addressed, whether it progressed, and whether kidney function was followed afterward.',
        ),
    rationale: text(
      locale,
      '本系統依 KDIGO 2012 的 serum-creatinine 時間窗與分期規則產生訊號。',
      'This signal applies the KDIGO 2012 serum-creatinine time windows and staging rules.',
    ),
    patientEvidence: compactEvidence([
      evidence(profile, locale, 'akiCreatinineSignal', 'AKI 比對', 'AKI comparison'),
      evidence(profile, locale, 'serumCreatinineTrend', 'creatinine 趨勢', 'Creatinine trend'),
      evidence(profile, locale, 'eGFR', '最近 eGFR', 'Latest eGFR'),
      evidence(profile, locale, 'ckdDiagnosis', 'CKD 背景', 'CKD history'),
    ]),
    missingData: [
      text(locale, '尿量與體重', 'Urine output and body weight'),
      text(locale, '當下生命徵象、體液狀態與急性病因', 'Current vital signs, volume status, and acute cause'),
      text(locale, '院內透析／腎臟替代治療紀錄', 'Institutional dialysis/kidney replacement therapy record'),
    ],
    nextActions: current
      ? [
          text(
            locale,
            '同日完成臨床確認與 AKI 處置評估；若為第 2–3 期、少尿、電解質／酸鹼異常、肺水腫或診斷不明，依院內流程緊急處理並優先腎臟科評估。',
            'Complete same-day clinical confirmation and AKI management assessment. For stage 2–3, oliguria, electrolyte/acid-base complications, pulmonary edema, or unclear cause, follow urgent institutional pathways and prioritize nephrology review.',
          ),
        ]
      : [
          text(
            locale,
            '查找事件後 creatinine 與出院／門診紀錄，確認是否有完成追蹤。',
            'Retrieve post-event creatinine and discharge/outpatient records to confirm follow-up.',
          ),
        ],
    guidelineReferences: [kdigoReference(locale)],
    safetyBoundary: text(
      locale,
      '本訊號只使用 serum creatinine；不涵蓋尿量分期、透析、偽性 creatinine 變化或臨床病因，不能取代診斷。',
      'This signal uses serum creatinine only. It does not capture urine-output staging, dialysis, spurious creatinine changes, or clinical etiology and cannot replace diagnosis.',
    ),
  }
}

function buildFollowUp(
  profile: CdssPatientProfile,
  locale: CdssLocale,
): CdssRecommendation | undefined {
  const event = profile.akiAssessment?.event
  if (!event) return undefined
  const followUp = event.followUpReadings
  const latestFollowUp = followUp.at(-1)
  const current = event.recency === 'current-window'
  const hasFollowUp = Boolean(latestFollowUp)
  const eventAgeDays = dayDifference(profile.evaluatedAt, event.detectedAt)
  const hasThreeMonthAssessment = followUp.some((reading) => (
    (dayDifference(reading.observedAt, event.detectedAt) ?? 0) >= 75
  ))
  const threeMonthDue = eventAgeDays !== undefined && eventAgeDays >= 90
  const overdueThreeMonthAssessment = threeMonthDue && !hasThreeMonthAssessment
  const latestRatio = latestFollowUp
    ? latestFollowUp.valueMgDl / event.baseline.valueMgDl
    : undefined

  return {
    id: 'aki-follow-up-closure',
    domain: 'monitoring',
    priority: !hasFollowUp || overdueThreeMonthAssessment ? 'high' : 'medium',
    status: !hasFollowUp || overdueThreeMonthAssessment
      ? (current ? 'actionable' : 'review')
      : 'review',
    overviewEvidenceFactKey: 'serumCreatinineTrend',
    title: !hasFollowUp
      ? text(
          locale,
          'AKI 訊號後尚未看到 follow-up creatinine',
          'No follow-up creatinine appears after the AKI signal',
        )
      : overdueThreeMonthAssessment
        ? text(
            locale,
            '已有早期複驗，但未看到 AKI 後約 3 個月的腎功能評估',
            'Early repeat testing is visible, but no kidney assessment appears around 3 months after AKI',
          )
      : text(
          locale,
          `AKI 訊號後已有 ${followUp.length} 筆 creatinine${hasThreeMonthAssessment ? '，包含約 3 個月評估' : ''}；最新為基準值 ${latestRatio?.toFixed(2)} 倍`,
          `${followUp.length} creatinine result(s) follow the AKI signal${hasThreeMonthAssessment ? ', including an assessment around 3 months' : ''}; the latest is ${latestRatio?.toFixed(2)} times baseline`,
        ),
    recommendation: !hasFollowUp
      ? text(
          locale,
          '把補驗與結果回看指定給明確負責人，避免警示只有被看見、卻沒有完成追蹤。',
          'Assign repeat testing and result review to a named owner so the alert is not merely seen without follow-through.',
        )
      : overdueThreeMonthAssessment
        ? text(
            locale,
            '查找院內或跨院 3 個月評估；若確實未完成，安排目前的 creatinine／eGFR、尿白蛋白與 CKD 狀態評估。',
            'Retrieve institutional or cross-facility 3-month assessment. If it was not completed, arrange current creatinine/eGFR, urine albumin, and CKD-status assessment.',
          )
      : text(
          locale,
          '核對早期趨勢，並建立 AKI 後 3 個月的恢復／新發 CKD／既有 CKD 惡化評估；單靠比值不自動宣告恢復。',
          'Review the early trajectory and establish a 3-month assessment for recovery, new CKD, or worsening CKD. Do not declare recovery from the ratio alone.',
        ),
    rationale: text(
      locale,
      'Park 等人的主要流程指標之一就是避免 AKI 後沒有 follow-up creatinine 的「漏掉事件」。',
      'One of Park and colleagues’ primary process outcomes was avoiding an “overlooked event” with no follow-up creatinine.',
    ),
    patientEvidence: compactEvidence([
      evidence(profile, locale, 'serumCreatinineTrend', '完整 creatinine 趨勢', 'Full creatinine trend'),
    ]),
    missingData: [
      ...(!hasFollowUp
        ? [text(locale, 'AKI 訊號後的血清 creatinine', 'Serum creatinine after the AKI signal')]
        : []),
      ...(!hasThreeMonthAssessment
        ? [text(locale, 'AKI 後約 3 個月的 creatinine／eGFR、尿白蛋白與 CKD 評估', 'Creatinine/eGFR, urine albumin, and CKD assessment around 3 months after AKI')]
        : []),
    ],
    nextActions: [
      current
        ? text(
            locale,
            '依 AKI 分期、趨勢與臨床狀況決定複驗時點，並建立結果回看責任；本系統不替代院內醫囑。',
            'Set the repeat-testing interval from AKI stage, trajectory, and clinical status, and assign result ownership. This system does not replace institutional orders.',
          )
        : text(
            locale,
            '先查找當時院內或後續跨院檢驗；若確實缺少追蹤，再由臨床人員安排目前的腎功能評估。',
            'First retrieve institutional or cross-facility follow-up from that episode. If follow-up is truly absent, arrange a current kidney assessment clinically.',
          ),
    ],
    guidelineReferences: [
      parkReference(locale),
      kdigoReference(locale),
      kdigoThreeMonthReference(locale),
    ],
    safetyBoundary: text(
      locale,
      '健康存摺未顯示 follow-up 可能是資料延遲、未上傳或在自費／院內資料中，不等同真的沒有追蹤。',
      'Absent follow-up in My Health Bank may reflect delay, non-upload, self-pay care, or institutional-only data and does not prove that follow-up did not occur.',
    ),
  }
}

function buildMedicationReview(
  profile: CdssPatientProfile,
  locale: CdssLocale,
): CdssRecommendation | undefined {
  const event = profile.akiAssessment?.event
  if (!event) return undefined
  const hasNsaid = Boolean(profile.facts.currentNsaid)
  const hasPotentialNephrotoxin = Boolean(profile.facts.currentPotentialNephrotoxin)

  return {
    id: 'aki-medication-review',
    domain: 'medication',
    priority: hasNsaid || hasPotentialNephrotoxin ? 'high' : 'medium',
    status: 'review',
    overviewEvidenceFactKey: hasPotentialNephrotoxin
      ? 'currentPotentialNephrotoxin'
      : hasNsaid
        ? 'currentNsaid'
        : 'medicationListOverview',
    title: hasNsaid || hasPotentialNephrotoxin
      ? text(
          locale,
          'AKI 訊號同時辨識到可能的腎毒性藥物紀錄',
          'A potential nephrotoxic medication record appears with the AKI signal',
        )
      : text(
          locale,
          'AKI 訊號後需完成藥物與腎毒性暴露核對',
          'Medication and nephrotoxin reconciliation is needed after the AKI signal',
        ),
    recommendation: text(
      locale,
      '核對實際服用、處方日期、近期新藥、顯影劑與其他腎毒性暴露；是否暫停或調整由臨床人員依適應症、體液與腎功能決定。',
      'Reconcile actual use, prescription dates, newly started drugs, contrast, and other nephrotoxic exposures. A clinician should decide whether to hold or adjust therapy from indication, volume status, and kidney function.',
    ),
    rationale: text(
      locale,
      '健康存摺的處方／調劑紀錄不等於目前實際服用，且院內給藥與顯影劑可能不完整。',
      'My Health Bank prescribing/dispensing records do not prove current use, and inpatient administration and contrast exposure may be incomplete.',
    ),
    patientEvidence: compactEvidence([
      evidence(profile, locale, 'currentNsaid', '可能 NSAID', 'Possible NSAID'),
      evidence(profile, locale, 'currentPotentialNephrotoxin', '潛在腎毒性藥物', 'Potential nephrotoxin'),
      evidence(profile, locale, 'medicationListOverview', '可見用藥', 'Visible medications'),
    ]),
    missingData: [
      text(locale, '病人目前實際服藥與最後一劑時間', 'Actual current use and time of last dose'),
      text(locale, '近期顯影劑與院內給藥', 'Recent contrast and inpatient administrations'),
    ],
    nextActions: [
      text(
        locale,
        '由醫師或藥師進行用藥核對、腎功能劑量檢視與腎毒性暴露處置，並記錄決策。',
        'Have a clinician or pharmacist reconcile medications, review kidney-function dosing, manage nephrotoxic exposure, and document the decision.',
      ),
    ],
    guidelineReferences: [kdigoReference(locale)],
    safetyBoundary: text(
      locale,
      '不因 AKI 警示自動停藥；ACEI／ARB、利尿劑、SGLT2 抑制劑等需依個別病況判斷，避免一律停用。',
      'The AKI alert does not automatically stop medication. ACE inhibitors/ARBs, diuretics, SGLT2 inhibitors, and other drugs require individualized assessment rather than blanket discontinuation.',
    ),
  }
}

function buildClinicalHandoff(
  profile: CdssPatientProfile,
  locale: CdssLocale,
): CdssClinicalHandoff | undefined {
  const event = profile.akiAssessment?.event
  if (!event) return undefined
  const historical = event.recency === 'historical'
  const signal = formatFact(profile.facts.akiCreatinineSignal, locale)
  const eGfr = formatFact(profile.facts.eGFR, locale)
  const ckd = formatFact(profile.facts.ckdDiagnosis, locale)
  const medications = formatFact(
    profile.facts.currentNsaid ?? profile.facts.medicationListOverview,
    locale,
  )
  const followUp = event.followUpReadings.length > 0
    ? text(
        locale,
        `訊號後可見 ${event.followUpReadings.length} 筆 creatinine，最新 ${event.followUpReadings.at(-1)?.valueMgDl} mg/dL。`,
        `${event.followUpReadings.length} post-signal creatinine result(s) are visible; latest ${event.followUpReadings.at(-1)?.valueMgDl} mg/dL.`,
      )
    : text(
        locale,
        '目前資料切片未見訊號後 creatinine。',
        'No post-signal creatinine appears in the current data slice.',
      )
  const lines = locale === 'en'
    ? [
        `[${historical ? 'Historical review' : 'Current alert'}] Nephrology handoff draft`,
        'Source: patient-authorized My Health Bank data slice; not the complete legal medical record.',
        `Creatinine signal: ${signal}`,
        `Latest eGFR: ${eGfr}`,
        `CKD history: ${ckd}`,
        `Medication/nephrotoxin clue: ${medications}`,
        `Follow-up: ${followUp}`,
        'Not available for automated assessment: urine output/weight, real-time vital signs and volume status, inpatient medication/contrast exposure, dialysis, acute etiology.',
        'Request: verify the source data and timing, assess AKI stage/cause/complications, advise monitoring, medication management, and need/urgency for nephrology care.',
      ]
    : [
        `【${historical ? '歷史事件複核' : '近期警示'}】腎臟科交接草稿`,
        '資料來源：病人授權之健康存摺資料切片；不是完整法定病歷。',
        `Creatinine 訊號：${signal}`,
        `最近 eGFR：${eGfr}`,
        `CKD 背景：${ckd}`,
        `藥物／腎毒性線索：${medications}`,
        `後續追蹤：${followUp}`,
        '自動判讀未涵蓋：尿量／體重、即時生命徵象與體液狀態、院內給藥／顯影劑、透析、急性病因。',
        '會診問題：請核對原始數值與採檢時間，評估 AKI 分期、病因與併發症，並建議監測、藥物處置及腎臟科介入急迫性。',
      ]

  return {
    kind: 'nephrology-consult',
    title: text(
      locale,
      historical ? '歷史 AKI 事件交接摘要' : '腎臟科會診交接摘要',
      historical ? 'Historical AKI handoff summary' : 'Nephrology consult handoff summary',
    ),
    summary: text(
      locale,
      '將偵測依據、資料缺口與會診問題整理成可貼入院內流程的草稿。',
      'Detection evidence, data gaps, and the consult question are assembled into a draft for the institutional workflow.',
    ),
    copyLabel: text(locale, '複製會診草稿', 'Copy consult draft'),
    copiedLabel: text(locale, '已複製', 'Copied'),
    copyText: lines.join('\n'),
    safetyNote: text(
      locale,
      '複製前請由醫療人員核對；系統不會自動送出會診或寫回病歷。',
      'A clinician must verify before copying; the system does not send the consult or write to the chart.',
    ),
  }
}

export const AKI_GUIDELINE_PACK: ClinicalGuidelinePack = {
  id: 'aki-alert-cdss',
  diseaseCode: 'AKI',
  version: '1.0.0',
  enabled: true,
  label: {
    zh: 'AKI 警示',
    en: 'AKI alert',
  },
  applies(profile) {
    return (profile.akiAssessment?.readingCount ?? 0) > 0
  },
  build({ profile, locale }) {
    const recommendations = [
      buildDetection(profile, locale),
      buildFollowUp(profile, locale),
      buildMedicationReview(profile, locale),
    ].filter((item): item is CdssRecommendation => Boolean(item))
    const highPriorityCount = recommendations.filter(
      (item) => item.priority === 'high',
    ).length
    const needsDataCount = recommendations.filter(
      (item) => item.status === 'needs-data',
    ).length

    return {
      title: text(
        locale,
        'AKI 警示、追蹤與腎臟科交接',
        'AKI alert, follow-up, and nephrology handoff',
      ),
      summary: text(
        locale,
        `依健康存摺 serum-creatinine 時序產生 ${recommendations.length} 項閉環提示：${highPriorityCount} 項優先處理、${needsDataCount} 項需先補資料。`,
        `${recommendations.length} closed-loop prompts were generated from the My Health Bank serum-creatinine timeline: ${highPriorityCount} high priority and ${needsDataCount} requiring more data.`,
      ),
      packId: 'aki-alert-cdss',
      packVersion: '1.0.0',
      recommendations,
      clinicalHandoff: buildClinicalHandoff(profile, locale),
      automatedChecks: [
        {
          id: 'aki-kdigo-creatinine-windows',
          label: text(locale, 'KDIGO creatinine 時間窗', 'KDIGO creatinine windows'),
          value: text(
            locale,
            `已比對 ${profile.akiAssessment?.readingCount ?? 0} 筆可治理結果`,
            `${profile.akiAssessment?.readingCount ?? 0} governed result(s) compared`,
          ),
          factKeys: profile.facts.serumCreatinineTrend
            ? ['serumCreatinineTrend']
            : ['serumCreatinine'],
          sources: profile.facts.serumCreatinineTrend?.sources
            ?? profile.facts.serumCreatinine?.sources,
        },
      ],
      notEvaluated: [
        text(
          locale,
          '尿量分期、透析／腎臟替代治療、即時生命徵象、體液狀態、AKI 病因與併發症。',
          'Urine-output staging, dialysis/kidney replacement therapy, real-time vital signs, volume status, AKI etiology, and complications.',
        ),
        text(
          locale,
          '健康存摺之外的院內檢驗、給藥、顯影劑、自費資料與尚未上傳的結果。',
          'Institutional laboratories, administrations, contrast, self-pay data, and not-yet-uploaded results outside My Health Bank.',
        ),
      ],
      disclaimer: text(
        locale,
        'AKI CDSS POC｜以 KDIGO 2012 serum-creatinine 規則與 Park 等人的警示—會診閉環概念提供唯讀決策支援；不是診斷、醫囑或自動會診。健康存摺不是完整法定病歷，任何處置前需核對院內即時資料。',
        'AKI CDSS POC | Read-only decision support using the KDIGO 2012 serum-creatinine rules and the alert-to-consult loop described by Park and colleagues. It is not a diagnosis, order, or automated consult. My Health Bank is not the complete legal chart; verify real-time institutional data before action.',
      ),
    }
  },
}
