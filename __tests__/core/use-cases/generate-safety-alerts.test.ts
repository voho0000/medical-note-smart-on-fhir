import { generateSafetyAlertsUseCase } from '@/src/core/use-cases/safety-alerts/generate-safety-alerts.use-case'

describe('GenerateSafetyAlertsUseCase', () => {
  describe('buildMessages', () => {
    it('builds system + user with schema, context, and language directive', () => {
      const msgs = generateSafetyAlertsUseCase.buildMessages({
        clinicalContext: 'eGFR 32; Metformin 1000mg',
        locale: 'zh-TW',
      })
      expect(msgs).toHaveLength(2)
      expect(msgs[0].role).toBe('system')
      expect(msgs[0].content).toContain('JSON')
      expect(msgs[0].content).toContain('繁體中文')
      expect(msgs[1].role).toBe('user')
      expect(msgs[1].content).toContain('eGFR 32')
    })

    it('uses English directive for en locale', () => {
      const msgs = generateSafetyAlertsUseCase.buildMessages({ clinicalContext: 'x', locale: 'en' })
      expect(msgs[0].content).toContain('English')
    })

    it('defaults to the clinician prompt and switches to the patient prompt by audience', () => {
      const medical = generateSafetyAlertsUseCase.buildMessages({ clinicalContext: 'x', locale: 'en' })
      const patient = generateSafetyAlertsUseCase.buildMessages({ clinicalContext: 'x', locale: 'en', audience: 'patient' })
      // Clinician (default) speaks to healthcare professionals; patient version
      // is layperson-facing and must forbid self-directed medication changes.
      expect(medical[0].content).toContain('healthcare professionals')
      expect(patient[0].content).toContain('layperson')
      expect(patient[0].content).toMatch(/NEVER tell the patient to start, stop, or change/i)
      expect(patient[0].content).not.toContain('healthcare professionals')
    })
  })

  describe('parseScanResult', () => {
    const valid = JSON.stringify({
      scannedCount: 5,
      alerts: [
        { severity: 'high', title: '過敏衝突', detail: '對 Penicillin 過敏但處方 Amoxicillin', evidence: ['Penicillin'], category: 'allergy' },
      ],
    })

    it('parses clean JSON and assigns ids', () => {
      const r = generateSafetyAlertsUseCase.parseScanResult(valid)
      expect(r).not.toBeNull()
      expect(r!.scannedCount).toBe(5)
      expect(r!.alerts).toHaveLength(1)
      expect(r!.alerts[0].id).toBe('sa-0')
      expect(r!.alerts[0].category).toBe('allergy')
    })

    it('strips markdown fences / surrounding prose', () => {
      const r = generateSafetyAlertsUseCase.parseScanResult('Sure:\n```json\n' + valid + '\n```\nDone.')
      expect(r).not.toBeNull()
      expect(r!.alerts).toHaveLength(1)
    })

    it('normalises an off-list category to "other"', () => {
      const r = generateSafetyAlertsUseCase.parseScanResult(
        JSON.stringify({ alerts: [{ severity: 'low', title: 'x', detail: 'y', category: 'weird' }] }),
      )
      expect(r!.alerts[0].category).toBe('other')
    })

    it('handles an empty alert list', () => {
      const r = generateSafetyAlertsUseCase.parseScanResult('{"scannedCount":10,"alerts":[]}')
      expect(r!.alerts).toEqual([])
      expect(r!.scannedCount).toBe(10)
    })

    it('returns null on non-JSON / empty', () => {
      expect(generateSafetyAlertsUseCase.parseScanResult('not json at all')).toBeNull()
      expect(generateSafetyAlertsUseCase.parseScanResult('')).toBeNull()
    })

    it('returns null when the schema fails (bad severity enum)', () => {
      expect(
        generateSafetyAlertsUseCase.parseScanResult('{"alerts":[{"severity":"critical","title":"x","detail":"y"}]}'),
      ).toBeNull()
    })
  })
})
