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

    it('appends the SOURCE LIST and asks for source keys when a catalog is given', () => {
      const withCatalog = generateSafetyAlertsUseCase.buildMessages({
        clinicalContext: 'x',
        locale: 'en',
        catalog: [
          { key: 'L3', resourceType: 'DiagnosticReport', resourceId: 'r1', display: 'eGFR', date: '2026-06-02', organization: '甲醫院' },
          { key: 'D1', resourceType: 'DocumentReference', resourceId: 'd1', display: '出院病摘', date: '2026-05-18', organization: '甲醫院' },
        ],
      })
      expect(withCatalog[0].content).toContain('"sources"')
      expect(withCatalog[1].content).toContain('SOURCE LIST')
      expect(withCatalog[1].content).toContain('[L3] DiagnosticReport | 2026-06-02 | 甲醫院 | eGFR')
      expect(withCatalog[1].content).toContain('[D1] DocumentReference | 2026-05-18 | 甲醫院 | 出院病摘')
      expect(withCatalog[0].content).toContain('cite its matching D# source key')
      expect(withCatalog[0].content).toContain('valid evidence even if there is no separate endoscopy')
      expect(withCatalog[0].content).toContain('does NOT prove that a particular procedure was performed')
    })

    it('omits the SOURCE LIST when no catalog is provided', () => {
      const msgs = generateSafetyAlertsUseCase.buildMessages({ clinicalContext: 'x', locale: 'en' })
      expect(msgs[1].content).not.toContain('SOURCE LIST')
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
      // No sources cited → defaults to [] (never undefined, so the UI can map).
      expect(r!.alerts[0].sources).toEqual([])
    })

    it('keeps cited source keys on the alert', () => {
      const r = generateSafetyAlertsUseCase.parseScanResult(
        JSON.stringify({
          scannedCount: 3,
          alerts: [
            { severity: 'high', title: '腎劑量', detail: 'eGFR 32', evidence: ['eGFR 32'], sources: ['L3', 'M2'], category: 'renal' },
          ],
        }),
      )
      expect(r!.alerts[0].sources).toEqual(['L3', 'M2'])
    })

    it('keeps a document-supported diagnosis but marks an unsupported procedure assertion', () => {
      const catalog = [{
        key: 'D1',
        resourceType: 'DocumentReference',
        resourceId: 'doc-1',
        display: '出院病摘',
        getContentText: () => '出院診斷：胃潰瘍。',
      }]
      const diagnosisOnly = generateSafetyAlertsUseCase.parseScanResult(JSON.stringify({
        alerts: [{
          severity: 'medium',
          title: '胃潰瘍病史',
          detail: '出院病摘記載胃潰瘍。',
          sources: ['D1'],
          category: 'bleeding',
        }],
      }), catalog)
      expect(diagnosisOnly!.alerts[0].unsupportedSourceKeys).toEqual([])

      const unsupportedProcedure = generateSafetyAlertsUseCase.parseScanResult(JSON.stringify({
        alerts: [{
          severity: 'medium',
          title: '胃鏡結果',
          detail: '胃鏡顯示胃潰瘍。',
          sources: ['D1'],
          category: 'bleeding',
        }],
      }), catalog)
      expect(unsupportedProcedure!.alerts[0].unsupportedSourceKeys).toEqual(['D1'])
    })

    it('accepts a procedure assertion when the cited document text names it', () => {
      const catalog = [{
        key: 'D1',
        resourceType: 'DocumentReference',
        resourceId: 'doc-1',
        display: '出院病摘',
        getContentText: () => 'PANENDOSCOPY showed gastric ulcer.',
      }]
      const result = generateSafetyAlertsUseCase.parseScanResult(JSON.stringify({
        alerts: [{
          severity: 'medium',
          title: '胃鏡結果',
          detail: '胃鏡顯示胃潰瘍。',
          sources: ['D1'],
          category: 'bleeding',
        }],
      }), catalog)
      expect(result!.alerts[0].unsupportedSourceKeys).toEqual([])
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
