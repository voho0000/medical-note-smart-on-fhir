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

    // The page heading is for assistive technology only; on screen the panel
    // tab and the summary heading already name the feature and the disease.
    expect(
      screen.getByRole('heading', { name: '你的糖尿病衛教單（第二型糖尿病）', level: 1 }),
    ).toHaveClass('sr-only')
    expect(screen.getByTestId('education-print-menu')).toBeInTheDocument()
    // Print settings are not loose controls on the page any more.
    expect(screen.queryByRole('button', { name: '大字版' })).not.toBeInTheDocument()
    expect(screen.queryByText(/使用 \d+ 筆病歷依據/)).not.toBeInTheDocument()
    expect(screen.queryByText(/不使用姓名、病歷號/)).not.toBeInTheDocument()
    expect(screen.queryByText(/選擇模型|Gemini|產生內容/)).not.toBeInTheDocument()
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

    fireEvent.click(screen.getByTestId('education-print-menu'))
    fireEvent.click(screen.getByTestId('education-print-confirm'))

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

    // The printed version is chosen in the print menu, independently of which
    // topics the reader is browsing.
    fireEvent.click(screen.getByTestId('education-print-menu'))
    fireEvent.click(screen.getByRole('button', { name: /完整版/ }))
    fireEvent.click(screen.getByTestId('education-print-confirm'))

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

    fireEvent.click(screen.getByTestId('education-print-menu'))
    fireEvent.click(screen.getByRole('button', { name: '大字' }))

    expect(screen.getByRole('button', { name: '大字' })).toHaveAttribute('aria-pressed', 'true')
    expect(printHandout).toHaveAttribute('data-education-print-font-size', 'large')

    fireEvent.click(screen.getByRole('button', { name: '標準' }))

    expect(printHandout).toHaveAttribute('data-education-print-font-size', 'standard')
  })






  it('keeps evidence, rule logic, limitations, and sources inside the module toggle', () => {
    render(
      <PersonalizedEducationFeature
        plan={buildPersonalizedEducation(context).plan}
        audience="patient"
      />,
    )

    fireEvent.click(screen.getByTestId('education-group-prevention'))
    fireEvent.click(screen.getByTestId('education-topic-kidney-narrow'))

    const kidneyModule = screen.getByTestId('education-module-kidney')
    const auditDetails = screen.getByTestId('education-module-detail-kidney')
    const auditToggle = within(kidneyModule).getByText('資料、判斷與來源')

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

    fireEvent.click(screen.getByTestId('education-group-medication'))
    fireEvent.click(screen.getByTestId('education-topic-sglt2-inhibitor-narrow'))

    const medicationModule = screen.getByTestId('education-module-sglt2-inhibitor')
    expect(medicationModule).toHaveTextContent('有處方紀錄')
    expect(screen.queryByText(/無法確認實際服用|不代表已確認服用|是否真的在使用/)).not.toBeInTheDocument()

    expect(screen.getByText(/這項衛教依照病歷中「.+」這筆紀錄整理/)).toBeInTheDocument()
    expect(screen.queryByText(/無法確認實際服用|不代表已確認服用|是否真的在使用/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('education-topic-summary-narrow'))
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


describe('topic browsing', () => {
  function renderFeature() {
    return render(
      <PersonalizedEducationFeature
        plan={buildPersonalizedEducation(context).plan}
        audience="patient"
        age={94}
      />,
    )
  }

  it('opens on the summary and shows one topic at a time', () => {
    renderFeature()

    expect(screen.getByTestId('education-care-summary')).toBeInTheDocument()
    expect(screen.queryByTestId('education-module-kidney')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('education-group-prevention'))
    fireEvent.click(screen.getByTestId('education-topic-kidney-narrow'))

    expect(screen.getByTestId('education-module-kidney')).toBeInTheDocument()
    expect(screen.queryByTestId('education-module-a1c')).not.toBeInTheDocument()
    expect(screen.queryByTestId('education-care-summary')).not.toBeInTheDocument()
  })

  it('reaches a topic in one tap, with no menu to open first', () => {
    renderFeature()

    // Every topic in the current filter is a button that is already on screen.
    // Every group is on screen; opening one reveals its topics in place.
    for (const [topic, group] of [
      ['a1c', 'understanding'],
      ['daily-rhythm', 'daily-life'],
      ['sglt2-inhibitor', 'medication'],
      ['kidney', 'prevention'],
    ]) {
      fireEvent.click(screen.getByTestId(`education-group-${group}`))
      expect(screen.getByTestId(`education-topic-${topic}-narrow`)).toBeInTheDocument()
    }
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('names the next topic rather than just saying next', () => {
    renderFeature()
    fireEvent.click(screen.getByTestId('education-group-understanding'))
    fireEvent.click(screen.getByTestId('education-topic-a1c-narrow'))

    const next = screen.getByTestId('education-topic-next')
    // A label the reader can want is what makes the tap worth making.
    expect(next).toHaveTextContent('接著看：')
    expect(next.textContent).not.toBe('接著看：')
    expect(screen.getByTestId('education-topic-position')).toHaveTextContent('1 / 4')

    fireEvent.click(next)

    expect(screen.getByTestId('education-topic-position')).toHaveTextContent('2 / 4')
  })

  it('walks the whole filter with the next control and then says so', () => {
    renderFeature()
    fireEvent.click(screen.getByTestId('education-group-understanding'))
    fireEvent.click(screen.getByTestId('education-topic-a1c-narrow'))

    for (let step = 0; step < 3; step += 1) {
      fireEvent.click(screen.getByTestId('education-topic-next'))
    }

    expect(screen.getByTestId('education-topic-position')).toHaveTextContent('4 / 4')
    expect(screen.getByTestId('education-topic-complete')).toBeInTheDocument()
    expect(screen.queryByTestId('education-topic-next')).not.toBeInTheDocument()
  })

  it('marks topics already read so progress is visible', () => {
    renderFeature()
    fireEvent.click(screen.getByTestId('education-group-understanding'))
    fireEvent.click(screen.getByTestId('education-topic-a1c-narrow'))
    fireEvent.click(screen.getByTestId('education-group-prevention'))
    fireEvent.click(screen.getByTestId('education-topic-kidney-narrow'))

    fireEvent.click(screen.getByTestId('education-group-understanding'))

    expect(within(screen.getByTestId('education-topic-a1c-narrow')).getByLabelText('已看過'))
      .toBeInTheDocument()
  })

  it('widens to the whole catalogue, including situation topics the handout omits', () => {
    renderFeature()

    expect(screen.queryByTestId('education-topic-pregnancy-narrow')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('education-topic-filter-narrow'))
    fireEvent.click(screen.getByTestId('education-group-life-stages'))

    expect(screen.getByTestId('education-topic-pregnancy-narrow')).toBeInTheDocument()
    expect(screen.getByTestId('education-topic-dialysis-transplant-narrow')).toBeInTheDocument()
  })

  it('falls back to the summary when a filter change drops the open topic', () => {
    renderFeature()
    fireEvent.click(screen.getByTestId('education-topic-filter-narrow'))
    fireEvent.click(screen.getByTestId('education-group-life-stages'))
    fireEvent.click(screen.getByTestId('education-topic-pregnancy-narrow'))
    expect(screen.getByTestId('education-module-pregnancy')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('education-topic-filter-narrow'))

    expect(screen.queryByTestId('education-module-pregnancy')).not.toBeInTheDocument()
    expect(screen.getByTestId('education-care-summary')).toBeInTheDocument()
  })

  it('does not repeat the catalogue explanation inside the personalised reading', () => {
    renderFeature()
    fireEvent.click(screen.getByTestId('education-group-prevention'))
    fireEvent.click(screen.getByTestId('education-topic-kidney-narrow'))

    const topic = screen.getByTestId('education-module-kidney')
    // Both sources render together now, so each must keep its own job:
    // 你的狀況 reports this record, 為什麼重要 explains the measure itself.
    expect(topic).toHaveTextContent('你的狀況')
    expect(topic).toHaveTextContent('為什麼重要')
    expect(topic.textContent?.match(/eGFR 估的是腎臟每分鐘的過濾量/g) ?? []).toHaveLength(0)
  })
})


describe('narrow navigation stays flat', () => {
  function renderFeature() {
    return render(
      <PersonalizedEducationFeature
        plan={buildPersonalizedEducation(context).plan}
        audience="patient"
        age={94}
      />,
    )
  }

  it('lists every topic in one row, with no level to step back out of', () => {
    renderFeature()

    const row = screen.getByTestId('education-topic-row')
    // Groups are all visible without swiping; a topic list opens beneath one.
    for (const group of ['understanding', 'daily-life', 'medication', 'prevention']) {
      expect(within(row).getByTestId(`education-group-${group}`)).toBeInTheDocument()
    }
    expect(row.querySelector('[class*="overflow-x-auto"]')).toBeNull()
    // A back control would be a tax paid on every topic change.
    expect(screen.queryByTestId('education-topic-groups-back')).not.toBeInTheDocument()
  })

  it('keeps the whole catalogue reachable from the row, not behind a level', () => {
    renderFeature()

    // The filter sits outside the scrolling row, so it cannot scroll away
    // however deep into the topics the reader has swiped.
    const filter = screen.getByTestId('education-topic-filter-narrow')
    expect(screen.getByTestId('education-topic-row')).not.toContainElement(filter)

    fireEvent.click(screen.getByTestId('education-group-prevention'))
    fireEvent.click(screen.getByTestId('education-topic-kidney-narrow'))
    expect(screen.getByTestId('education-topic-filter-narrow')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('education-topic-filter-narrow'))
    fireEvent.click(screen.getByTestId('education-group-life-stages'))

    expect(screen.getByTestId('education-topic-pregnancy-narrow')).toBeInTheDocument()
  })
})
