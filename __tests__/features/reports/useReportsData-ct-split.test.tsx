// useReportsData — CT multi-region split + bridge-dup detection.
//
// Behaviour locked here:
//   A. Single CT DR → one merged row (existing panel-merge path).
//   B. Multi CT DR same (code/date/hospital) with DISTINCT narratives
//      (head + chest) → split, so downstream MultiRegionStudyCard can
//      render numbered sub-cards.
//   C. Multi CT DR with DUPLICATE narratives (only whitespace differs:
//      "obtained.Coronal" vs "obtained. Coronal") → MERGE as a single
//      row. Catches the bridge-side content-hash dedup miss without
//      surfacing a fake "multi-region" group card to the user.
//   D. Non-CT (X-ray, US, ECG…) multi-DR groups → always merge as
//      before; the upstream split is intentionally CT-only because
//      other imaging channels duplicate single exams.
import { renderHook } from '@testing-library/react'
import { LanguageProvider } from '@/src/application/providers/language.provider'
import { AudienceProvider } from '@/src/application/providers/audience.provider'
import { useReportsData } from '@/features/clinical-summary/reports/hooks/useReportsData'

const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <LanguageProvider>
    <AudienceProvider>{children}</AudienceProvider>
  </LanguageProvider>
)

const HEAD_NECK = 'Computed Tomography of Head and neck Without Enhancement Show:Methods:Axial 5 mm sections from the skull base to the upper chest, followed by reconstructed coronal sections developed.Findings: 1. Patchy consolidation at BULs. 2. The oral floor muscles are normally developed and bilaterally symmetrical.'
const CHEST = 'Computed Tomography of Chest Without Enhancement Show:\r\rMain Findings ＆ Impressions:\r1. Diffuse patchy GGO densities, considered as primarily atypical pneumonia. 2. Mild bronchiectasis.'
const BRAIN_NO_SPACE = 'Computed Tomography of Brain Without Enhancement Show:Method:Axial noncontrast 5 mm sections from the skull base to the vertex were obtained.Coronal reconstruction images also obtained.Impression:1. No apparent ICH 2. Senile cortical atrophy.'
const BRAIN_WITH_SPACE = 'Computed Tomography of Brain Without Enhancement Show:Method: Axial noncontrast 5 mm sections from the skull base to the vertex were obtained. Coronal reconstruction images also obtained.Impression:1. No apparent ICH 2. Senile cortical atrophy.'
const XRAY = 'Radiography of Chest P-A View(Standing) Show:Pleural effusion at Rt chest with obliteration of corresponding lateral CP angle.'
// Real bridge dup case (2/8/2025 Abdomen CT) — differs in inter-word
// spaces ("aortaReticular" vs "aorta Reticular") AND full-width vs
// half-width slash ("S／P" vs "S/P"). The aggressive Unicode-letter-
// only normalisation collapses both into the same key.
const ABDOMEN_RUN_ON = 'Computed Tomography of Abdomen With and Without Enhancement Show:1.Chest:Mild cardiomegaly with calcification of coronary arteries and aortaReticular infiltration with multiple ground glass patches in bil. lower lungsPatch consolidation in RLLNo definite pulmonary nodule in bil. visible lower lungs.S／P metallic stents in bil. iliac veins'
const ABDOMEN_SPACED = 'Computed Tomography of Abdomen With and Without Enhancement Show:1.Chest: Mild cardiomegaly with calcification of coronary arteries and aorta Reticular infiltration with multiple ground glass patches in bil. lower lungs Patch consolidation in RLL No definite pulmonary nodule in bil. visible lower lungs. S/P metallic stents in bil. iliac veins'

function dr(over: any) {
  return {
    id: over.id,
    code: { text: over.codeText ?? '電腦斷層造影  －  無造影劑' },
    effectiveDateTime: over.date ?? '2025-02-14T00:00:00+08:00',
    performer: [{ display: over.inst ?? '長庚嘉義' }],
    conclusion: over.conclusion ?? '',
    presentedForm: over.images ?? [],
    ...over,
  }
}

function run(drs: any[]) {
  const { result } = renderHook(() => useReportsData(drs), { wrapper: Wrapper })
  return result.current.reportRows
}

describe('useReportsData — CT multi-region split', () => {
  it('keeps an index-only imaging DiagnosticReport navigable without inventing findings', () => {
    const rows = run([
      dr({
        id: 'dr-index-only',
        codeText: '超音波導引(為組織切片，抽吸、注射等)',
        conclusion: '',
        _observations: [],
      }),
    ])

    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe('dr-index-only')
    expect(rows[0].diagnosticReportIds).toEqual(['dr-index-only'])
    expect(rows[0].obs).toEqual([
      expect.objectContaining({
        code: { text: 'Report Metadata' },
        valueString: '來源未提供報告內文或結果',
      }),
    ])
  })

  it('A. single CT DR collapses to one row (no group)', () => {
    const rows = run([dr({ id: 'd1', conclusion: HEAD_NECK })])
    expect(rows).toHaveLength(1)
    expect(rows[0].groupedRows).toBeUndefined()
  })

  it('B. CT with two distinct body parts (head + chest) splits into a group', () => {
    const rows = run([
      dr({ id: 'd1', conclusion: HEAD_NECK }),
      dr({ id: 'd2', conclusion: CHEST }),
    ])
    // The CT split produces 2 individual rows upstream; downstream
    // multi-region grouping (applied in ReportsCard for the imaging tab)
    // collapses them into one synthetic group row. Here we verify the
    // upstream split first — 2 rows in the flat list means the split
    // happened.
    expect(rows).toHaveLength(2)
    expect(rows.every((r) => !r.groupedRows)).toBe(true) // not pre-grouped at this layer
  })

  it('C. CT with duplicate narratives (only whitespace differs) MERGES into one row', () => {
    const rows = run([
      dr({ id: 'd1', conclusion: BRAIN_NO_SPACE }),
      dr({ id: 'd2', conclusion: BRAIN_WITH_SPACE }),
      dr({ id: 'd3', images: [{ contentType: 'image/jpeg', size: 35000 }] }),
    ])
    // Bridge sent 3 DRs (2 dup brain + 1 image) — the user should NOT
    // see a fake "multi-region" card; the dup-detection collapses them
    // back to the existing panel merge path. One row total.
    expect(rows).toHaveLength(1)
    expect(rows[0].groupedRows).toBeUndefined()
  })

  it('D. non-CT (X-ray) multi-DR groups always merge — bridge dup is hidden by the panel merge', () => {
    const rows = run([
      dr({ id: 'd1', codeText: '胸部X光  P→A', conclusion: XRAY }),
      dr({ id: 'd2', codeText: '胸部X光  P→A', conclusion: XRAY }),
      dr({ id: 'd3', codeText: '胸部X光  P→A', conclusion: XRAY }),
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0].groupedRows).toBeUndefined()
    expect(rows[0].diagnosticReportIds).toEqual(['d1', 'd2', 'd3'])
  })

  it('C-ext: Abdomen CT with run-on words vs spaced version (bridge dup, 2/8/2025) MERGES', () => {
    // Both narratives have the same Findings/Impressions; the only
    // bytes differ are inter-word spaces ("aortaReticular" vs "aorta
    // Reticular") and the slash width ("S／P" vs "S/P"). Bridge should
    // have caught this; until it does, the SMART app suppresses the
    // false multi-region card via NFKC + strict-prefix dedup.
    const rows = run([
      dr({ id: 'd1', conclusion: ABDOMEN_RUN_ON }),
      dr({ id: 'd2', conclusion: ABDOMEN_SPACED }),
      dr({ id: 'd3', images: [{ contentType: 'image/jpeg', size: 74000 }] }),
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0].groupedRows).toBeUndefined()
    // Bridge sent 2 duplicate narratives; dedup keeps 1, count is 1.
    expect(rows[0].bridgeDupCount).toBe(1)
  })

  it('C-truncation: truncated narrative is detected as a prefix dup of the full one', () => {
    // Simulates the 2/8/2025 case: report ① ends mid-item-14, report ②
    // includes the full item-14 + an item-15. Strict-prefix logic must
    // (a) detect the dup (prefix of longer one) and (b) keep the LONGER
    // version so the user sees the full report. The shorter version's
    // content is fully contained in the longer one — no information lost.
    const TRUNCATED = 'Computed Tomography of Abdomen Show: Findings: 1. Mild cardiomegaly. 2. Liver normal.'
    const FULL = TRUNCATED + ' 3. Kidneys normal. 4. No abnormal lymphadenopathy. Impression: Unremarkable abdomen.'
    const rows = run([
      dr({ id: 'short', conclusion: TRUNCATED }),
      dr({ id: 'full',  conclusion: FULL }),
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0].bridgeDupCount).toBe(1)
    // obs[0].valueString carries the kept narrative — must be the FULL one
    const narrative = rows[0].obs[0]?.valueString || ''
    expect(narrative).toContain('Kidneys normal')
    expect(narrative).toContain('No abnormal lymphadenopathy')
  })

  it('NFKC: full-width slash difference (S／P vs S/P) is collapsed', () => {
    const A = 'Computed Tomography of Chest Show: S／P metallic stents. Findings: clear.'
    const B = 'Computed Tomography of Chest Show: S/P metallic stents. Findings: clear.'
    const rows = run([
      dr({ id: 'a', conclusion: A }),
      dr({ id: 'b', conclusion: B }),
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0].bridgeDupCount).toBe(1)
  })

  it('two distinct CT narratives (head vs chest) are NOT prefix-dups → split survives', () => {
    // Sanity: strict-prefix must NEVER merge genuinely different studies.
    const rows = run([
      dr({ id: 'h', conclusion: HEAD_NECK }),
      dr({ id: 'c', conclusion: CHEST }),
    ])
    // Distinct narratives → upstream split path → 2 individual rows.
    expect(rows).toHaveLength(2)
    expect(rows.every((r) => !r.bridgeDupCount)).toBe(true)
  })

  it('B-ext: CT with two distinct narratives + 2 image-only DRs still splits all four', () => {
    const rows = run([
      dr({ id: 'd1', conclusion: HEAD_NECK }),
      dr({ id: 'd2', conclusion: CHEST }),
      dr({ id: 'd3', images: [{ contentType: 'image/jpeg', size: 58000 }] }),
      dr({ id: 'd4', images: [{ contentType: 'image/jpeg', size: 26000 }] }),
    ])
    // 4 distinct rows upstream → downstream grouping collapses to 1
    // amber MultiRegionStudyCard with 2 narrative sub-cards + 2 image
    // sub-cards. Here we just check the upstream split.
    expect(rows).toHaveLength(4)
  })
})
