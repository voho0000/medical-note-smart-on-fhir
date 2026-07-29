import {
  pdfPageUrl,
  resolvePublicAssetUrl,
} from '@/features/clinical-decision-support/knowledge-packs/shared'

describe('CDSS knowledge-pack public asset URLs', () => {
  it('keeps root-hosted assets unchanged when no base path is configured', () => {
    expect(resolvePublicAssetUrl(
      '/clinical-guidelines/taiwan-t2dm-2022/2022-t2dm-guideline.pdf',
      '',
    )).toBe('/clinical-guidelines/taiwan-t2dm-2022/2022-t2dm-guideline.pdf')
  })

  it('prefixes local guideline PDFs with the deployment base path', () => {
    expect(resolvePublicAssetUrl(
      '/clinical-guidelines/taiwan-t2dm-2022/2022-t2dm-guideline.pdf',
      '/app',
    )).toBe('/app/clinical-guidelines/taiwan-t2dm-2022/2022-t2dm-guideline.pdf')
  })

  it('does not prefix an already resolved or external URL twice', () => {
    expect(resolvePublicAssetUrl(
      '/app/clinical-guidelines/taiwan-t2dm-2022/2022-t2dm-guideline.pdf',
      '/app',
    )).toBe('/app/clinical-guidelines/taiwan-t2dm-2022/2022-t2dm-guideline.pdf')
    expect(resolvePublicAssetUrl(
      'https://www.endo-dm.org.tw/guideline.pdf',
      '/app',
    )).toBe('https://www.endo-dm.org.tw/guideline.pdf')
  })

  it('preserves the requested PDF page after resolving the asset URL', () => {
    expect(pdfPageUrl(
      '/clinical-guidelines/taiwan-t2dm-2022/2022-t2dm-guideline.pdf',
      143,
      '/app',
    )).toBe('/app/clinical-guidelines/taiwan-t2dm-2022/2022-t2dm-guideline.pdf#page=143')
  })
})
