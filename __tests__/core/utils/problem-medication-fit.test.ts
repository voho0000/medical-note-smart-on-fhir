import { medicationFitsProblem } from '@/src/core/utils/problem-medication-fit.utils'

describe('medicationFitsProblem', () => {
  it.each([
    ['Primary open-angle glaucoma', 'N06DA02', false], // donepezil
    ['Primary open-angle glaucoma', 'S01XA20', false], // artificial tears
    ['Primary open-angle glaucoma', 'S01ED51', true], // timolol combination
    ['Hypertension', 'G04BD04', false], // oxybutynin
    ['Hypertension', 'C09CA01', true],
    ['Benign prostatic hyperplasia with overactive bladder', 'G04BD12', true], // mirabegron
    ['Benign prostatic hyperplasia', 'N02BE01', false], // acetaminophen
    ['Type 2 diabetes mellitus', 'A10BK01', true],
    ['第二型糖尿病', 'A10BK01', true],
    ['Hypothyroidism', 'H03AA01', true],
    ['Gastroesophageal reflux disease and gastritis', 'A03FA03', true], // domperidone
  ] as const)('%s with %s → %s', (problem, atc, expected) => {
    expect(medicationFitsProblem(problem, atc)).toBe(expected)
  })

  it('has no opinion on a problem whose treatments are too broad to judge', () => {
    expect(medicationFitsProblem('Chronic kidney disease stage 3b', 'G04BD04')).toBeUndefined()
    expect(medicationFitsProblem('Delirium', 'N06DA02')).toBeUndefined()
  })

  it('has no opinion without an ATC code', () => {
    expect(medicationFitsProblem('Primary open-angle glaucoma', undefined)).toBeUndefined()
  })

  it('does not read pulmonary or ocular hypertension as systemic hypertension', () => {
    expect(medicationFitsProblem('Pulmonary hypertension', 'G04BD04')).toBeUndefined()
    // Ocular hypertension is judged as glaucoma care.
    expect(medicationFitsProblem('Ocular hypertension', 'S01ED01')).toBe(true)
  })

  it('accepts a class that fits any condition a combined label names', () => {
    expect(medicationFitsProblem('Hyperuricemia and gout with hypertension', 'C09CA01')).toBe(true)
  })
})
