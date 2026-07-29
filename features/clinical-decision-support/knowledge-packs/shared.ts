import type {
  CdssKnowledgeSourceId,
  CdssKnowledgeSourceKind,
  CdssLocale,
  CdssSourceAssessment,
  CdssSourceAssessmentStatus,
  GuidelineReference,
} from '../types'

export function localize(locale: CdssLocale, zh: string, en: string): string {
  return locale === 'en' ? en : zh
}

export function resolvePublicAssetUrl(
  url: string,
  basePath = process.env.NEXT_PUBLIC_BASE_PATH || '',
): string {
  if (!url.startsWith('/') || url.startsWith('//')) return url

  const trimmedBasePath = basePath.trim().replace(/^\/+|\/+$/g, '')
  const normalizedBasePath = trimmedBasePath ? `/${trimmedBasePath}` : ''
  if (
    !normalizedBasePath
    || url === normalizedBasePath
    || url.startsWith(`${normalizedBasePath}/`)
  ) {
    return url
  }

  return `${normalizedBasePath}${url}`
}

export function pdfPageUrl(
  url: string,
  page: number,
  basePath = process.env.NEXT_PUBLIC_BASE_PATH || '',
): string {
  return `${resolvePublicAssetUrl(url, basePath)}#page=${page}`
}

export function assessment(input: {
  sourceId: CdssKnowledgeSourceId
  sourceKind: CdssKnowledgeSourceKind
  sourceLabel: string
  version: string
  effectiveFrom: string
  status: CdssSourceAssessmentStatus
  summary: string
  verifiedData?: readonly string[]
  missingData?: readonly string[]
  references?: readonly GuidelineReference[]
}): CdssSourceAssessment {
  return {
    ...input,
    references: input.references ?? [],
  }
}
