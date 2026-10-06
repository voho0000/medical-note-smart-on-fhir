/** The export tools open the ordinary /app/ URL without a site query.
 * This admission is for explicit CDSS saves/history only, not observation telemetry. */
export function isCdssStorageSite(rawUrl = window.location.href): boolean {
  try {
    const url = new URL(rawUrl)
    const sites = url.searchParams.getAll('site')
    if (sites.length) return sites.length === 1 && sites[0] === 'vghtpe'
    return url.origin === 'https://mediprisma.tw' && ['/app', '/app/'].includes(url.pathname)
  } catch { return false }
}
