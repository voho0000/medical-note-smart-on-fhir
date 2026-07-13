import {
  classifyFhirQueryError,
  shouldRetryBasicFhirSearch,
  successfulFhirQueryStatus,
} from '@/src/infrastructure/fhir/utils/fhir-query-status'

describe('FHIR query status', () => {
  it('classifies HTTP authorization failures without calling them empty', () => {
    expect(classifyFhirQueryError({ status: 401, message: 'expired' }, 'Condition')).toMatchObject({
      state: 'unauthorized',
      httpStatus: 401,
    })
    expect(classifyFhirQueryError({ response: { status: 403 } }, 'Observation')).toMatchObject({
      state: 'forbidden',
      httpStatus: 403,
    })
  })

  it('extracts OperationOutcome diagnostics and detects unsupported searches', () => {
    const status = classifyFhirQueryError({
      status: 400,
      responseBody: {
        resourceType: 'OperationOutcome',
        issue: [{
          severity: 'error',
          code: 'not-supported',
          diagnostics: 'Unknown search parameter _include:iterate',
        }],
      },
    }, 'DiagnosticReport')

    expect(status).toMatchObject({
      state: 'unsupported',
      message: 'Unknown search parameter _include:iterate',
      operationOutcome: {
        severity: 'error',
        code: 'not-supported',
      },
    })
  })

  it('parses the OperationOutcome appended to a fhirclient HttpError message', () => {
    const status = classifyFhirQueryError({
      status: 400,
      message: `400 Bad Request\nURL: https://ehr.example/fhir/Condition\n\n${JSON.stringify({
        resourceType: 'OperationOutcome',
        issue: [{ code: 'not-supported', diagnostics: 'Unknown search parameter _sort' }],
      })}`,
    }, 'Condition')

    expect(status.state).toBe('unsupported')
    expect(status.operationOutcome?.diagnostics).toBe('Unknown search parameter _sort')
  })

  it('records true empty searches as successful empty results', () => {
    expect(successfulFhirQueryStatus('Condition', 0)).toEqual({
      resourceType: 'Condition',
      state: 'empty',
      count: 0,
    })
  })

  it('only removes optional search features for compatible failures', () => {
    expect(shouldRetryBasicFhirSearch(new Error('Sort not supported'))).toBe(true)
    expect(shouldRetryBasicFhirSearch({ status: 400, message: 'bad _include' })).toBe(true)
    expect(shouldRetryBasicFhirSearch({ status: 403, message: 'Forbidden' })).toBe(false)
    expect(shouldRetryBasicFhirSearch(new Error('Network unavailable'))).toBe(false)
  })
})
