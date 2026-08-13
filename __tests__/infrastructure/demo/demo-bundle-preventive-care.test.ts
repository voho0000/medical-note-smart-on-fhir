describe('bundled demo adult preventive-care report', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const bundle = require('../../../public/demo/demo-bundle.json') as {
    entry: Array<{
      resource: {
        resourceType: string
        id: string
        date?: string
        title?: string
        subject?: { reference?: string }
        type?: { coding?: Array<{ system?: string; code?: string }> }
        section?: Array<{ title?: string; entry?: Array<{ reference?: string }> }>
      }
    }>
  }

  const resources = bundle.entry.map((entry) => entry.resource)

  it('ships one complete, navigable adult preventive-care Composition', () => {
    const reports = resources.filter((resource) =>
      resource.resourceType === 'Composition' &&
      resource.type?.coding?.some((coding) =>
        coding.system === 'http://loinc.org' && coding.code === '75484-6'),
    )

    expect(reports).toHaveLength(1)
    const report = reports[0]
    expect(report).toMatchObject({
      id: 'demo-composition-1',
      date: '2018-02-12T00:00:00+08:00',
      title: '成人預防保健結果 — 2018-02-12',
      subject: { reference: 'Patient/demo-patient-1' },
    })
    expect(report.section?.map((section) => section.title)).toEqual([
      '一般檢查',
      '血壓檢查',
      '血脂肪檢查',
      '血糖檢查',
      '腎功能檢查',
      '尿酸檢查',
      '尿液檢查',
      '代謝症候群檢查',
      '肝功能檢查',
      'B 型肝炎檢查',
      'C 型肝炎檢查',
    ])

    const references = [...new Set(
      (report.section ?? []).flatMap((section) =>
        (section.entry ?? []).flatMap((entry) => entry.reference ? [entry.reference] : []),
      ),
    )]
    const resourceIds = new Set(resources.map((resource) => `${resource.resourceType}/${resource.id}`))

    expect(references).toHaveLength(21)
    expect(references.every((reference) => resourceIds.has(reference))).toBe(true)
  })
})
