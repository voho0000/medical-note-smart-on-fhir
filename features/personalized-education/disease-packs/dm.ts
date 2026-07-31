import type {
  DiseaseEducationPack,
  EducationFact,
  EducationLessonGroup,
  EducationMedication,
  EducationObservation,
  EducationPlan,
  EducationSection,
  PatientEducationContext,
} from '../types'

const ICD_10_CM_SYSTEM = 'http://hl7.org/fhir/sid/icd-10-cm'
const ICD_10_SYSTEM = 'http://hl7.org/fhir/sid/icd-10'
const SNOMED_CT_SYSTEM = 'http://snomed.info/sct'
const LOINC_SYSTEM = 'http://loinc.org'
const HBA1C_LOINC = '4548-4'
const EGFR_LOINC = '77147-7'

const TYPE_2_DIABETES_CODES = [
  { system: SNOMED_CT_SYSTEM, code: '44054006' },
] as const

const DAPAGLIFLOZIN_CODES = [
  {
    system: 'https://twcore.mohw.gov.tw/CodeSystem/nhi-drug-code',
    code: 'BC26476100',
  },
  { system: 'http://www.whocc.no/atc', code: 'A10BK01' },
  {
    system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
    code: '1486977',
  },
  {
    system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
    code: '1488569',
  },
] as const

const SOURCES: EducationPlan['sources'] = {
  niddkManaging: {
    id: 'niddkManaging',
    label: '美國國家糖尿病、消化與腎臟疾病研究所｜糖尿病管理',
    url: 'https://www.niddk.nih.gov/health-information/diabetes/overview/managing-diabetes',
  },
  niddkHealthyLiving: {
    id: 'niddkHealthyLiving',
    label: '美國國家糖尿病、消化與腎臟疾病研究所｜糖尿病健康生活',
    url: 'https://www.niddk.nih.gov/health-information/diabetes/overview/healthy-living-with-diabetes',
  },
  niddkA1c: {
    id: 'niddkA1c',
    label: '美國國家糖尿病、消化與腎臟疾病研究所｜糖化血色素',
    url: 'https://www.niddk.nih.gov/health-information/diagnostic-tests/a1c-test',
  },
  niddkKidney: {
    id: 'niddkKidney',
    label: '美國國家糖尿病、消化與腎臟疾病研究所｜糖尿病腎臟病',
    url: 'https://www.niddk.nih.gov/health-information/diabetes/overview/preventing-problems/diabetic-kidney-disease',
  },
  niddkLowGlucose: {
    id: 'niddkLowGlucose',
    label: '美國國家糖尿病、消化與腎臟疾病研究所｜低血糖',
    url: 'https://www.niddk.nih.gov/health-information/diabetes/overview/preventing-problems/low-blood-glucose-hypoglycemia',
  },
  niddkFeet: {
    id: 'niddkFeet',
    label: '美國國家糖尿病、消化與腎臟疾病研究所｜糖尿病足部照護',
    url: 'https://www.niddk.nih.gov/health-information/diabetes/overview/preventing-problems/foot-problems',
  },
  niddkEyes: {
    id: 'niddkEyes',
    label: '美國國家糖尿病、消化與腎臟疾病研究所｜糖尿病眼睛照護',
    url: 'https://www.niddk.nih.gov/health-information/diabetes/overview/preventing-problems/diabetic-eye-disease',
  },
  dailyMedDapagliflozin: {
    id: 'dailyMedDapagliflozin',
    label: '美國國家醫學圖書館藥品資料庫（DailyMed）｜達格列淨仿單',
    url: 'https://www.dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=72ad22ae-efe6-4cd6-a302-98aaee423d69',
  },
}

function parseDate(value?: string): number {
  if (!value) return Number.NEGATIVE_INFINITY
  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY : timestamp
}

function newestFirst<T extends { date?: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => parseDate(b.date) - parseDate(a.date))
}

function formatDate(value?: string): string {
  if (!value) return '日期未記錄'
  const date = value.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.replaceAll('-', '/') : value
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function formatQuantity(value: number, unit?: string): string {
  if (unit?.trim() === '%') return `${formatNumber(value)}%`
  return [formatNumber(value), unit?.trim()].filter(Boolean).join(' ')
}

function isCoding(
  observation: EducationObservation,
  system: string,
  code: string,
): boolean {
  return observation.codings.some(
    (coding) => coding.system === system && coding.code === code,
  )
}

function isPercentUnit(unit?: string): boolean {
  return unit?.trim() === '%'
}

function isComparableEgfrUnit(unit?: string): boolean {
  return [
    'mL/min/1.73m2',
    'mL/min/1.73m²',
    'mL/min/{1.73_m2}',
  ].includes(unit?.trim() ?? '')
}

function isUsableObservation(observation: EducationObservation): boolean {
  return ['final', 'amended', 'corrected'].includes(
    observation.status?.toLowerCase() ?? '',
  )
}

function findLatestObservation(
  context: PatientEducationContext,
  code: string,
): EducationObservation | undefined {
  return newestFirst(
    context.observations.filter((observation) => (
      isCoding(observation, LOINC_SYSTEM, code)
      && typeof observation.value === 'number'
      && isUsableObservation(observation)
    )),
  )[0]
}

function findEgfrTrend(context: PatientEducationContext): EducationObservation[] {
  const allResults = newestFirst(
    context.observations.filter((observation) => (
      isCoding(observation, LOINC_SYSTEM, EGFR_LOINC)
      && typeof observation.value === 'number'
      && isUsableObservation(observation)
    )),
  )
  const latest = allResults[0]
  if (!latest) return []

  const latestUnit = latest.unit?.trim()
  if (!latestUnit) return [latest]

  return allResults
    .filter((observation) => observation.unit?.trim() === latestUnit)
    .slice(0, 4)
    .reverse()
}

function isRecognizedDapagliflozin(medication: EducationMedication): boolean {
  return medication.codings.some((coding) => (
    DAPAGLIFLOZIN_CODES.some((recognized) => (
      coding.system === recognized.system && coding.code === recognized.code
    ))
  ))
}

function isForxigaProduct(medication: EducationMedication): boolean {
  return medication.codings.some((coding) => (
    coding.system === 'https://twcore.mohw.gov.tw/CodeSystem/nhi-drug-code'
    && coding.code === 'BC26476100'
  ))
}

function findDapagliflozin(
  context: PatientEducationContext,
): EducationMedication | undefined {
  return [...context.medications]
    .filter((medication) => (
      isRecognizedDapagliflozin(medication)
      && !['entered-in-error', 'cancelled'].includes(
        medication.status?.toLowerCase() ?? '',
      )
    ))
    .sort((a, b) => parseDate(b.authoredOn) - parseDate(a.authoredOn))[0]
}

function hasType2DiabetesCode(coding: {
  system?: string
  code?: string
}): boolean {
  return (
    (
      (coding.system === ICD_10_CM_SYSTEM || coding.system === ICD_10_SYSTEM)
      && /^E11(?:\.|$)/.test(coding.code ?? '')
    )
    || TYPE_2_DIABETES_CODES.some((recognized) => (
      coding.system === recognized.system && coding.code === recognized.code
    ))
  )
}

function hasDmDiagnosis(context: PatientEducationContext): boolean {
  return context.diagnosisCodings.some(hasType2DiabetesCode)
}

function buildFacts(
  context: PatientEducationContext,
  hba1c: EducationObservation | undefined,
  egfrTrend: EducationObservation[],
  dapagliflozin: EducationMedication | undefined,
): EducationFact[] {
  const facts: EducationFact[] = []
  const diagnosis = context.diagnosisCodings.find(hasType2DiabetesCode)

  if (diagnosis?.code) {
    facts.push({
      id: 'diagnosis',
      label: '衛教套用依據',
      value: `第二型糖尿病診斷紀錄（${diagnosis.code}）`,
      detail: '病歷中的診斷代碼',
    })
  }

  if (hba1c?.value !== undefined) {
    facts.push({
      id: 'hba1c',
      label: '近 3 個月平均血糖',
      value: `糖化血色素（HbA1c）${formatQuantity(hba1c.value, hba1c.unit)}`,
      detail: formatDate(hba1c.date),
    })
  }

  const latestEgfr = egfrTrend.at(-1)
  if (latestEgfr?.value !== undefined) {
    facts.push({
      id: 'egfr',
      label: '腎臟過濾能力',
      value: `估算腎絲球過濾率（eGFR）${formatQuantity(latestEgfr.value, latestEgfr.unit)}`,
      detail: egfrTrend.length > 1
        ? `近期紀錄：${egfrTrend.map((item) => formatNumber(item.value!)).join(' → ')}${latestEgfr.unit ? ` ${latestEgfr.unit}` : ''}`
        : formatDate(latestEgfr.date),
      tone: isComparableEgfrUnit(latestEgfr.unit) && latestEgfr.value < 60
        ? 'attention'
        : 'default',
    })
  }

  if (dapagliflozin) {
    facts.push({
      id: 'dapagliflozin',
      label: '近期藥物紀錄',
      value: isForxigaProduct(dapagliflozin)
        ? '福適佳 10 毫克（達格列淨）'
        : '達格列淨（dapagliflozin）',
      detail: `${formatDate(dapagliflozin.authoredOn)} ${dapagliflozin.source}；不代表已確認服用`,
    })
  }

  return facts
}

function buildA1cSection(
  hba1c: EducationObservation,
  age: number | null,
): EducationSection {
  const result = hba1c.value!
  const comparable = isPercentUnit(hba1c.unit)
  const underCommonGoal = comparable && result < 7
  const ageContext = age !== null && age >= 65
    ? '年齡、腎功能與低血糖風險都會影響適合你的目標。'
    : '腎功能、低血糖風險與整體健康都會影響適合你的目標。'

  return {
    id: 'a1c',
    eyebrow: '先看血糖',
    title: comparable
      ? underCommonGoal
        ? '這筆結果已低於常見的 7% 參考值'
        : '這筆結果高於常見的 7% 參考值'
      : '這筆結果要依報告單位與個人目標解讀',
    summary: comparable
      ? underCommonGoal
        ? '現在的重點不是把血糖壓得越低越好，而是穩定、避免低血糖。'
        : '這不是一天吃錯造成的；它反映的是最近大約 3 個月的平均狀況。'
      : '這項檢查反映最近大約 3 個月的平均血糖；目前單位不能直接套用 7% 參考值。',
    explanation: [
      comparable
        ? '許多糖尿病成人會以低於 7% 作為一般參考，但每個人的安全目標不同。'
        : '不同報告單位不能直接互相比較，也不能自行換算後決定是否調藥。',
      ageContext,
      '單靠這一筆結果不能決定是否改藥，也看不出一天中是否曾經過低或過高。',
    ],
    actionTitle: '今天先做這件事',
    action: '若只是冒冷汗、發抖或突然無力，先記下時間、當時血糖與是否吃過東西；若現在意識不清、抽搐或無法安全吞嚥，旁人不要餵食，請立即撥打 119。',
    sourceIds: ['niddkA1c', 'niddkManaging', 'niddkLowGlucose'],
  }
}

function buildKidneySection(egfrTrend: EducationObservation[]): EducationSection {
  const latest = egfrTrend.at(-1)
  const persistentlyBelow60 = egfrTrend.length >= 2
    && egfrTrend.every((observation) => (
      isComparableEgfrUnit(observation.unit) && observation.value! < 60
    ))
  const latestBelow60 = latest?.value !== undefined
    && isComparableEgfrUnit(latest.unit)
    && latest.value < 60

  return {
    id: 'kidney',
    eyebrow: '再看腎臟',
    title: persistentlyBelow60
      ? '腎臟過濾能力不只一次偏低，需要持續追蹤'
      : latestBelow60
        ? '這次腎臟過濾能力偏低，需要和前後結果一起看'
        : '糖尿病照護要把腎臟一起放進來',
    summary: '血糖長期偏高會傷害腎臟的小血管；高血壓也會讓損傷加快。',
    explanation: [
      '腎臟問題早期常沒有明顯症狀，所以不能只靠身體感覺。',
      '抽血的估算腎絲球過濾率（eGFR）看過濾能力；驗尿的尿白蛋白／肌酸酐比值（UACR）看蛋白質是否漏到尿中。',
      '過濾能力持續偏低，會影響藥物怎麼選、劑量怎麼調，也讓脫水或急性生病時更需要小心。',
      '兩種檢查回答不同問題，要一起追蹤；也不能只憑糖尿病就斷定腎功能下降一定是糖尿病造成。',
    ],
    actionTitle: '下次追蹤要完成',
    action: '把抽血與驗尿排在同一次追蹤：確認報告同時有估算腎絲球過濾率（eGFR）與定量尿白蛋白／肌酸酐比值（UACR），再分別和自己的前一次結果比較。',
    sourceIds: ['niddkKidney'],
    tone: 'attention',
  }
}

function buildDapagliflozinSection(
  medication: EducationMedication,
): EducationSection {
  const isForxiga = isForxigaProduct(medication)

  return {
    id: 'dapagliflozin',
    eyebrow: '最後看藥物',
    title: `${isForxiga ? '福適佳（達格列淨）' : '達格列淨'}不只用來降血糖`,
    summary: `${isForxiga ? '福適佳的學名是達格列淨' : '達格列淨（dapagliflozin）'}，會讓腎臟從尿中排出一部分葡萄糖與鈉。`,
    explanation: [
      '它可用於改善第二型糖尿病的血糖；在符合條件的成人，也可降低腎功能持續惡化、腎衰竭、心血管死亡或因心臟衰竭住院的風險。',
      '腎功能較低時，降血糖效果可能變弱，但保護腎臟或心臟仍可能是處方目的。',
      `你的病歷目前只有「${formatDate(medication.authoredOn)} ${medication.source}」，因此本頁不把它說成你正在服用。`,
    ],
    actionTitle: '如果你確實正在服用',
    action: '若持續嘔吐、腹痛、呼吸急促或異常虛弱，不要再服用下一劑並立即就醫，主動說明正在使用達格列淨；預定大型手術或需長時間禁食時，至少提前 3 天向開藥團隊確認停藥日。平時不要自行長期停藥或加藥。',
    sourceIds: ['dailyMedDapagliflozin'],
    tone: 'medication',
  }
}

function buildFallbackSection(): EducationSection {
  return {
    id: 'daily-rhythm',
    eyebrow: '把知識變成日常',
    title: '先選一個做得到的小改變',
    summary: '糖尿病管理不是一次把所有事都做到，而是讓一個行動穩定出現。',
    explanation: [
      '先觀察自己最常卡住的是飲料、份量、活動、用藥還是監測。',
      '從一個可重複的小行動開始，比設定很多模糊目標更容易看出效果。',
    ],
    actionTitle: '今天先做這件事',
    action: '選一餐，把含糖飲料換成無糖飲品；或在安全、做得到的情況下，餐後走 10 分鐘。',
    sourceIds: ['niddkHealthyLiving'],
  }
}

const LESSON_GROUPS: EducationLessonGroup[] = [
  {
    id: 'numbers',
    title: '看懂數字與警訊',
    description: '知道數字回答什麼，也知道什麼情況不能等。',
    lessons: [
      {
        id: 'a1c-basics',
        title: '糖化血色素：不是今天的血糖',
        takeaway: '它反映最近約 3 個月的平均血糖。',
        detail: '單次偏高或偏低不等於整段時間都一樣；解讀時要和自己的目標、低血糖情形與前次結果一起看。',
        action: '保存檢查日期與結果，下次和自己的前一次比較。',
        sourceIds: ['niddkA1c'],
      },
      {
        id: 'home-glucose',
        title: '居家血糖：用來找出一天中的變化',
        takeaway: '居家血糖與糖化血色素回答不同問題。',
        detail: '飯前、飯後或不舒服時的血糖，能幫助找出食物、活動與藥物之間的關係；不是每個人都需要同樣的測量頻率。',
        action: '若有量血糖，把時間、數字、當時是否吃飯或不舒服一起記錄。',
        sourceIds: ['niddkManaging'],
      },
      {
        id: 'hypoglycemia',
        title: '低血糖：不要只看數字，也要認得症狀',
        takeaway: '發抖、冒冷汗、頭痛、突然無力或意識改變都要提高警覺。',
        detail: '低血糖可能和藥物、吃得太少或活動量改變有關；反覆發生時需要調整整體計畫，而不是硬撐。',
        action: '清醒且能安全吞嚥時，吃 15 至 20 公克快速糖，例如依包裝標示使用葡萄糖片；15 分鐘後再測。若意識不清、抽搐或不能吞嚥，旁人不要餵食並立即撥打 119。',
        sourceIds: ['niddkLowGlucose'],
      },
      {
        id: 'sick-day',
        title: '生病日：吃不下時也有風險',
        takeaway: '發燒、嘔吐、腹瀉或進食大減時，血糖與脫水風險都會改變。',
        detail: '有些藥物在吃不下、脫水或手術前需要暫停，但不同藥物規則不同。',
        action: '平時先保存「生病日用藥計畫」；若目前沒有，下一次領藥時請藥師協助逐項標示。',
        sourceIds: ['dailyMedDapagliflozin', 'niddkManaging'],
      },
    ],
  },
  {
    id: 'protect',
    title: '保護腎臟、心臟與血管',
    description: '糖尿病照護不只是一個血糖數字。',
    lessons: [
      {
        id: 'kidney-tests',
        title: '腎臟為什麼要抽血也要驗尿',
        takeaway: '一項看過濾能力，一項看腎臟是否漏蛋白。',
        detail: '估算腎絲球過濾率（eGFR）與尿白蛋白／肌酸酐比值（UACR）要各自看趨勢，不能互相取代。',
        action: '下次檢查確認兩項都有日期與數值；沒有定量結果時，不把試紙的「加號」當成定量比值。',
        sourceIds: ['niddkKidney'],
      },
      {
        id: 'medicine-purpose',
        title: '達格列淨：血糖、腎臟與心臟',
        takeaway: '同一顆藥可能同時有多個照護目的。',
        detail: '達格列淨可幫助排出葡萄糖，也能在合適成人降低部分腎臟與心臟事件風險；是否適合仍要看腎功能、體液狀況與其他用藥。',
        action: '核對藥袋上的學名、劑量與用法，並保存一份最新用藥清單。',
        sourceIds: ['dailyMedDapagliflozin'],
      },
      {
        id: 'blood-pressure-lipids',
        title: '血壓與血脂：一起降低血管風險',
        takeaway: '血糖、血壓與血脂會一起影響心臟、腦與腎臟。',
        detail: '只把血糖控制好，仍不能取代血壓、血脂與吸菸狀況的管理。',
        action: '把最近的血壓與血脂報告放在同一份紀錄，回診時一起檢視。',
        sourceIds: ['niddkManaging'],
      },
    ],
  },
  {
    id: 'daily',
    title: '把照護放進日常',
    description: '每次只練一件事，讓它真的做得到。',
    lessons: [
      {
        id: 'meal',
        title: '飲食：先動飲料與份量',
        takeaway: '不必把喜歡的食物全部禁止。',
        detail: '先減少含糖飲料與過大份量，通常比背很多禁忌更容易持續；腎功能下降時，蛋白質、鉀、磷或水分不應自行極端限制。',
        action: '這週先選一餐，拍下餐盤或記錄主食、蛋白質與蔬菜的份量。',
        sourceIds: ['niddkHealthyLiving', 'niddkKidney'],
      },
      {
        id: 'activity',
        title: '活動：從安全的小段開始',
        takeaway: '活動有助於血糖、血壓、睡眠與情緒。',
        detail: '活動量要配合體力、跌倒風險與心臟狀況；不需要第一天就完成很長時間。',
        action: '若行走安全，從一次 5 至 10 分鐘開始；不適合走路時可改做坐姿活動。',
        sourceIds: ['niddkHealthyLiving'],
      },
      {
        id: 'feet',
        title: '腳部：每天看，比等到會痛更早',
        takeaway: '神經感覺變差時，傷口可能不明顯疼痛。',
        detail: '每天看看腳底、趾縫與鞋內，有沒有水泡、破皮、紅腫或異物。',
        action: '今天洗澡後看一次雙腳；看不到腳底時可用鏡子或請家人協助。',
        sourceIds: ['niddkFeet'],
      },
      {
        id: 'eyes',
        title: '眼睛：沒症狀也要追蹤',
        takeaway: '糖尿病視網膜問題早期可能沒有明顯變化。',
        detail: '定期眼睛檢查能在視力明顯受影響前找到問題。',
        action: '確認上一次散瞳眼底檢查日期；若找不到紀錄，把它列入下次照護清單。',
        sourceIds: ['niddkEyes'],
      },
      {
        id: 'support',
        title: '壓力與支持：做不到不代表失敗',
        takeaway: '糖尿病疲乏、壓力或低落很常見，也會影響自我照護。',
        detail: '把最困難的一件事說清楚，通常比收到更多泛泛建議有幫助。',
        action: '完成這句話：「我現在最難持續的是＿＿＿，因為＿＿＿。」',
        sourceIds: ['niddkHealthyLiving'],
      },
    ],
  },
]

function buildPlan(context: PatientEducationContext): EducationPlan {
  const hba1c = findLatestObservation(context, HBA1C_LOINC)
  const egfrTrend = findEgfrTrend(context)
  const dapagliflozin = findDapagliflozin(context)
  const sections: EducationSection[] = []

  if (hba1c) sections.push(buildA1cSection(hba1c, context.age))
  if (egfrTrend.length > 0) sections.push(buildKidneySection(egfrTrend))
  if (dapagliflozin) {
    sections.push(buildDapagliflozinSection(dapagliflozin))
  }
  if (sections.length === 0) sections.push(buildFallbackSection())

  const actionChoices: EducationPlan['actionChoices'] = []
  if (hba1c) {
    actionChoices.push({
      id: 'symptoms',
      label: '先記下低血糖或不舒服的情況',
      detail: '記時間、症狀、當時血糖與是否吃飯。',
    })
  }
  if (egfrTrend.length > 0) {
    actionChoices.push({
      id: 'kidney',
      label: '整理腎功能的抽血與驗尿',
      detail: '找出最近日期與數值，缺少的檢查列入下次追蹤。',
    })
  }
  if (dapagliflozin) {
    actionChoices.push({
      id: 'medication',
      label: `核對${isForxigaProduct(dapagliflozin) ? '福適佳' : '達格列淨'}是否真的在使用`,
      detail: '看藥袋的學名、劑量與用法，不只看病歷處方。',
    })
  }
  if (actionChoices.length === 0) {
    actionChoices.push({
      id: 'daily-rhythm',
      label: '先選一個做得到的小改變',
      detail: '把一杯含糖飲料換成無糖，或安全地活動 5 至 10 分鐘。',
    })
  }

  const topicLabels = sections.map((section) => (
    section.id === 'a1c'
      ? '血糖'
      : section.id === 'kidney'
        ? '腎臟'
        : section.id === 'dapagliflozin'
          ? '藥物'
          : '日常行動'
  ))

  const lessonGroups = dapagliflozin
    ? LESSON_GROUPS
    : LESSON_GROUPS.map((group) => ({
        ...group,
        lessons: group.lessons.filter((lesson) => (
          lesson.id !== 'medicine-purpose'
        )),
      }))

  return {
    packId: 'dm',
    title: `你的糖尿病照護，先看這 ${sections.length} 件事`,
    intro: `這次先把${topicLabels.join('、')}說清楚，再選一個今天做得到的行動。`,
    eligibilityEvidence: context.diagnosisCodings
      .filter(hasType2DiabetesCode)
      .map((coding) => `${coding.code} ${coding.display ?? '第二型糖尿病'}`),
    facts: buildFacts(context, hba1c, egfrTrend, dapagliflozin),
    sections,
    actionChoices,
    lessonGroups,
    sources: SOURCES,
  }
}

export const DM_EDUCATION_PACK: DiseaseEducationPack = {
  id: 'dm',
  disease: '第二型糖尿病',
  version: '1.0.0-poc',
  isEligible: hasDmDiagnosis,
  buildPlan,
}
