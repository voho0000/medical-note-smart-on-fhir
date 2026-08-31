import { buildMicrobiologyCumulativeModel, parseSusceptibilityFreeText, splitSusceptibilityResult } from '@/src/shared/utils/microbiology-cumulative.utils'

const NHI_SYSTEM = 'https://twcore.mohw.gov.tw/CodeSystem/nhi-medical-order-code'
const LOCAL_SYSTEM = 'https://nhi-fhir-bridge.local/CodeSystem/his-local-lab'

function microbiologyObservation({
  id,
  date,
  nhiCode,
  nhiDisplay,
  name,
  specimen,
  value,
  component,
}: {
  id: string
  date: string
  nhiCode: string
  nhiDisplay: string
  name: string
  specimen?: string
  value: string
  component?: any[]
}) {
  return {
    id,
    status: 'final',
    effectiveDateTime: `${date}T00:00:00+08:00`,
    code: {
      text: name,
      coding: [
        { system: NHI_SYSTEM, code: nhiCode, display: nhiDisplay },
        { system: LOCAL_SYSTEM, code: name, display: name },
      ],
    },
    ...(specimen ? { specimen: { display: specimen } } : {}),
    valueString: value,
    component,
    performer: [{ display: 'Test Hospital' }],
  }
}

describe('buildMicrobiologyCumulativeModel', () => {
  it('accumulates by specimen and clinical testing stage instead of source report name', () => {
    const model = buildMicrobiologyCumulativeModel([
      microbiologyObservation({
        id: 'afb-stain',
        date: '2026-05-22',
        nhiCode: '13025C',
        nhiDisplay: '抗酸性濃縮抹片染色檢查',
        name: 'AFB stain',
        specimen: 'Sputum',
        value: 'acid fast bacilli not found',
      }),
      microbiologyObservation({
        id: 'tb-culture',
        date: '2026-06-12',
        nhiCode: '13026C',
        nhiDisplay: '抗酸菌培養',
        name: 'TB Culture',
        specimen: 'Sputum',
        value: 'No Growth for Mycobacterium',
      }),
    ])

    expect(model.tracks).toHaveLength(1)
    expect(model.tracks[0]).toMatchObject({
      family: 'mycobacteriology',
      specimen: 'Sputum',
      specimenConfidence: 'source',
      dates: ['2026-06-12', '2026-05-22'],
      stages: ['directExam', 'culture'],
    })
  })

  it('trusts the NHI testing role and flags a conflicting local name', () => {
    const model = buildMicrobiologyCumulativeModel([
      microbiologyObservation({
        id: 'conflict',
        date: '2026-05-22',
        nhiCode: '13025C',
        nhiDisplay: '抗酸性濃縮抹片染色檢查',
        name: 'TB Culture',
        specimen: 'Blood',
        value: 'No Growth for Mycobacterium',
      }),
    ])

    expect(model.tracks[0].results[0]).toMatchObject({
      stage: 'directExam',
      standardizedName: '抗酸菌染色',
      sourceRoleConflict: true,
      sourceOrderCode: '13025C',
    })
  })

  it('keeps missing-specimen results visibly low-confidence', () => {
    const model = buildMicrobiologyCumulativeModel([
      microbiologyObservation({
        id: 'unknown-specimen',
        date: '2026-01-14',
        nhiCode: '13007C',
        nhiDisplay: '細菌培養鑑定檢查',
        name: 'Aerobic Culture',
        value: 'Mixed flora',
      }),
    ])

    expect(model.missingSpecimenCount).toBe(1)
    expect(model.tracks[0]).toMatchObject({
      specimen: 'unknown',
      specimenConfidence: 'missing',
    })
  })

  it('does not treat the 13007C explanatory phrase 「抗酸菌除外」 as mycobacteriology', () => {
    const model = buildMicrobiologyCumulativeModel([
      microbiologyObservation({
        id: 'aerobic-culture',
        date: '2026-01-14',
        nhiCode: '13007C',
        nhiDisplay: '細菌培養鑑定檢查(包括一般細菌、真菌、原蟲等為對象的培養鑑定，抗酸菌除外)',
        name: 'Aerobic Culture',
        specimen: 'Blood',
        value: 'Mixed flora',
      }),
    ])

    expect(model.tracks[0].family).toBe('bacteriology')
  })

  it('extracts only structured S/I/R susceptibility components', () => {
    const model = buildMicrobiologyCumulativeModel([
      microbiologyObservation({
        id: 'susceptibility',
        date: '2026-01-14',
        nhiCode: '13007C',
        nhiDisplay: '細菌培養鑑定檢查',
        name: 'Blood culture susceptibility',
        specimen: 'Blood',
        value: 'Escherichia coli isolated',
        component: [
          { code: { text: 'Ceftriaxone' }, valueCodeableConcept: { text: 'R' } },
          { code: { text: 'Meropenem' }, valueString: 'Susceptible' },
          { code: { text: 'Colony count' }, valueString: '100000' },
        ],
      }),
    ])

    expect(model.tracks[0].results[0].susceptibilities).toEqual([
      { antibiotic: 'Ceftriaxone', result: 'R' },
      { antibiotic: 'Meropenem', result: 'S' },
    ])
  })

  it('normalizes real NHI microbiology roles without splitting source-name variants', () => {
    const model = buildMicrobiologyCumulativeModel([
      microbiologyObservation({
        id: 'gram-local',
        date: '2026-06-13',
        nhiCode: '13006C',
        nhiDisplay: '排泄物，滲出物及分泌物之細菌顯微鏡檢查',
        name: '革蘭氏染色',
        value: 'SALIVA CONTAMINATION(唾液污染)',
      }),
      {
        ...microbiologyObservation({
          id: 'gram-loinc-copy',
          date: '2026-06-13',
          nhiCode: '13006C',
          nhiDisplay: '排泄物，滲出物及分泌物之細菌顯微鏡檢查',
          name: 'Gram Stain',
          value: 'SALIVA CONTAMINATION(唾液污染)',
        }),
        code: {
          text: 'Gram Stain',
          coding: [
            { system: 'http://loinc.org', code: '664-3', display: 'Microscopic observation in Specimen by Gram stain' },
            { system: NHI_SYSTEM, code: '13006C', display: '排泄物，滲出物及分泌物之細菌顯微鏡檢查' },
          ],
        },
      },
      microbiologyObservation({
        id: 'mic',
        date: '2026-06-10',
        nhiCode: '13023C',
        nhiDisplay: '細菌最低抑制濃度快速試驗',
        name: '細菌最低抑制濃度快速試驗',
        value: '菌名:Haemophilus influenzae Ampicillin:S Ceftriaxone:S',
      }),
    ])

    const results = model.tracks.flatMap((track) => track.results)
    expect(results).toHaveLength(2)
    expect(results.find((result) => result.sourceOrderCode === '13006C')).toMatchObject({
      stage: 'directExam',
      standardizedName: 'Gram Stain',
      state: 'contaminated',
    })
    expect(results.find((result) => result.sourceOrderCode === '13023C')).toMatchObject({
      stage: 'susceptibility',
      standardizedName: '抗生素藥敏試驗',
    })
  })

  it('propagates a unique specimen only inside the same hospital/date/order report', () => {
    const model = buildMicrobiologyCumulativeModel([
      microbiologyObservation({
        id: 'sputum-component',
        date: '2026-05-28',
        nhiCode: '13006C',
        nhiDisplay: '細菌顯微鏡檢查',
        name: 'W.B.C.-Sputum',
        specimen: 'Sputum',
        value: '>50/LF',
      }),
      microbiologyObservation({
        id: 'gram-without-specimen',
        date: '2026-05-28',
        nhiCode: '13006C',
        nhiDisplay: '細菌顯微鏡檢查',
        name: 'Gram Stain',
        value: 'No Bacteria Found',
      }),
      microbiologyObservation({
        id: 'culture-without-specimen',
        date: '2026-05-28',
        nhiCode: '13007C',
        nhiDisplay: '細菌培養鑑定檢查',
        name: 'Aerobic Culture',
        value: 'No growth 2 days',
      }),
    ])

    const sputumTrack = model.tracks.find((track) => track.specimen === 'Sputum')
    const unknownTrack = model.tracks.find((track) => track.specimen === 'unknown')
    expect(sputumTrack).toMatchObject({ specimenConfidence: 'inferred' })
    expect(sputumTrack?.results.map((result) => result.id)).toEqual(expect.arrayContaining([
      'sputum-component',
      'gram-without-specimen',
    ]))
    expect(unknownTrack?.results.map((result) => result.id)).toEqual(['culture-without-specimen'])
  })
})

describe('parseSusceptibilityFreeText', () => {
  it('splits an NHI flattened antibiogram into organism, quantity, and verbatim drug results', () => {
    const parsed = parseSusceptibilityFreeText(
      '菌名：Escherichia coli 菌量：Light AN:S CTX:I CXM:I CXM-O:I CZ-O:R ETP:S FEP:S GM:S LVX:I MEM:S SAM:I SXT:R TZP:D',
    )

    expect(parsed?.leftover).toBe('')
    expect(parsed?.isolates).toHaveLength(1)
    expect(parsed?.isolates[0]).toMatchObject({
      organism: 'Escherichia coli',
      quantity: 'Light',
    })
    expect(parsed?.isolates[0].entries).toHaveLength(13)
    expect(parsed?.isolates[0].entries).toEqual(expect.arrayContaining([
      { antibiotic: 'CZ-O', result: 'R' },
      { antibiotic: 'SXT', result: 'R' },
      // Non-standard letters stay verbatim; the parser never rewrites values.
      { antibiotic: 'TZP', result: 'D' },
    ]))
  })

  it('keeps parenthesized disk names and non-S/I/R letters verbatim', () => {
    const parsed = parseSusceptibilityFreeText(
      '菌名:Haemophilus influenzae Ampicillin:S Chloramphenicol(C-30):S Ciprofloxacin(CIP-5):N Ceftriaxone(CRO-30):S',
    )

    expect(parsed?.isolates[0].organism).toBe('Haemophilus influenzae')
    expect(parsed?.isolates[0].entries).toEqual(expect.arrayContaining([
      { antibiotic: 'Chloramphenicol(C-30)', result: 'S' },
      { antibiotic: 'Ciprofloxacin(CIP-5)', result: 'N' },
    ]))
  })

  it('separates numbered organism slots into isolates with their own panels', () => {
    const parsed = parseSusceptibilityFreeText(
      '菌名1：Escherichia coli 菌量1：Light AN:S CTX:I CZ-O:R 菌名2：Klebsiella pneumoniae AN:R CTX:S CZ-O:S',
    )

    expect(parsed?.isolates).toHaveLength(2)
    expect(parsed?.isolates[0]).toMatchObject({ organism: 'Escherichia coli', quantity: 'Light' })
    expect(parsed?.isolates[0].entries).toEqual([
      { antibiotic: 'AN', result: 'S' },
      { antibiotic: 'CTX', result: 'I' },
      { antibiotic: 'CZ-O', result: 'R' },
    ])
    expect(parsed?.isolates[1]).toMatchObject({ organism: 'Klebsiella pneumoniae', quantity: null })
    expect(parsed?.isolates[1].entries).toEqual([
      { antibiotic: 'AN', result: 'R' },
      { antibiotic: 'CTX', result: 'S' },
      { antibiotic: 'CZ-O', result: 'S' },
    ])
  })

  it('accepts letter-with-MIC and bare-MIC result tokens verbatim', () => {
    const parsed = parseSusceptibilityFreeText(
      '菌名:Staphylococcus aureus Tigecycline:S(≦0.12) Vancomycin:S(1) Oxacillin:<=0.25 Penicillin:>8',
    )

    expect(parsed?.isolates[0].entries).toEqual([
      { antibiotic: 'Tigecycline', result: 'S(≦0.12)' },
      { antibiotic: 'Vancomycin', result: 'S(1)' },
      { antibiotic: 'Oxacillin', result: '<=0.25' },
      { antibiotic: 'Penicillin', result: '>8' },
    ])
    expect(splitSusceptibilityResult('S(≦0.12)')).toEqual({ letter: 'S', detail: '≦0.12' })
    expect(splitSusceptibilityResult('<=0.25')).toEqual({ letter: null, detail: '<=0.25' })
    expect(splitSusceptibilityResult('R')).toEqual({ letter: 'R', detail: null })
  })

  it('refuses narratives, identifications, and serology titers', () => {
    expect(parseSusceptibilityFreeText('No growth after 8 weeks')).toBeNull()
    expect(parseSusceptibilityFreeText('菌名1：Escherichia coli 長菌量：Light')).toBeNull()
    // Titer notation must never be mangled into a drug panel.
    expect(parseSusceptibilityFreeText('Negative≦1:80X(-)')).toBeNull()
    expect(parseSusceptibilityFreeText('Cryptococcus Ag titer 1:512 positive')).toBeNull()
  })
})

describe('classifyResultState via model', () => {
  it('reads real hospital contamination and organism-slot phrasings correctly', () => {
    const model = buildMicrobiologyCumulativeModel([
      microbiologyObservation({
        id: 'urine-contamination-note',
        date: '2026-02-01',
        nhiCode: '13007C',
        nhiDisplay: '細菌培養鑑定檢查',
        name: 'Urine Culture',
        value: 'Nonsignificant Bacteria>=3 kinds,maybe contamination',
      }),
      microbiologyObservation({
        id: 'named-isolate',
        date: '2026-02-02',
        nhiCode: '13016B',
        nhiDisplay: '血液培養',
        name: '細菌血液培養',
        value: '菌名：Escherichia coli AN:S CTX:I CZ-O:R',
      }),
    ])

    const results = model.tracks.flatMap((track) => track.results)
    expect(results.find((result) => result.id === 'urine-contamination-note')?.state).toBe('contaminated')
    expect(results.find((result) => result.id === 'named-isolate')?.state).toBe('detected')
  })
})

describe('NHI susceptibility order codes', () => {
  it('routes 13009C and 13015C to the susceptibility stage by code, not by item text', () => {
    const model = buildMicrobiologyCumulativeModel([
      microbiologyObservation({
        id: 'one-organism-susceptibility',
        date: '2026-03-08',
        nhiCode: '13009C',
        nhiDisplay: '細菌藥物敏感性試驗－1菌種',
        name: 'Aerobic Culture(Pus/Wound)',
        value: '菌名：Escherichia coli 菌量：Light AN:S CTX:I CZ-O:R',
      }),
      microbiologyObservation({
        id: 'afb-susceptibility-no-growth',
        date: '2025-11-17',
        nhiCode: '13015C',
        nhiDisplay: '抗酸菌藥物敏感性試驗—四種藥物以上',
        name: 'AFS+Culture #1',
        value: 'No growth after 8 weeks',
      }),
    ])

    const results = model.tracks.flatMap((track) => track.results)
    expect(results.find((result) => result.sourceOrderCode === '13009C')).toMatchObject({
      stage: 'susceptibility',
      standardizedName: '抗生素藥敏試驗',
      state: 'detected',
    })
    expect(results.find((result) => result.sourceOrderCode === '13015C')).toMatchObject({
      stage: 'susceptibility',
      standardizedName: '抗酸菌藥敏試驗',
      family: 'mycobacteriology',
      state: 'noGrowth',
    })
  })
})
