import type {
  CdssKnowledgePack,
  GuidelineCitedStatement,
} from '../types'
import { assessment, localize, pdfPageUrl } from './shared'
import evidenceIndex from './evidence-indexes/taiwan-nhi-2026.json'

const chapter5 = evidenceIndex.documents.find(
  (document) => document.id === 'nhi-drug-coverage-chapter-5-1150723',
)
const chapter2 = evidenceIndex.documents.find(
  (document) => document.id === 'nhi-drug-coverage-chapter-2-1150522',
)
const generalDiabetesRule = evidenceIndex.entries.find(
  (entry) => entry.id === 'nhi-5.1-general',
)
const sglt2DiabetesRule = evidenceIndex.entries.find(
  (entry) => entry.id === 'nhi-5.1.5-sglt2',
)
const sglt2CardiorenalRule = evidenceIndex.entries.find(
  (entry) => entry.id === 'nhi-2.16-sglt2-cardiorenal',
)
const lipidLoweringRule = evidenceIndex.entries.find(
  (entry) => entry.id === 'nhi-2.6.1-lipid-lowering-table',
)

if (
  !chapter5
  || !chapter2
  || !generalDiabetesRule
  || !sglt2DiabetesRule
  || !sglt2CardiorenalRule
  || !lipidLoweringRule
) {
  throw new Error('Taiwan NHI evidence index is incomplete')
}

const resolvedChapter2 = chapter2

function citedStatements(ruleId: string): readonly GuidelineCitedStatement[] {
  switch (ruleId) {
    case '5.1':
      return [
        {
          label: '5.1（2）（1）',
          text: '原則上第二型糖尿病治療應優先使用 metformin，或考慮早期開始使用胰島素。除有過敏、禁忌症、不能耐受或仍無法理想控制血糖的情形下，可使用其他類口服降血糖藥物。',
        },
        {
          label: '5.1（2）（2）',
          text: 'TZD 製劑、DPP-4抑制劑、SGLT-2抑制劑、以及含該3類成分之複方製劑，限用於已接受過最大耐受劑量的 metformin 仍無法理想控制血糖之第二型糖尿病病人，且 SGLT-2抑制劑與 DPP-4抑制劑及其複方製劑宜二種擇一種使用。',
        },
        {
          label: '5.1（2）（3）',
          text: '第二型糖尿病病人倘於使用三種口服降血糖藥物治療仍無法理想控制血糖者，宜考慮給予胰島素治療。',
        },
        {
          label: '5.1（2）（4）',
          text: '特約醫療院所應加強衛教第二型糖尿病病人，鼓勵健康生活型態的飲食和運動，如控制肥胖、限制熱量攝取等措施。',
        },
      ]
    case '5.1.5':
      return [
        {
          label: '5.1.5（1）',
          text: 'Dapagliflozin（如 Forxiga）、empagliflozin（如 Jardiance）、canagliflozin（如 Canaglu）、ertugliflozin（如 Steglatro）（105/5/1、107/3/1、108/7/1）\n每日最多處方1粒。',
        },
        {
          label: '5.1.5（2）',
          text: 'Empagliflozin/metformin 複方（如 Jardiance Duo）（107/3/1）\n每日最多處方2粒。',
        },
        {
          label: '5.1.5（3）',
          text: 'Dapagliflozin 及 metformin 複方（如 Xigduo XR）（107/3/1）\n每日最多處方1粒。',
        },
      ]
    case '2.6.1':
      return [{
        label: '2.6.1（心血管疾病或糖尿病患者）',
        text: '非藥物治療：與藥物治療可並行\n起始藥物治療血脂值：TC≧160mg/dL 或 LDL-C≧100mg/dL\n血脂目標值：TC＜160mg/dL 或 LDL-C＜100mg/dL\n處方規定：第一年應每3-6個月抽血檢查一次，第二年以後應至少每6-12個月抽血檢查一次，同時請注意副作用之產生如肝功能異常，橫紋肌溶解症。',
      }]
    case '2.16':
      return [{
        label: '2.16（2.慢性腎臟病）',
        text: '（1）限用於參加「初期慢性腎臟病照護整合方案」或「全民健康保險末期腎臟病前期（Pre-ESRD）之病人照護與衛教計畫」之慢性腎臟病病人，應完全符合下列條件：\nⅠ.接受 dapagliflozin 或 empagliflozin 治療前應穩定接受最大耐受劑量的 ACEI 或 ARB 至少4週。\nⅡ.起始治療 eGFR≧25且≦60mL/min/1.73m2。\nⅢ.uACR≧200且≦5000/mg/g。\nⅣ.須排除有以下任一情形：\ni.第1型糖尿病。\nii.已知為多囊腎、紅斑性狼瘡相關腎病，或抗中性粒細胞胞漿抗體（ANCA）相關血管炎。\niii.六個月內接受化療/免疫抑制治療或其他原發性或繼發性腎臟疾病的免疫治療。\niv.器官移植病史。\nv.急性心肌梗塞、不穩定型心絞痛、中風或12週內短暫性腦缺血發作。\nvi.12週內冠狀動脈血運重建術。\n（2）使用後 eGFR 下降至<15mL/min/1.73m2，應予停藥。\n3.每日最多處方1粒。',
      }]
    default:
      return []
  }
}

function chapter2Reference(
  locale: 'zh-TW' | 'en',
  entry: NonNullable<typeof lipidLoweringRule>,
) {
  return {
    id: `TW-NHI-${entry.ruleId}-1150522`,
    title: localize(locale, entry.title, entry.title),
    publisher: localize(locale, '衛生福利部中央健康保險署', 'National Health Insurance Administration'),
    version: resolvedChapter2.version,
    url: pdfPageUrl(resolvedChapter2.localUrl, entry.pdfPage),
    recommendationId: entry.ruleId,
    page: entry.pdfPage,
    printedPage: entry.printedPage,
    locator: localize(
      locale,
      `第 2 節 → ${entry.ruleId}（${entry.printedPage}）`,
      `Chapter 2 → ${entry.ruleId} (${entry.printedPage})`,
    ),
    summary: localize(locale, entry.summary, entry.summary),
    citedStatements: citedStatements(entry.ruleId),
  }
}

export const TAIWAN_NHI_DIABETES_PACK: CdssKnowledgePack = {
  enabled: true,
  metadata(locale) {
    return {
      id: 'taiwan-nhi-diabetes',
      kind: 'coverage',
      label: localize(locale, '健保給付', 'Taiwan NHI coverage'),
      version: '第 5 節 115.07.23／第 2 節 115.05.22',
      effectiveFrom: '2026-07-23',
    }
  },
  assess({ profile, recommendation, locale }) {
    const metadata = this.metadata(locale)
    const isMedication = recommendation.domain === 'medication'
    const isSglt2Decision = recommendation.id === 'sglt2-concordance'
      || recommendation.id === 'ckd-sglt2-strategy'
    if (!isMedication) {
      return assessment({
        sourceId: metadata.id,
        sourceKind: metadata.kind,
        sourceLabel: metadata.label,
        version: metadata.version,
        effectiveFrom: metadata.effectiveFrom,
        status: 'not-applicable',
        summary: localize(
          locale,
          '本項是臨床照護問題，不屬於藥品給付判定。',
          'This is a clinical-care question rather than a drug-coverage determination.',
        ),
      })
    }
    if (
      recommendation.id === 'ascvd-lipid-strategy'
      || recommendation.id === 'ckd-cardiovascular-risk'
    ) {
      const ldl = (
        !profile.freshnessContexts?.LDL
        || profile.freshnessContexts.LDL.state === 'current'
      )
        ? profile.facts.LDL?.numericValue
        : undefined
      const totalCholesterol = (
        !profile.freshnessContexts?.totalCholesterol
        || profile.freshnessContexts.totalCholesterol.state === 'current'
      )
        ? profile.facts.totalCholesterol?.numericValue
        : undefined
      const statinState = profile.medicationClassContexts?.statin?.state
      const statinPresent = statinState === 'confirmed-current'
        || statinState === 'active-order-unconfirmed'
        || statinState === 'on-hold'
      const verified: string[] = []
      const missing: string[] = []

      if (ldl !== undefined) {
        verified.push(localize(locale, `LDL-C ${ldl} mg/dL`, `LDL-C ${ldl} mg/dL`))
      } else {
        missing.push(localize(
          locale,
          profile.facts.LDL
            ? '更新 LDL-C（最近一筆已超過 1 年）'
            : 'LDL-C 與採檢日期',
          profile.facts.LDL
            ? 'Updated LDL-C (the latest result is older than 1 year)'
            : 'LDL-C and collection date',
        ))
      }
      if (totalCholesterol !== undefined) {
        verified.push(localize(
          locale,
          `總膽固醇 ${totalCholesterol} mg/dL`,
          `Total cholesterol ${totalCholesterol} mg/dL`,
        ))
      } else {
        missing.push(localize(
          locale,
          profile.facts.totalCholesterol
            ? '更新總膽固醇（最近一筆已超過 1 年）'
            : '總膽固醇與採檢日期',
          profile.facts.totalCholesterol
            ? 'Updated total cholesterol (the latest result is older than 1 year)'
            : 'Total cholesterol and collection date',
        ))
      }

      const meetsInitiationThreshold = (
        (ldl !== undefined && ldl >= 100)
        || (totalCholesterol !== undefined && totalCholesterol >= 160)
      )
      const bothBelowThreshold = (
        ldl !== undefined
        && totalCholesterol !== undefined
        && ldl < 100
        && totalCholesterol < 160
      )
      const status = statinPresent
        ? 'needs-data'
        : meetsInitiationThreshold
          ? 'covered'
          : bothBelowThreshold
            ? 'not-covered'
            : 'needs-data'
      const summary = statinPresent
        ? localize(
            locale,
            '已在使用 statin；需以起始依據與後續監測紀錄核對續用。',
            'A statin is already in use; verify the initiation basis and subsequent monitoring for continued coverage.',
          )
        : meetsInitiationThreshold
          ? localize(
              locale,
              `符合糖尿病／心血管疾病起始門檻（TC ≥160 或 LDL-C ≥100 mg/dL）。`,
              'Meets the initiation threshold for diabetes/cardiovascular disease (TC at least 160 or LDL-C at least 100 mg/dL).',
            )
          : bothBelowThreshold
            ? localize(
                locale,
                '目前 TC 與 LDL-C 均未達本表起始門檻。',
                'Current TC and LDL-C are both below this table’s initiation thresholds.',
              )
            : localize(
                locale,
                '需有 LDL-C 或總膽固醇才能核對起始給付門檻。',
                'LDL-C or total cholesterol is needed to assess the initiation threshold.',
              )

      return assessment({
        sourceId: metadata.id,
        sourceKind: metadata.kind,
        sourceLabel: metadata.label,
        version: metadata.version,
        effectiveFrom: metadata.effectiveFrom,
        status,
        summary,
        verifiedData: verified,
        missingData: status === 'needs-data' ? missing : undefined,
        references: [chapter2Reference(locale, lipidLoweringRule)],
      })
    }

    if (
      recommendation.id === 'kidney-medication-strategy'
      || recommendation.id === 'ckd-rasi-strategy'
    ) {
      const aceArbPresent = (
        profile.medicationClassContexts?.['ace-inhibitor-or-arb']?.state === 'confirmed-current'
      )
      const usesCkdSglt2CoverageRoute = (
        profile.coverageContexts?.taiwanNhiSglt2?.indicationRoute === 'ckd'
      )

      if (!usesCkdSglt2CoverageRoute) {
        return assessment({
          sourceId: metadata.id,
          sourceKind: metadata.kind,
          sourceLabel: metadata.label,
          version: metadata.version,
          effectiveFrom: metadata.effectiveFrom,
          status: 'no-special-rule',
          summary: localize(
            locale,
            '第 2 節未設成人 CKD＋高血壓使用一般口服 ACEI／ARB 的類別給付門檻；選定成分後再核對健保品項與許可適應症。',
            'Chapter 2 does not set a class-wide coverage threshold for standard oral ACE inhibitor/ARB therapy in adults with CKD and hypertension; verify the selected product and approved indication after choosing an agent.',
          ),
        })
      }

      return assessment({
        sourceId: metadata.id,
        sourceKind: metadata.kind,
        sourceLabel: metadata.label,
        version: metadata.version,
        effectiveFrom: metadata.effectiveFrom,
        status: 'needs-data',
        summary: localize(
          locale,
          '若 SGLT2 依 CKD 路徑申報，起始前須穩定使用最大耐受 ACEI／ARB 至少 4 週。',
          'For the CKD SGLT2 coverage route, a maximally tolerated stable ACE inhibitor/ARB dose is required for at least four weeks before initiation.',
        ),
        verifiedData: aceArbPresent
          ? [localize(locale, '已確認目前使用 ACEI／ARB', 'Current ACE inhibitor/ARB use is confirmed')]
          : undefined,
        missingData: [
          localize(
            locale,
            aceArbPresent
              ? 'SGLT2 起始前已達最大耐受穩定劑量至少 4 週的紀錄'
              : 'SGLT2 起始前最大耐受 ACEI／ARB 穩定治療至少 4 週的紀錄',
            aceArbPresent
              ? 'Documentation of a stable maximally tolerated dose for at least four weeks before SGLT2 initiation'
              : 'Documentation of at least four weeks of stable maximally tolerated ACE inhibitor/ARB therapy before SGLT2 initiation',
          ),
        ],
        references: [chapter2Reference(locale, sglt2CardiorenalRule)],
      })
    }

    if (!isSglt2Decision) {
      return assessment({
        sourceId: metadata.id,
        sourceKind: metadata.kind,
        sourceLabel: metadata.label,
        version: metadata.version,
        effectiveFrom: metadata.effectiveFrom,
        status: 'not-applicable',
        summary: localize(
          locale,
          '此藥物決策尚未接入對應的健保給付規則。',
          'The matching NHI coverage rule has not yet been connected for this medication decision.',
        ),
      })
    }

    const sglt2State = profile.medicationClassContexts?.['sglt2-inhibitor']?.state
    const hasActiveOrder = sglt2State === 'active-order-unconfirmed'
      || sglt2State === 'confirmed-current'
      || profile.medicationContexts?.forxiga?.useState === 'active_order_unconfirmed'
      || profile.medicationContexts?.forxiga?.useState === 'confirmed_current'
    const sglt2Context = profile.coverageContexts?.taiwanNhiSglt2
    const verified: string[] = []
    const missing: string[] = []
    const conflicts: string[] = []

    if (hasActiveOrder) {
      verified.push(localize(
        locale,
        '已有 SGLT2 抑制劑處方／用藥紀錄',
        'An SGLT2 inhibitor prescription/use record is present',
      ))
    }
    if (sglt2Context?.dailyUnits !== undefined) {
      if (sglt2Context.dailyUnits <= 1) {
        verified.push(localize(
          locale,
          `每日 ${sglt2Context.dailyUnits} 錠，符合每日最多 1 錠`,
          `${sglt2Context.dailyUnits} tablet(s) daily, within the one-tablet daily limit`,
        ))
      } else {
        conflicts.push(localize(
          locale,
          `每日 ${sglt2Context.dailyUnits} 錠，超過每日最多 1 錠`,
          `${sglt2Context.dailyUnits} tablets daily exceeds the one-tablet daily limit`,
        ))
      }
    } else {
      missing.push(localize(locale, '每日處方錠數', 'Prescribed tablets per day'))
    }

    if (sglt2Context?.indicationRoute === 'ckd') {
      const indication = sglt2Context.claimIndicationCodes[0]
        ?? sglt2Context.claimIndicationTexts[0]
        ?? 'CKD'
      verified.push(localize(
        locale,
        `本次處方申報診斷為 ${indication}，套用 CKD 給付路徑`,
        `The prescription indication is ${indication}; the CKD coverage pathway applies`,
      ))
      const treatmentStartDate = sglt2Context.confirmedTreatmentStartDate
      if (sglt2Context.earliestObservedPrescriptionDate) {
        verified.push(localize(
          locale,
          `資料範圍內最早可見的 CKD 適應症 SGLT2 處方：${sglt2Context.earliestObservedPrescriptionDate}（不等同起始日）`,
          `Earliest visible SGLT2 prescription for CKD in the available window: ${sglt2Context.earliestObservedPrescriptionDate} (not necessarily the start date)`,
        ))
      }

      if (sglt2Context.ckdCareProgramTitle) {
        verified.push(localize(
          locale,
          `已參加「${sglt2Context.ckdCareProgramTitle}」`,
          `Enrolled in "${sglt2Context.ckdCareProgramTitle}"`,
        ))
      } else {
        missing.push(localize(
          locale,
          '初期 CKD 或 Pre-ESRD 照護計畫收案紀錄',
          'Enrollment in an early-CKD or Pre-ESRD care program',
        ))
      }

      const egfr = profile.facts.eGFR
      const egfrSources = profile.facts.eGFRTrend?.sources ?? egfr?.sources ?? []
      const baselineEgfrSource = treatmentStartDate
        ? [...egfrSources]
            .filter((source) => (
              source.date
              && source.date <= treatmentStartDate
              && typeof source.value === 'number'
            ))
            .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))[0]
        : undefined
      const baselineEgfrValue = typeof baselineEgfrSource?.value === 'number'
        ? baselineEgfrSource.value
        : (
          egfr?.date
          && treatmentStartDate
          && egfr.date <= treatmentStartDate
          ? egfr.numericValue
          : undefined
        )
      const baselineEgfrDate = baselineEgfrSource?.date
        ?? (
          egfr?.date
          && treatmentStartDate
          && egfr.date <= treatmentStartDate
          ? egfr.date
          : undefined
        )
      if (!treatmentStartDate) {
        missing.push(localize(
          locale,
          '實際起始治療日與起始時採用的 eGFR',
          'The actual treatment start date and the eGFR used at initiation',
        ))
      } else if (baselineEgfrValue !== undefined) {
        if (baselineEgfrValue >= 25 && baselineEgfrValue <= 60) {
          verified.push(localize(
            locale,
            `起始治療前 eGFR ${baselineEgfrValue}（${baselineEgfrDate}），符合 25–60`,
            `Pre-treatment eGFR ${baselineEgfrValue} (${baselineEgfrDate}), within 25–60`,
          ))
        } else {
          conflicts.push(localize(
            locale,
            `起始治療前 eGFR ${baselineEgfrValue}（${baselineEgfrDate}），不在 25–60 範圍`,
            `Pre-treatment eGFR ${baselineEgfrValue} (${baselineEgfrDate}) is outside 25–60`,
          ))
        }
      } else {
        missing.push(localize(
          locale,
          '起始治療前 eGFR 25–60 的檢驗紀錄',
          'A pre-treatment eGFR result within 25–60',
        ))
      }

      const uacr = profile.facts.urineAlbuminRatio
      const quantitativeUacr = profile.facts.urineAlbuminRatioQuantitative ?? uacr
      const uacrReadings = profile.observationContexts?.uacr?.readings ?? []
      const preTreatmentUacrReadings = treatmentStartDate
        ? uacrReadings.filter((reading) => (
            reading.date && reading.date <= treatmentStartDate
          ))
        : []
      const baselineUacr = preTreatmentUacrReadings[0]
      const earlierSupportiveUacr = preTreatmentUacrReadings.slice(1).find((reading) => (
        (
          reading.kind === 'quantitative'
          && reading.numericValueMgG !== undefined
          && reading.numericValueMgG >= 200
          && reading.numericValueMgG <= 5000
        )
        || (
          reading.kind === 'semiquantitative'
          && reading.lowerBoundMgG !== undefined
          && reading.lowerBoundMgG >= 200
        )
      ))
      const fallbackIsPreTreatmentUacr = Boolean(
        quantitativeUacr?.date
        && treatmentStartDate
        && quantitativeUacr.date <= treatmentStartDate,
      )
      const quantitativeValue = baselineUacr?.kind === 'quantitative'
        ? baselineUacr.numericValueMgG
        : uacrReadings.length === 0 && fallbackIsPreTreatmentUacr
          ? quantitativeUacr?.numericValue
          : undefined
      const quantitativeDate = baselineUacr?.kind === 'quantitative'
        ? baselineUacr.date
        : uacrReadings.length === 0
          ? quantitativeUacr?.date
          : undefined

      if (!treatmentStartDate) {
        if (uacr) {
          verified.push(localize(
            locale,
            `目前資料可見 ${uacr.zh}；因起始日不明，未用於起始給付門檻`,
            `${uacr.en} is visible in the available data; it was not used for the initiation threshold because the start date is unknown`,
          ))
        }
        missing.push(localize(
          locale,
          '實際起始治療日與起始時採用的 UACR',
          'The actual treatment start date and the UACR used at initiation',
        ))
      } else if (quantitativeValue !== undefined) {
        if (quantitativeValue >= 200 && quantitativeValue <= 5000) {
          verified.push(localize(
            locale,
            `起始治療前 UACR ${quantitativeValue} mg/g（${quantitativeDate}），符合 200–5000`,
            `Pre-treatment UACR ${quantitativeValue} mg/g (${quantitativeDate}), within 200–5000`,
          ))
        } else if (earlierSupportiveUacr) {
          verified.push(
            localize(
              locale,
              `起始治療前最近 UACR ${quantitativeValue} mg/g（${quantitativeDate}）`,
              `Latest pre-treatment UACR ${quantitativeValue} mg/g (${quantitativeDate})`,
            ),
            localize(
              locale,
              `較早另有${earlierSupportiveUacr.zh}`,
              `An earlier result is also present: ${earlierSupportiveUacr.en}`,
            ),
          )
          missing.push(localize(
            locale,
            '起始治療時採用的 UACR 給付依據',
            'The UACR result used as the coverage basis at treatment initiation',
          ))
        } else {
          conflicts.push(localize(
            locale,
            `起始治療前最近 UACR ${quantitativeValue} mg/g（${quantitativeDate}），不在 200–5000 範圍`,
            `Latest pre-treatment UACR ${quantitativeValue} mg/g (${quantitativeDate}) is outside 200–5000`,
          ))
        }
      } else if (
        baselineUacr?.kind === 'semiquantitative'
        && baselineUacr.lowerBoundMgG !== undefined
        && baselineUacr.lowerBoundMgG >= 200
      ) {
        verified.push(localize(
          locale,
          `起始治療前最近結果為${baselineUacr.zh}，支持已達 ≥200，但不能確認 ≤5000`,
          `The latest pre-treatment result is ${baselineUacr.en}; it supports ≥200 but cannot confirm ≤5000`,
        ))
        missing.push(localize(
          locale,
          '起始治療時採用的定量 UACR 給付依據',
          'The quantitative UACR used as the coverage basis at treatment initiation',
        ))
      } else {
        if (uacr) {
          verified.push(localize(
            locale,
            `已找到${uacr.zh}，但不能用於 200–5000 mg/g 的定量門檻`,
            `${uacr.en} is present but cannot be used for the quantitative 200–5000 mg/g threshold`,
          ))
        }
        missing.push(localize(
          locale,
          '處方前 UACR 200–5000 mg/g 的檢驗紀錄',
          'A pre-treatment UACR result within 200–5000 mg/g',
        ))
      }

      missing.push(
        localize(
          locale,
          'ACEI／ARB 最大耐受劑量穩定治療至少 4 週的紀錄',
          'At least four weeks of stable maximum-tolerated ACE inhibitor or ARB therapy',
        ),
        localize(
          locale,
          'CKD 給付排除條件核對',
          'Review of CKD coverage exclusion criteria',
        ),
      )
    } else if (sglt2Context?.indicationRoute === 't2dm') {
      verified.push(localize(
        locale,
        '本次處方套用第二型糖尿病給付路徑',
        'The type 2 diabetes coverage pathway applies',
      ))
      missing.push(
        localize(
          locale,
          'metformin 最大耐受劑量、禁忌或不耐受紀錄',
          'Maximum tolerated metformin dose, contraindication, or intolerance',
        ),
        localize(
          locale,
          'metformin 後血糖仍未理想控制的紀錄',
          'Evidence of inadequate glycemic control after metformin',
        ),
        localize(
          locale,
          '目前是否併用 DPP-4 抑制劑',
          'Whether a DPP-4 inhibitor is currently co-prescribed',
        ),
      )
    } else {
      missing.push(localize(
        locale,
        '本次處方申報適應症',
        'The indication submitted for this prescription',
      ))
    }

    const status = conflicts.length > 0
      ? 'not-covered'
      : missing.length === 0
        ? 'covered'
        : 'needs-data'
    const summary = conflicts.length > 0
      ? localize(locale, conflicts.join('；'), conflicts.join('; '))
      : missing.length > 0
        ? localize(
            locale,
            `已自動核對 ${verified.length} 項；尚缺 ${missing.length} 項，暫不能判定給付。`,
            `${verified.length} item(s) verified automatically; ${missing.length} item(s) remain before coverage can be determined.`,
          )
        : localize(
            locale,
            '現有結構化資料符合本條給付條件。',
            'The available structured data meet this coverage rule.',
          )

    return assessment({
      sourceId: metadata.id,
      sourceKind: metadata.kind,
      sourceLabel: metadata.label,
      version: metadata.version,
      effectiveFrom: metadata.effectiveFrom,
      status,
      summary,
      verifiedData: verified,
      missingData: missing,
      references: isSglt2Decision
        ? [
            {
              id: 'TW-NHI-5.1.5-1150723',
              title: localize(locale, sglt2DiabetesRule.title, 'SGLT-2 inhibitors and combinations'),
              publisher: localize(locale, '衛生福利部中央健康保險署', 'National Health Insurance Administration'),
              version: chapter5.version,
              url: pdfPageUrl(chapter5.localUrl, sglt2DiabetesRule.pdfPage),
              recommendationId: sglt2DiabetesRule.ruleId,
              page: sglt2DiabetesRule.pdfPage,
              printedPage: sglt2DiabetesRule.printedPage,
              locator: localize(
                locale,
                `第 5 節 → ${sglt2DiabetesRule.ruleId}（${sglt2DiabetesRule.printedPage}）`,
                `Chapter 5 → ${sglt2DiabetesRule.ruleId} (${sglt2DiabetesRule.printedPage})`,
              ),
              summary: localize(
                locale,
                sglt2DiabetesRule.summary,
                'Lists covered SGLT-2 inhibitors and combination products with prescribing limits.',
              ),
              citedStatements: citedStatements(sglt2DiabetesRule.ruleId),
            },
            {
              id: 'TW-NHI-2.16-1150522',
              title: localize(locale, sglt2CardiorenalRule.title, 'Dapagliflozin/empagliflozin in cardiorenal indications'),
              publisher: localize(locale, '衛生福利部中央健康保險署', 'National Health Insurance Administration'),
              version: chapter2.version,
              url: pdfPageUrl(chapter2.localUrl, sglt2CardiorenalRule.pdfPage),
              recommendationId: sglt2CardiorenalRule.ruleId,
              page: sglt2CardiorenalRule.pdfPage,
              printedPage: sglt2CardiorenalRule.printedPage,
              locator: localize(
                locale,
                `第 2 節 → ${sglt2CardiorenalRule.ruleId} 慢性腎臟病（${sglt2CardiorenalRule.printedPage}）`,
                `Chapter 2 → ${sglt2CardiorenalRule.ruleId} chronic kidney disease (${sglt2CardiorenalRule.printedPage})`,
              ),
              summary: localize(
                locale,
                sglt2CardiorenalRule.summary,
                'Enrollment, prerequisite therapy, eGFR, UACR, and exclusion criteria for dapagliflozin/empagliflozin in CKD.',
              ),
              citedStatements: citedStatements(sglt2CardiorenalRule.ruleId),
            },
          ]
        : [{
            id: 'TW-NHI-5.1-1150723',
            title: localize(locale, generalDiabetesRule.title, 'General coverage conditions for diabetes drugs'),
            publisher: localize(locale, '衛生福利部中央健康保險署', 'National Health Insurance Administration'),
            version: chapter5.version,
            url: pdfPageUrl(chapter5.localUrl, generalDiabetesRule.pdfPage),
            recommendationId: generalDiabetesRule.ruleId,
            page: generalDiabetesRule.pdfPage,
            printedPage: generalDiabetesRule.printedPage,
            locator: localize(
              locale,
              `第 5 節 → ${generalDiabetesRule.ruleId}（${generalDiabetesRule.printedPage}）`,
              `Chapter 5 → ${generalDiabetesRule.ruleId} (${generalDiabetesRule.printedPage})`,
            ),
            summary: localize(
              locale,
              generalDiabetesRule.summary,
              'Covers drug classes, metformin prerequisites, selected combination limits, and required treatment records.',
            ),
            citedStatements: citedStatements(generalDiabetesRule.ruleId),
          }],
    })
  },
}
