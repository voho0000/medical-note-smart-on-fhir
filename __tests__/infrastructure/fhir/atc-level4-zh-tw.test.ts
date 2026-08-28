import {
  ATC_HIERARCHY,
  resolveAtcLevel4,
} from '@/vendor/nhi-fhir-bridge-nhi-drug-terminology/src/atc-hierarchy'

describe('ATC level 4 Taiwan display terminology', () => {
  it('maintains a display label for every 2026 level 4 category', () => {
    expect(ATC_HIERARCHY.level4).toHaveLength(921)

    const codes = new Set<string>()
    for (const [code, nameEn, nameZh] of ATC_HIERARCHY.level4) {
      expect(code).toMatch(/^[A-Z]\d{2}[A-Z]{2}$/)
      expect(nameEn.trim()).not.toBe('')
      expect(nameZh.trim()).not.toBe('')
      expect(codes.has(code)).toBe(false)
      codes.add(code)
    }
  })

  it('uses familiar Taiwan clinical names or abbreviations for common classes', () => {
    expect(resolveAtcLevel4('A02BC01')).toMatchObject({
      code: 'A02BC',
      nameEn: 'Proton pump inhibitors',
      nameZh: '氫離子幫浦抑制劑（PPI）',
    })
    expect(resolveAtcLevel4('A10BK01')).toMatchObject({
      code: 'A10BK',
      nameEn: 'Sodium-glucose co-transporter 2 (SGLT2) inhibitors',
      nameZh: 'SGLT2 抑制劑',
    })
    expect(resolveAtcLevel4('C09CA01')).toMatchObject({
      code: 'C09CA',
      nameEn: 'Angiotensin II receptor blockers (ARBs), plain',
      nameZh: 'ARB',
    })
    expect(resolveAtcLevel4('R03BA01')).toMatchObject({
      code: 'R03BA',
      nameEn: 'Glucocorticoids',
      nameZh: '吸入型類固醇（ICS）',
    })
    expect(resolveAtcLevel4('C07AB01')).toMatchObject({
      code: 'C07AB',
      nameEn: 'Beta blocking agents, selective',
      nameZh: '選擇性 β1 blocker',
    })
    expect(resolveAtcLevel4('R03AC01')).toMatchObject({
      code: 'R03AC',
      nameEn: 'Selective beta-2-adrenoreceptor agonists',
      nameZh: '選擇性 β2 agonist（SABA／LABA）',
    })
    expect(resolveAtcLevel4('S01EA01')).toMatchObject({
      code: 'S01EA',
      nameEn: 'Sympathomimetics in glaucoma therapy',
      nameZh: '眼用 α2 agonist',
    })
    expect(resolveAtcLevel4('S01ED01')).toMatchObject({
      code: 'S01ED',
      nameEn: 'Beta blocking agents',
      nameZh: '眼用 β blocker',
    })
  })
})
