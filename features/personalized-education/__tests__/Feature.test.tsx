import { fireEvent, render, screen, within } from '@testing-library/react'
import PersonalizedEducationFeature from '../Feature'
import { buildPersonalizedEducation } from '../engine'
import type { PatientEducationContext } from '../types'

const context: PatientEducationContext = {
  patientKey: 'patient-1',
  age: 94,
  diagnosisCodings: [
    {
      system: 'http://hl7.org/fhir/sid/icd-10-cm',
      code: 'E11.22',
    },
  ],
  observations: [
    {
      id: 'hba1c',
      codings: [{ system: 'http://loinc.org', code: '4548-4' }],
      value: 6.6,
      unit: '%',
      date: '2026-06-02',
      status: 'final',
    },
    ...[36.3, 35, 33, 32].map((value, index) => ({
      id: `egfr-${index}`,
      codings: [{ system: 'http://loinc.org', code: '77147-7' }],
      value,
      unit: 'mL/min/1.73m2',
      date: `2026-0${index + 1}-02`,
      status: 'final',
    })),
  ],
  medications: [
    {
      id: 'forxiga',
      codings: [
        {
          system: 'https://twcore.mohw.gov.tw/CodeSystem/nhi-drug-code',
          code: 'BC26476100',
        },
      ],
      status: 'active',
      authoredOn: '2026-06-25',
      source: '處方紀錄',
    },
  ],
}

describe('PersonalizedEducationFeature', () => {
  it('shows the useful patient story immediately without model setup', () => {
    render(
      <PersonalizedEducationFeature
        plan={buildPersonalizedEducation(context).plan}
        audience="patient"
      />,
    )

    expect(
      screen.getByRole('heading', {
        name: '你的糖尿病衛教單',
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '列印重點版' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '大字版' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByText(/使用 \d+ 筆病歷依據/)).not.toBeInTheDocument()
    expect(screen.queryByText(/不使用姓名、病歷號/)).not.toBeInTheDocument()
    expect(screen.queryByText(/選擇模型|Gemini|產生內容/)).not.toBeInTheDocument()
  })

  it('offers a concise mode and a teaching-focused detailed mode', () => {
    render(
      <PersonalizedEducationFeature
        plan={buildPersonalizedEducation(context).plan}
        audience="patient"
        age={94}
      />,
    )

    const summaryButton = screen.getByRole('button', {
      name: '重點版',
    })
    const detailedButton = screen.getByRole('button', {
      name: '詳細解說版',
    })
    const modules = screen.getByTestId('education-modules')

    expect(summaryButton).toHaveAttribute('aria-pressed', 'true')
    expect(detailedButton).toHaveAttribute('aria-pressed', 'false')
    expect(modules).toHaveAttribute('data-reading-mode', 'summary')
    expect(
      modules.querySelectorAll('article[data-testid^="education-module-"]'),
    ).toHaveLength(4)

    fireEvent.click(detailedButton)

    expect(summaryButton).toHaveAttribute('aria-pressed', 'false')
    expect(detailedButton).toHaveAttribute('aria-pressed', 'true')
    expect(modules).toHaveAttribute('data-reading-mode', 'detailed')
    expect(screen.getByRole('heading', { name: '完整理解這些照護主題' })).toBeInTheDocument()
    expect(
      modules.querySelectorAll('article[data-testid^="education-module-"]'),
    ).toHaveLength(24)

    const a1cModule = screen.getByTestId('education-module-a1c')
    expect(a1cModule).toHaveTextContent('先理解這件事')
    expect(a1cModule).toHaveTextContent('為什麼重要')
    expect(a1cModule).toHaveTextContent('和你目前資料的關係')
    expect(a1cModule).toHaveTextContent('實際可以怎麼做')
    expect(a1cModule).toHaveTextContent('看完確認一下')
    expect(a1cModule).toHaveTextContent(
      'HbA1c 和今天早上量的血糖差在哪裡？為什麼數字漂亮還是要講低血糖的經驗？',
    )
    expect(screen.getByTestId('education-module-diabetes-basics')).toBeInTheDocument()
    expect(screen.getByTestId('education-module-older-adults')).toBeInTheDocument()
  })

  it('limits browser printing to the education handout root', () => {
    const printSpy = jest.spyOn(window, 'print').mockImplementation(() => {
      expect(document.body).toHaveClass('printing-education-handout')
      const printContainer = document.querySelector('[data-education-print-container]')
      expect(printContainer).toBeInTheDocument()
      expect(printContainer).toHaveTextContent('你的糖尿病衛教單')
      expect(printContainer).toHaveTextContent('依你的資料，先看這些重點')
      expect(printContainer).toHaveTextContent('這次資料顯示')
      expect(printContainer).toHaveTextContent('把這張帶回診，可以直接問')
      expect(printContainer).toHaveTextContent('平時照護速查')
      expect(
        printContainer?.querySelector('[data-education-compact-print]'),
      ).toBeInTheDocument()
      expect(
        printContainer?.querySelector('[data-education-compact-print]'),
      ).toHaveAttribute('data-education-print-font-size', 'standard')
      expect(
        printContainer?.querySelector('[data-education-compact-print]'),
      ).toHaveAttribute('data-education-print-mode', 'summary')
      const screenModuleIds = Array.from(
        document.querySelectorAll(
          '[data-education-print-root] article[data-testid^="education-module-"]',
        ),
      ).map((element) => element.getAttribute('data-testid')?.replace('education-module-', ''))
      const printModuleIds = Array.from(
        printContainer?.querySelectorAll('[data-education-print-module]') ?? [],
      ).map((element) => element.getAttribute('data-education-print-module'))
      expect(printModuleIds).toHaveLength(24)
      expect(printModuleIds).toEqual(expect.arrayContaining(screenModuleIds))
      expect(printModuleIds).toEqual(expect.arrayContaining([
        'diabetes-basics',
        'personal-goals',
        'meal-pattern',
        'physical-activity',
        'screening-calendar',
        'medication-routine',
        'older-adults',
        'heart-vessels',
        'eye-care',
        'neuropathy-foot',
        'oral-care',
      ]))
      expect(printModuleIds).not.toEqual(expect.arrayContaining([
        'cgm',
        'insulin-injection',
        'pregnancy',
      ]))
      expect(printContainer).not.toHaveTextContent('全部糖尿病衛教')
      expect(printContainer).not.toHaveTextContent('列印重點版')
      expect(printContainer).not.toHaveTextContent('查看這項內容使用的資料、判斷與來源')
      expect(printContainer).toHaveTextContent('ADA Standards of Care in Diabetes—2026')
      expect(
        printContainer?.querySelectorAll('[data-education-print-page]'),
      ).toHaveLength(2)
    })

    render(
      <PersonalizedEducationFeature
        plan={buildPersonalizedEducation(context).plan}
        audience="patient"
        age={94}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '列印重點版' }))

    expect(printSpy).toHaveBeenCalledTimes(1)
    expect(document.body).toHaveClass('printing-education-handout')

    window.dispatchEvent(new Event('afterprint'))

    expect(document.body).not.toHaveClass('printing-education-handout')
    expect(document.querySelector('[data-education-print-container]')).not.toBeInTheDocument()
    printSpy.mockRestore()
  })

  it('prints the full teaching content when detailed mode is selected', () => {
    const printSpy = jest.spyOn(window, 'print').mockImplementation(() => {
      const printContainer = document.querySelector('[data-education-print-container]')
      const detailedPrint = printContainer?.querySelector('[data-education-detailed-print]')

      expect(detailedPrint).toBeInTheDocument()
      expect(detailedPrint).toHaveAttribute('data-education-print-mode', 'detailed')
      expect(detailedPrint).toHaveAttribute('data-education-print-font-size', 'standard')
      expect(
        detailedPrint?.querySelectorAll('[data-education-print-module]'),
      ).toHaveLength(24)
      expect(detailedPrint).toHaveTextContent('先理解：')
      expect(detailedPrint).toHaveTextContent('為什麼重要：')
      expect(detailedPrint).toHaveTextContent('和你目前資料的關係：')
      expect(detailedPrint).toHaveTextContent('實際可以怎麼做：')
      expect(detailedPrint).toHaveTextContent('看完確認：')
      expect(detailedPrint).toHaveTextContent('HbA1c 和今天早上量的血糖差在哪裡？')
      expect(printContainer?.querySelector('[data-education-compact-print]')).not.toBeInTheDocument()
      expect(detailedPrint).not.toHaveTextContent('平時照護速查')
    })

    render(
      <PersonalizedEducationFeature
        plan={buildPersonalizedEducation(context).plan}
        audience="patient"
        age={94}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /詳細解說版/ }))
    fireEvent.click(screen.getByRole('button', { name: '列印詳細解說版' }))

    expect(printSpy).toHaveBeenCalledTimes(1)
    window.dispatchEvent(new Event('afterprint'))
    printSpy.mockRestore()
  })

  it('changes print font size only when the user selects it', () => {
    render(
      <PersonalizedEducationFeature
        plan={buildPersonalizedEducation(context).plan}
        audience="patient"
        age={94}
      />,
    )

    const printHandout = screen.getByTestId('education-compact-print')
    expect(printHandout).toHaveAttribute('data-education-print-font-size', 'standard')

    // A single pressed-state toggle rather than a standard/large pair: the
    // control row has to fit on one line, and "off" already means standard.
    fireEvent.click(screen.getByRole('button', { name: '大字版' }))

    expect(screen.getByRole('button', { name: '大字版' })).toHaveAttribute('aria-pressed', 'true')
    expect(printHandout).toHaveAttribute('data-education-print-font-size', 'large')

    fireEvent.click(screen.getByRole('button', { name: '大字版' }))

    expect(screen.getByRole('button', { name: '大字版' })).toHaveAttribute('aria-pressed', 'false')
    expect(printHandout).toHaveAttribute('data-education-print-font-size', 'standard')
  })

  it('supports occasional health-record review instead of a daily check-in flow', () => {
    render(
      <PersonalizedEducationFeature
        plan={buildPersonalizedEducation(context).plan}
        audience="patient"
      />,
    )

    const modules = screen.getByTestId('education-modules')
    const library = screen.getByTestId('education-library')

    expect(
      modules.compareDocumentPosition(library) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(screen.queryByText(/今天先|今天只選|每天回來/)).not.toBeInTheDocument()
    expect(screen.queryByText('接下來，你想先從哪件事開始？')).not.toBeInTheDocument()
    expect(screen.queryByText('你選的是：')).not.toBeInTheDocument()
  })

  it('puts a fixed patient-readable care summary above the personalized modules', () => {
    render(
      <PersonalizedEducationFeature
        plan={buildPersonalizedEducation(context).plan}
        audience="patient"
      />,
    )

    const summary = screen.getByTestId('education-care-summary')
    const modules = screen.getByTestId('education-modules')

    expect(summary).toHaveTextContent('這次的糖尿病照護摘要')
    expect(summary).toHaveTextContent('目前的健康狀況')
    expect(summary).toHaveTextContent('這次優先了解')
    expect(summary).toHaveTextContent('接下來可以做')
    expect(summary).toHaveTextContent('資料更新至 2026/06/25')
    expect(summary).toHaveTextContent('腎臟過濾能力不只一次偏低，需要持續追蹤')
    expect(summary).not.toHaveTextContent('先選一個做得到的小改變')
    expect(
      summary.compareDocumentPosition(modules) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('assembles matched modules into one continuous patient handout', () => {
    render(
      <PersonalizedEducationFeature
        plan={buildPersonalizedEducation(context).plan}
        audience="patient"
      />,
    )

    const modules = screen.getByTestId('education-modules')
    const moduleIds = Array.from(
      modules.querySelectorAll('article[data-testid^="education-module-"]'),
    ).map((element) => element.getAttribute('data-testid'))

    expect(screen.getByRole('heading', { name: '這次為你整理的衛教' })).toBeInTheDocument()
    expect(moduleIds).toEqual([
      'education-module-a1c',
      'education-module-daily-rhythm',
      'education-module-sglt2-inhibitor',
      'education-module-kidney',
    ])
    expect(screen.getByTestId('education-module-a1c')).toHaveTextContent(
      '這代表最近三個月的平均血糖控制得不錯',
    )
    expect(screen.queryByTestId('education-module-trigger-a1c')).not.toBeInTheDocument()
  })

  it('keeps related modules visible in citizen-readable groups', () => {
    render(
      <PersonalizedEducationFeature
        plan={buildPersonalizedEducation(context).plan}
        audience="patient"
      />,
    )

    expect(screen.getByTestId('education-module-a1c')).toHaveAttribute('data-group-id', 'understanding')
    expect(screen.getByTestId('education-module-a1c')).toHaveTextContent('了解我的糖尿病')
    expect(screen.getByTestId('education-module-sglt2-inhibitor')).toHaveAttribute('data-group-id', 'medication')
    expect(screen.getByTestId('education-module-sglt2-inhibitor')).toHaveTextContent('藥物與設備')
    expect(screen.getByTestId('education-module-kidney')).toHaveAttribute('data-group-id', 'prevention')
    expect(screen.getByTestId('education-module-kidney')).toHaveTextContent('預防長期併發症')
  })

  it('keeps the complete eight-group library fixed when patient data changes', () => {
    const diagnosisOnlyContext: PatientEducationContext = {
      ...context,
      observations: [],
      medications: [],
    }
    const { container } = render(
      <PersonalizedEducationFeature
        plan={buildPersonalizedEducation(diagnosisOnlyContext).plan}
        audience="patient"
      />,
    )

    const libraryGroupIds = Array.from(
      container.querySelectorAll('details[data-testid^="education-library-group-"]'),
    ).map((element) => element.getAttribute('data-testid'))

    expect(libraryGroupIds).toEqual([
      'education-library-group-understanding',
      'education-library-group-daily-life',
      'education-library-group-monitoring',
      'education-library-group-medication',
      'education-library-group-urgent-care',
      'education-library-group-prevention',
      'education-library-group-wellbeing',
      'education-library-group-life-stages',
    ])
    expect(screen.getByTestId('education-library-module-a1c')).toHaveTextContent(
      '糖化血色素與血糖目標',
    )
    expect(screen.getByTestId('education-library-module-kidney')).toHaveTextContent('腎臟追蹤')
    expect(screen.getByTestId('education-library-module-hypoglycemia')).toHaveTextContent(
      '低血糖辨識與處理',
    )
    expect(screen.getByTestId('education-module-daily-rhythm')).toHaveTextContent(
      '先選一個做得到的改變',
    )
    expect(screen.queryByTestId('education-module-a1c')).not.toBeInTheDocument()
    expect(screen.queryByText('目前沒有相關紀錄')).not.toBeInTheDocument()
  })

  it('keeps evidence, rule logic, limitations, and sources inside the module toggle', () => {
    render(
      <PersonalizedEducationFeature
        plan={buildPersonalizedEducation(context).plan}
        audience="patient"
      />,
    )

    const kidneyModule = screen.getByTestId('education-module-kidney')
    const auditDetails = screen.getByTestId('education-module-detail-kidney')
    const auditToggle = within(kidneyModule).getByText('查看這項內容使用的資料、判斷與來源')

    expect(auditDetails).not.toHaveAttribute('open')
    expect(screen.queryByText('本次衛教摘要')).not.toBeInTheDocument()

    fireEvent.click(auditToggle)

    expect(auditDetails).toHaveAttribute('open')
    expect(within(kidneyModule).getByText('這次使用的資料')).toBeInTheDocument()
    expect(within(kidneyModule).getByText('判斷方式與限制')).toBeInTheDocument()
    expect(screen.getByText(/健康存摺沒有呈現的尿蛋白資料不會被列為要求補齊/)).toBeInTheDocument()
    expect(
      within(screen.getByTestId('education-module-detail-kidney')).getByText(
        '查看參考資料',
      ),
    ).toBeInTheDocument()
  })

  it('states an available prescription as a prescription without repeated adherence prompts', () => {
    render(
      <PersonalizedEducationFeature
        plan={buildPersonalizedEducation(context).plan}
        audience="patient"
      />,
    )

    const medicationModule = screen.getByTestId('education-module-sglt2-inhibitor')
    expect(medicationModule).toHaveTextContent('有處方紀錄')
    expect(screen.queryByText(/無法確認實際服用|不代表已確認服用|是否真的在使用/)).not.toBeInTheDocument()

    expect(screen.getByText(/這項衛教依照病歷中「.+」這筆紀錄整理/)).toBeInTheDocument()
    expect(screen.queryByText(/無法確認實際服用|不代表已確認服用|是否真的在使用/)).not.toBeInTheDocument()
    expect(screen.getByTestId('education-safety-summary')).toHaveTextContent('需要盡快處理的情況')
  })

  it('shows the same citizen-readable content as a medical preview', () => {
    render(
      <PersonalizedEducationFeature
        plan={buildPersonalizedEducation(context).plan}
        audience="medical"
      />,
    )

    expect(screen.getByText('民眾閱讀版預覽')).toBeInTheDocument()
    expect(screen.queryByText(/CDSS|個人化指引/)).not.toBeInTheDocument()
  })
})

describe('when no disease pack covers the record', () => {
  it('names the covered topics instead of stopping at "nothing for you"', () => {
    render(<PersonalizedEducationFeature plan={null} audience="patient" />)

    const screen_ = screen.getByTestId('education-no-pack')
    expect(screen_).toHaveTextContent('這份紀錄沒有可以個人化的衛教主題')
    // Says what is covered and what would make it apply, so the reader can tell
    // this is a gap in the demonstration rather than a problem with their data.
    expect(screen_).toHaveTextContent('第二型糖尿病')
    expect(screen_).toHaveTextContent('不代表你的資料有問題')
    expect(screen_).not.toHaveTextContent('目前沒有適合你的衛教內容')
  })
})

describe('pack selection', () => {
  it('reports every eligible pack, not only the one it rendered', () => {
    const result = buildPersonalizedEducation(context)

    expect(result.reason).toBe('eligible-pack')
    expect(result.eligiblePackIds).toEqual(['dm'])
  })

  it('reports no eligible packs when the diagnosis is absent', () => {
    const result = buildPersonalizedEducation({ ...context, diagnosisCodings: [] })

    expect(result.reason).toBe('no-eligible-pack')
    expect(result.eligiblePackIds).toEqual([])
  })
})

describe('section jump', () => {
  it('lists every rendered section, grouped, plus the summary', () => {
    render(
      <PersonalizedEducationFeature
        plan={buildPersonalizedEducation(context).plan}
        audience="patient"
        age={94}
      />,
    )

    const jump = screen.getByTestId('education-section-jump') as HTMLSelectElement
    const values = Array.from(jump.options).map((option) => option.value).filter(Boolean)

    // Summary view: only the modules the record supports.
    expect(values).toEqual([
      'education-care-summary',
      'education-a1c',
      'education-daily-rhythm',
      'education-sglt2-inhibitor',
      'education-kidney',
    ])

    fireEvent.click(screen.getByRole('button', { name: '詳細解說版' }))

    const detailedValues = Array.from(
      (screen.getByTestId('education-section-jump') as HTMLSelectElement).options,
    ).map((option) => option.value).filter(Boolean)

    // Every option must resolve to a section that is actually on the page,
    // otherwise choosing it would scroll nowhere.
    expect(detailedValues).toHaveLength(25)
    for (const value of detailedValues) {
      expect(document.getElementById(value)).toBeInTheDocument()
    }
    expect(jump.querySelectorAll('optgroup').length).toBeGreaterThan(1)
  })
})
