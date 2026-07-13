import type {
  ClinicalDataQueryStatus,
} from '@/src/core/entities/clinical-data.entity'

function asRecord(value: unknown): Record<string, any> | undefined {
  return value !== null && typeof value === 'object'
    ? value as Record<string, any>
    : undefined
}

function parsePossibleJson(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    // fhirclient.HttpError.parse() appends a pretty-printed OperationOutcome
    // after the HTTP summary instead of exposing it as a separate property.
    const jsonStart = value.indexOf('{')
    if (jsonStart < 0) return undefined
    try {
      return JSON.parse(value.slice(jsonStart))
    } catch {
      return undefined
    }
  }
}

function operationOutcomeFrom(error: unknown): Record<string, any> | undefined {
  const candidate = asRecord(error)
  const values = [
    candidate?.operationOutcome,
    candidate?.responseBody,
    candidate?.body,
    candidate?.data,
    candidate?.response?.data,
    candidate?.response?.body,
    candidate?.message,
  ]

  for (const value of values) {
    const parsed = parsePossibleJson(value)
    const record = asRecord(parsed)
    if (record?.resourceType === 'OperationOutcome') return record
  }
  return undefined
}

export function httpStatusFromFhirError(error: unknown): number | undefined {
  const candidate = asRecord(error)
  const status = candidate?.status
    ?? candidate?.statusCode
    ?? candidate?.response?.status
  return typeof status === 'number' ? status : undefined
}

function conciseErrorMessage(error: unknown, diagnostics?: string): string | undefined {
  if (diagnostics) return diagnostics.slice(0, 500)
  if (error instanceof Error && error.message) return error.message.slice(0, 500)
  if (typeof error === 'string') return error.slice(0, 500)
  return undefined
}

export function classifyFhirQueryError(
  error: unknown,
  resourceType: string,
): ClinicalDataQueryStatus {
  const httpStatus = httpStatusFromFhirError(error)
  const outcome = operationOutcomeFrom(error)
  const issue = Array.isArray(outcome?.issue) ? outcome.issue[0] : undefined
  const diagnostics = issue?.diagnostics ?? issue?.details?.text
  const message = conciseErrorMessage(error, diagnostics)
  const searchableMessage = `${message ?? ''} ${issue?.code ?? ''}`.toLowerCase()

  let state: ClinicalDataQueryStatus['state'] = 'error'
  if (httpStatus === 401) state = 'unauthorized'
  else if (httpStatus === 403) state = 'forbidden'
  else if (
    httpStatus === 404
    || /not[ -]?supported|unsupported|unknown (?:search )?parameter|invalid search parameter|resource type .*not (?:found|supported)/i.test(searchableMessage)
  ) state = 'unsupported'

  return {
    resourceType,
    state,
    ...(httpStatus ? { httpStatus } : {}),
    ...(message ? { message } : {}),
    ...(issue ? {
      operationOutcome: {
        severity: issue.severity,
        code: issue.code,
        diagnostics,
      },
    } : {}),
  }
}

export function successfulFhirQueryStatus(
  resourceType: string,
  count: number,
): ClinicalDataQueryStatus {
  return {
    resourceType,
    state: count > 0 ? 'ok' : 'empty',
    count,
  }
}

/** Only retry after removing optional `_sort`/`_include` features. */
export function shouldRetryBasicFhirSearch(error: unknown): boolean {
  const status = httpStatusFromFhirError(error)
  if (status === 401 || status === 403 || status === 404) return false
  const classified = classifyFhirQueryError(error, 'FHIR')
  const message = classified.message?.toLowerCase() ?? ''
  return status === 400
    || status === 422
    || /sort|include|search parameter|not[ -]?supported|unsupported/.test(message)
}
