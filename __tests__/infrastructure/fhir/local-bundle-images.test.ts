// Unit tests for prepareImagesForStorage — the pure (no-IndexedDB) half of the
// imaging memory optimization. It moves inline base64 out of
// DiagnosticReport.presentedForm into Blobs (persisted separately), leaving a
// `_imageRef` pointer so the retained bundle stays small.

import { prepareImagesForStorage } from '@/src/infrastructure/fhir/services/local-bundle.service'

// 1x1 transparent PNG, raw base64 (no data: prefix) — small but a real decode.
const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

function makeBundle(presentedForm: any[]) {
  return {
    resourceType: 'Bundle',
    entry: [
      { resource: { resourceType: 'Patient', id: 'p1' } },
      { resource: { resourceType: 'DiagnosticReport', id: 'dr1', presentedForm } },
    ],
  }
}

describe('prepareImagesForStorage', () => {
  it('moves an inline base64 image out to a Blob and leaves a _imageRef', () => {
    const bundle = makeBundle([
      { contentType: 'image/png', title: 'Chest X-ray', data: PNG_B64 },
    ])

    const stored = prepareImagesForStorage(bundle)

    // One Blob extracted, keyed by a generated ref.
    expect(stored).toHaveLength(1)
    expect(stored[0].id).toBe('img_0')
    expect(stored[0].blob).toBeInstanceOf(Blob)
    expect(stored[0].blob.type).toBe('image/png')
    expect(stored[0].blob.size).toBeGreaterThan(0)

    // The base64 is gone from the bundle; only a reference (+ metadata) remains.
    const form = (bundle.entry[1].resource as any).presentedForm[0]
    expect(form.data).toBeUndefined()
    expect(form._imageRef).toBe('img_0')
    expect(form.contentType).toBe('image/png')
    expect(form.title).toBe('Chest X-ray')
    expect(form.size).toBe(stored[0].blob.size)
  })

  it('assigns distinct refs across multiple images and reports', () => {
    const bundle = {
      resourceType: 'Bundle',
      entry: [
        {
          resource: {
            resourceType: 'DiagnosticReport',
            id: 'dr1',
            presentedForm: [
              { contentType: 'image/jpeg', data: PNG_B64 },
              { contentType: 'image/jpeg', data: PNG_B64 },
            ],
          },
        },
        {
          resource: {
            resourceType: 'DiagnosticReport',
            id: 'dr2',
            presentedForm: [{ contentType: 'image/png', data: PNG_B64 }],
          },
        },
      ],
    }

    const stored = prepareImagesForStorage(bundle)

    expect(stored.map((s) => s.id)).toEqual(['img_0', 'img_1', 'img_2'])
    const refs = bundle.entry.flatMap((e: any) =>
      e.resource.presentedForm.map((f: any) => f._imageRef),
    )
    expect(refs).toEqual(['img_0', 'img_1', 'img_2'])
  })

  it('leaves non-image attachments untouched', () => {
    const bundle = makeBundle([
      { contentType: 'application/pdf', title: 'Report.pdf', data: PNG_B64 },
    ])

    const stored = prepareImagesForStorage(bundle)

    expect(stored).toHaveLength(0)
    const form = (bundle.entry[1].resource as any).presentedForm[0]
    expect(form.data).toBe(PNG_B64) // not stripped
    expect(form._imageRef).toBeUndefined()
  })

  it('leaves malformed base64 inline rather than dropping it', () => {
    // A '%' is not valid base64 → atob throws → we keep the entry inline.
    const bundle = makeBundle([{ contentType: 'image/jpeg', data: '%%%not-base64%%%' }])

    const stored = prepareImagesForStorage(bundle)

    expect(stored).toHaveLength(0)
    const form = (bundle.entry[1].resource as any).presentedForm[0]
    expect(form.data).toBe('%%%not-base64%%%')
    expect(form._imageRef).toBeUndefined()
  })

  it('is a no-op for reports without presentedForm', () => {
    const bundle = {
      resourceType: 'Bundle',
      entry: [{ resource: { resourceType: 'DiagnosticReport', id: 'dr1', conclusion: 'Normal' } }],
    }

    const stored = prepareImagesForStorage(bundle)

    expect(stored).toHaveLength(0)
    expect((bundle.entry[0].resource as any).conclusion).toBe('Normal')
  })
})
