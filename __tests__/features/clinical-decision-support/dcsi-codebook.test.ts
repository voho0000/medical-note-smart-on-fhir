import {
  DCSI_CODEBOOK_VERSION,
  DCSI_GLASHEEN_2017_SUPPLEMENT_URL,
  DCSI_ICD10_RULES,
} from '@/features/clinical-decision-support/risk-stratification/dcsi-codebook'
import type {
  DcsiDomainId,
} from '@/features/clinical-decision-support/types'

function scoreFor(code: string, domain: DcsiDomainId): 1 | 2 | null {
  const scores = DCSI_ICD10_RULES
    .filter((rule) => rule.domain === domain && rule.code.test(code))
    .map((rule) => rule.score)
  return scores.length > 0 ? Math.max(...scores) as 1 | 2 : null
}

describe('Glasheen 2017 DCSI ICD-10 codebook', () => {
  it('records the exact official supplementary source and a new governed version', () => {
    expect(DCSI_CODEBOOK_VERSION).toBe('dcsi-icd10-fhir-2017-v2')
    expect(DCSI_GLASHEEN_2017_SUPPLEMENT_URL).toBe(
      'https://ars.els-cdn.com/content/image/1-s2.0-S105687271631042X-mmc1.docx',
    )
  })

  it.each([
    // Appendix A-1: Ophthalmic
    ['E11.3413', 'ophthalmic', 2],
    ['H35.351', 'ophthalmic', 1],
    ['H35.9', 'ophthalmic', 1],
    ['H43.11', 'ophthalmic', 2],

    // Appendix A-2: Nephropathy
    ['N00.9', 'nephropathy', 1],
    ['N18.9', 'nephropathy', 1],

    // Appendix A-3: Neuropathy
    ['G90.09', 'neuropathy', 1],
    ['G90.8', 'neuropathy', 1],
    ['G90.9', 'neuropathy', 1],
    ['G56.03', 'neuropathy', 1],
    ['G57.93', 'neuropathy', 1],
    ['G90.01', 'neuropathy', 1],
    ['I95.1', 'neuropathy', 1],
    ['K31.84', 'neuropathy', 1],
    ['K59.1', 'neuropathy', 1],
    ['N31.9', 'neuropathy', 1],
    ['S04.9', 'neuropathy', 1],

    // Appendix A-4: Cerebrovascular
    ['I65.23', 'cerebrovascular', 2],
    ['I66.9', 'cerebrovascular', 2],
    ['I67.81', 'cerebrovascular', 2],

    // Appendix A-5: Cardiovascular
    ['I25.2', 'cardiovascular', 2],
    ['I47.20', 'cardiovascular', 2],
    ['I70.251', 'cardiovascular', 2],
    ['I70.261', 'cardiovascular', 2],

    // Appendix A-6: Peripheral vascular disease
    ['E11.621', 'peripheral-vascular', 1],
    ['I73.89', 'peripheral-vascular', 1],
    ['S91.301A', 'peripheral-vascular', 1],
    ['I96', 'peripheral-vascular', 2],
  ] as const)(
    'scores previously omitted %s in %s as %i',
    (code, domain, expectedScore) => {
      expect(scoreFor(code, domain)).toBe(expectedScore)
    },
  )

  it('keeps cross-domain atherosclerosis scoring from Appendix A-5 and A-6', () => {
    expect(scoreFor('I70.211', 'cardiovascular')).toBe(1)
    expect(scoreFor('I70.211', 'peripheral-vascular')).toBe(1)
    expect(scoreFor('I70.239', 'cardiovascular')).toBe(1)
    expect(scoreFor('I70.239', 'peripheral-vascular')).toBeNull()
    expect(scoreFor('I70.261', 'cardiovascular')).toBe(2)
    expect(scoreFor('I70.261', 'peripheral-vascular')).toBeNull()
  })

  it('scores diabetic foot ulcer as one point and excludes Appendix A-8 codes', () => {
    expect(scoreFor('E11.621', 'peripheral-vascular')).toBe(1)
    expect(scoreFor('E11.621', 'peripheral-vascular')).not.toBe(2)
    expect(scoreFor('E11.622', 'peripheral-vascular')).toBeNull()
  })

  it.each([
    ['H35.379', 'ophthalmic'],
    ['N17.9', 'nephropathy'],
    ['G63.2', 'neuropathy'],
    ['I60.9', 'cerebrovascular'],
    ['I69.30', 'cerebrovascular'],
    ['I11.0', 'cardiovascular'],
    ['I13.0', 'cardiovascular'],
  ] as const)(
    'does not present non-Appendix A-1–A-7 diagnosis %s as published %s scoring',
    (code, domain) => {
      expect(scoreFor(code, domain)).toBeNull()
    },
  )
})
