import type { ImagingStudy } from '@/src/shared/types/fhir.types'

type ImagingStudyLike = ImagingStudy & { id?: string }

const unique = (values: Array<string | undefined>): string[] =>
  [...new Set(values.map((value) => value?.trim()).filter((value): value is string => !!value))]

const codingText = (coding?: { code?: string; display?: string }): string | undefined =>
  coding?.display?.trim() || coding?.code?.trim() || undefined

const conceptText = (concept?: {
  text?: string
  coding?: Array<{ code?: string; display?: string }>
}): string | undefined =>
  concept?.text?.trim() || unique((concept?.coding ?? []).map(codingText)).join(', ') || undefined

const referenceText = (reference?: { reference?: string; display?: string }): string | undefined =>
  reference?.display?.trim() || reference?.reference?.trim() || undefined

export function imagingStudyModalityText(study: ImagingStudyLike): string | undefined {
  const studyModalities = unique((study.modality ?? []).map(codingText))
  if (studyModalities.length > 0) return studyModalities.join(', ')
  const seriesModalities = unique((study.series ?? []).map((series) => codingText(series.modality)))
  return seriesModalities.length > 0 ? seriesModalities.join(', ') : undefined
}

export function imagingStudyTitle(study: ImagingStudyLike): string {
  const procedure = unique((study.procedureCode ?? []).map(conceptText))[0]
    || referenceText(study.procedureReference)
  const seriesDescription = unique((study.series ?? []).map((series) => series.description))[0]
  const modality = imagingStudyModalityText(study)
  return study.description?.trim()
    || procedure
    || seriesDescription
    || (modality ? `${modality} Imaging Study` : undefined)
    || 'Imaging Study'
}

export function imagingStudyInstitution(study: ImagingStudyLike): string | undefined {
  const performer = unique(
    (study.series ?? []).flatMap((series) =>
      (series.performer ?? []).map((entry) => referenceText(entry.actor))
    )
  )[0]
  return referenceText(study.location) || performer || referenceText(study.referrer)
}

/**
 * Human-readable ImagingStudy metadata for the reports UI and AI context.
 * This deliberately ignores UID/SOP details used to retrieve DICOM pixels;
 * only clinical/provenance text and counts are emitted.
 */
export function formatImagingStudyMetadata(
  study: ImagingStudyLike,
  locale: string = 'en',
): string {
  const zh = locale === 'zh-TW' || locale.toLowerCase().startsWith('zh')
  const label = (en: string, traditionalChinese: string) => zh ? traditionalChinese : en
  const lines: string[] = []
  const push = (name: string, value?: string | number) => {
    if (value === undefined || value === null || value === '') return
    lines.push(`${name}: ${value}`)
  }

  push(label('Description', '檢查說明'), study.description?.trim())
  push(label('Status', '狀態'), study.status)
  push(label('Modality', '影像類型'), imagingStudyModalityText(study))
  push(label('Procedure', '檢查處置'), unique([
    ...(study.procedureCode ?? []).map(conceptText),
    referenceText(study.procedureReference),
  ]).join('; '))
  push(label('Reason', '檢查原因'), unique([
    ...(study.reasonCode ?? []).map(conceptText),
    ...(study.reasonReference ?? []).map(referenceText),
  ]).join('; '))
  push(label('Location', '地點'), referenceText(study.location))
  push(label('Referrer', '轉介者'), referenceText(study.referrer))
  push(label('Interpreter', '判讀者'), unique((study.interpreter ?? []).map(referenceText)).join(', '))
  push(label('Based on', '檢查申請'), unique((study.basedOn ?? []).map(referenceText)).join(', '))
  push(label('Endpoint reference', '影像端點參照'), unique((study.endpoint ?? []).map(referenceText)).join(', '))
  push(label('Identifier', '識別碼'), unique((study.identifier ?? []).map((identifier) => identifier.value)).join(', '))

  const seriesCount = study.numberOfSeries ?? study.series?.length
  const actualInstanceCount = (study.series ?? []).reduce(
    (total, series) => total + (series.numberOfInstances ?? series.instance?.length ?? 0),
    0,
  )
  const instanceCount = study.numberOfInstances ?? (actualInstanceCount || undefined)
  if (seriesCount !== undefined || instanceCount !== undefined) {
    const parts = [
      seriesCount !== undefined ? `${seriesCount} ${label('series', '組 series')}` : '',
      instanceCount !== undefined ? `${instanceCount} ${label('instances', '個 instance')}` : '',
    ].filter(Boolean)
    push(label('Study size', '檢查內容數量'), parts.join(' / '))
  }

  for (const note of study.note ?? []) {
    push(label('Note', '備註'), note.text?.trim())
  }

  for (const [index, series] of (study.series ?? []).entries()) {
    const seriesLabel = series.number ?? index + 1
    const headingParts = unique([
      codingText(series.modality),
      series.description,
    ])
    lines.push(`${label('Series', 'Series')} ${seriesLabel}${headingParts.length ? ` — ${headingParts.join(' · ')}` : ''}`)

    const performerTexts = unique((series.performer ?? []).map((entry) => {
      const role = conceptText(entry.function)
      const actor = referenceText(entry.actor)
      return role && actor ? `${role}: ${actor}` : actor || role
    }))

    const details = [
      conceptText({ coding: series.bodySite ? [series.bodySite] : [] })
        ? `${label('Body site', '部位')} ${codingText(series.bodySite)}`
        : undefined,
      codingText(series.laterality)
        ? `${label('Laterality', '側別')} ${codingText(series.laterality)}`
        : undefined,
      series.started ? `${label('Started', '開始')} ${series.started}` : undefined,
      series.numberOfInstances !== undefined
        ? `${series.numberOfInstances} ${label('instances', '個 instance')}`
        : undefined,
      performerTexts.length
        ? `${label('Performer', '執行者')} ${performerTexts.join(', ')}`
        : undefined,
      unique((series.specimen ?? []).map(referenceText)).length
        ? `${label('Specimen', '檢體')} ${unique((series.specimen ?? []).map(referenceText)).join(', ')}`
        : undefined,
      unique((series.endpoint ?? []).map(referenceText)).length
        ? `${label('Endpoint', '端點')} ${unique((series.endpoint ?? []).map(referenceText)).join(', ')}`
        : undefined,
    ].filter((value): value is string => !!value)
    if (details.length > 0) lines.push(`  ${details.join(' · ')}`)

    const titles = unique((series.instance ?? []).map((instance) => instance.title))
    const visibleTitles = titles.slice(0, 50)
    if (visibleTitles.length > 0) {
      lines.push(`  ${label('Instance titles', '影像項目')}: ${visibleTitles.join('; ')}`)
      if (titles.length > visibleTitles.length) {
        lines.push(`  …${titles.length - visibleTitles.length} ${label('more titles omitted', '個其餘標題未列出')}`)
      }
    }
  }

  return lines.join('\n') || label(
    'ImagingStudy metadata is present; no report narrative or image preview was supplied.',
    '已有 ImagingStudy 檢查資料；來源未提供報告文字或影像預覽。',
  )
}
