// Does a medicine's ATC class fit the problem row it sits on? Only for
// conditions whose treatment classes are narrow enough to judge; every other
// problem gets no opinion. A mismatch tags the medicine 待核對 on the row — it
// is never removed (owner, 2026-10-05). On 2026-10-05 VGHBrain runs a model
// copied whole dispensing batches onto a row: bladder antispasmodics under
// CKD and hypertension, donepezil and artificial tears under glaucoma.

interface FitRule {
  problem: RegExp
  /** ATC prefixes of the classes that treat it. */
  atc: readonly string[]
}

const FIT_RULES: readonly FitRule[] = [
  { problem: /glaucoma|ocular hypertension|青光眼|高眼壓/i, atc: ['S01E'] },
  { problem: /diabet|糖尿病/i, atc: ['A10'] },
  { problem: /hypothyroid|甲狀腺(功能|機能)?低下/i, atc: ['H03A'] },
  { problem: /hyperthyroid|graves|甲狀腺(功能|機能)?亢進/i, atc: ['H03B', 'C07'] },
  { problem: /gout|hyperuric|痛風|高尿酸/i, atc: ['M04'] },
  { problem: /(?<!(pulmonary|ocular|portal|intracranial) )hypertension|高血壓/i, atc: ['C02', 'C03', 'C07', 'C08', 'C09'] },
  { problem: /hyperlipid|dyslipid|cholesterol|高血脂|膽固醇/i, atc: ['C10'] },
  {
    problem: /prostatic hyperplasia|\bBPH\b|overactive bladder|lower urinary tract|攝護腺(肥大|增生)|前列腺增生|膀胱過動|下泌尿道症狀/i,
    atc: ['G04B', 'G04C'],
  },
  { problem: /dementia|cognitive|alzheimer|失智|認知/i, atc: ['N06D'] },
  { problem: /constipation|便祕|便秘/i, atc: ['A06'] },
  { problem: /osteopor|骨質疏鬆/i, atc: ['M05B', 'H05A', 'A12A', 'A11CC', 'G03XC'] },
  {
    problem: /reflux|GERD|peptic|ulcer|gastritis|dyspepsia|胃食道逆流|消化性潰瘍|胃潰瘍|十二指腸潰瘍|胃炎|消化不良/i,
    atc: ['A02', 'A03'],
  },
  { problem: /anemi|貧血/i, atc: ['B03'] },
]

/**
 * true: the class treats the problem; false: it clearly does not; undefined:
 * the problem (or the medicine's class) is not one this can judge.
 */
export function medicationFitsProblem(problemLabel: string, atcCode: string | undefined): boolean | undefined {
  const atc = atcCode?.trim().toUpperCase()
  if (!atc) return undefined
  const rules = FIT_RULES.filter((rule) => rule.problem.test(problemLabel))
  if (rules.length === 0) return undefined
  return rules.some((rule) => rule.atc.some((prefix) => atc.startsWith(prefix)))
}
