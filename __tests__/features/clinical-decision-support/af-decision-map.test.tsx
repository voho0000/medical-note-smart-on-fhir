import { applyAfCalculatorResults } from '@/features/clinical-decision-support/utils/af-calculators'
import { fireEvent, render, screen, within } from '@testing-library/react'
import {
  ATRIAL_FIBRILLATION_GUIDELINE_PACK as PACK,
  type CdssPatientProfile,
} from '@voho0000/personalized-care'
import { ClinicalDecisionSupportView } from '@/features/clinical-decision-support/renderers/ClinicalDecisionSupportView'
import { AF_DECISION_MAP_GROUPS } from '@/features/clinical-decision-support/renderers/atrial-fibrillation-decision-map'
import { buildDecisionMap } from '@/features/clinical-decision-support/renderers/heart-failure-decision-map'

const known: CdssPatientProfile = {
  id: 'synthetic-af-map',
  evaluatedAt: '2026-09-12T00:00:00+08:00',
  demographics: { sex: 'male' },
  facts: {
    age: { numericValue: 78, zh: '78 歲', en: '78 years' },
    atrialFibrillationDiagnosis: { zh: 'I48.0', en: 'I48.0' },
    coronaryArteryDiagnosis: { zh: 'I25.10', en: 'I25.10' },
  },
  afMedicationRegimens: [{ ingredient: 'flecainide', name: 'flecainide', sources: [] }],
}
const suspected: CdssPatientProfile = {
  id: 'synthetic-af-map-suspected',
  evaluatedAt: '2026-09-12T00:00:00+08:00',
  demographics: { sex: 'female' },
  facts: { age: { numericValue: 72, zh: '72 歲', en: '72 years' } },
}
const build = (p: CdssPatientProfile) => PACK.build({ profile: applyAfCalculatorResults(p), locale: 'zh-TW' })
const points = AF_DECISION_MAP_GROUPS.flatMap((g) => g.points)

describe('AF decision map (spec DP-00–DP-24)', () => {
  it('lists the 25 specification points once each, in the six AF-CARE groups', () => {
    expect([...points.map((p) => p.dp)].sort()).toEqual(Array.from({ length: 25 }, (_, i) => `DP-${String(i).padStart(2, '0')}`))
    expect(new Set(points.map((p) => p.dp)).size).toBe(25)
    expect(AF_DECISION_MAP_GROUPS.map((g) => g.marker)).toEqual(['⓪', '①', 'A', 'R', 'C', 'E'])
  })
  it('places every card the pack writes under at least one point, for known and suspected AF', () => {
    const mapped = new Set(points.flatMap((p) => p.moduleIds))
    for (const p of [known, suspected]) {
      for (const r of build(p).recommendations) expect(mapped).toContain(r.id)
    }
  })
  it('does not borrow a state for points without a rule of their own', () => {
    const map = buildDecisionMap(build(known), AF_DECISION_MAP_GROUPS)
    const state = (dp: string) => map.groups.flatMap((g) => g.cells).find((c) => c.point.dp === dp)!.state
    for (const dp of ['DP-16', 'DP-22', 'DP-24']) expect(state(dp)).toBe('not-included')
    expect(state('DP-19')).toBe('actionable')
    expect(map.total).toBe(24)
  })
  it('confirmed AF puts diagnosis and screening last, for reference; suspected AF keeps it after the gate', () => {
    const { afDecisionMapGroupsFor } = jest.requireActual('@/features/clinical-decision-support/renderers/atrial-fibrillation-decision-map')
    const followUp = afDecisionMapGroupsFor(true)
    expect(followUp[followUp.length - 1].label.zh).toContain('已確診 AF：供回顧')
    expect(afDecisionMapGroupsFor(false)[1].id).toBe('af-diagnosis')
  })
  it('suspected AF: treatment points are not applicable, diagnosis points carry the work', () => {
    const map = buildDecisionMap(build(suspected), AF_DECISION_MAP_GROUPS)
    const state = (dp: string) => map.groups.flatMap((g) => g.cells).find((c) => c.point.dp === dp)!.state
    expect(state('DP-09')).toBe('not-applicable')
    expect(['actionable', 'review']).toContain(state('DP-06'))
  })
  it('suspected AF: groups where nothing applies fold to one line and open on request', () => {
    render(
      <ClinicalDecisionSupportView
        result={build(suspected)}
        locale="zh-TW"
        layout="flow"
        patientId={suspected.id}
        afAnswers={{}}
        onAfAnswer={() => {}}
        profileFacts={suspected.facts}
      />,
    )
    fireEvent.click(screen.getByTestId('cdss-hf-decision-map-toggle'))
    const folded = screen.getByTestId('cdss-hf-map-folded-af-a')
    expect(folded).toHaveTextContent('本次不適用（10 項）')
    expect(screen.queryByTestId('cdss-hf-map-cell-DP-09')).not.toBeInTheDocument()
    expect(screen.getByTestId('cdss-hf-map-cell-DP-06')).toBeInTheDocument()
    fireEvent.click(within(folded).getByRole('button', { name: '展開' }))
    expect(screen.getByTestId('cdss-hf-map-cell-DP-09')).toBeInTheDocument()
  })
  it('renders folded on the AF page, opens a point, and jumps to its card', async () => {
    const scroll = jest.fn()
    const original = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = scroll
    try {
      render(
        <ClinicalDecisionSupportView
          result={build(known)}
          locale="zh-TW"
          layout="flow"
          patientId={known.id}
          afAnswers={{}}
          onAfAnswer={() => {}}
          profileFacts={known.facts}
        />,
      )
      const toggle = screen.getByTestId('cdss-hf-decision-map-toggle')
      expect(toggle).toHaveAttribute('aria-expanded', 'false')
      expect(screen.getByTestId('cdss-hf-decision-map-summary')).toHaveTextContent('24 個決策點')
      expect(screen.getByTestId('cdss-hf-decision-map-actionable')).toHaveTextContent('需處理：')
      expect(screen.getByTestId('cdss-hf-decision-map-actionable')).toHaveTextContent('DP-19 抗心律不整藥安全')
      fireEvent.click(toggle)
      fireEvent.click(screen.getByTestId('cdss-hf-map-cell-DP-19'))
      const region = screen.getByTestId('cdss-hf-map-region-DP-19')
      fireEvent.click(within(region).getAllByRole('button', { name: '到清單中的此卡記錄決定' })[0])
      await new Promise((r) => setTimeout(r, 20))
      expect(scroll).toHaveBeenCalled()
      const row = screen.getByTestId('cdss-af-action-af-antiarrhythmic-drug-safety')
      expect(within(row).getAllByRole('button', { expanded: true }).length).toBeGreaterThan(0)
    } finally {
      Element.prototype.scrollIntoView = original
    }
  })
})
