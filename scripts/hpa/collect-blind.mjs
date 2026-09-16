// Final, separately seeded synthetic check. Run only after fixing the local
// model; do not use these responses for coefficient estimation or selection.
import { writeFile } from 'node:fs/promises'

const BASE = 'https://cdrc.hpa.gov.tw'
const OUTPUT = new URL('../../__tests__/features/medical-calculator/fixtures/hpa-official-blind-2026-09-16.json', import.meta.url)
const EXPECTED = ['CHDRiskV3', 'DiabetesRiskV3', 'HypertensionRiskV3', 'StrokeRiskV3', 'MACERisk']
const RANGES = {
  age: [35, 70], height: [150, 190], weight: [45, 115], waist: [60, 125],
  sbp: [90, 139], glu: [70, 125], chol: [120, 300], tg: [45, 400],
  ldlc: [45, 220], hdlc: [25, 95],
}
let seed = 0xa11ce026
function random() {
  seed ^= seed << 13
  seed ^= seed >>> 17
  seed ^= seed << 5
  return (seed >>> 0) / 2 ** 32
}
function integer(low, high) { return low + Math.floor(random() * (high - low + 1)) }

function makeCases() {
  return Array.from({ length: 60 }, (_, i) => {
    const input = { gender: i % 2 }
    for (const [key, [low, high]] of Object.entries(RANGES)) {
      const innerLow = Math.round(low + .2 * (high - low))
      const innerHigh = Math.round(high - .2 * (high - low))
      input[key] = i % 3 === 0 ? integer(innerLow, innerHigh) : integer(low, high)
    }
    input.diabetes = random() < .12 ? 1 : 0
    input.hbp = random() < .16 ? 1 : 0
    input.smoke = random() < .22 ? 1 : 0
    return input
  })
}

async function main() {
  const tokenResponse = await fetch(`${BASE}/nhri2/api/open/hra/v4/token`, {
    headers: { 'X-CSRF-Token': 'Fetch', Referer: `${BASE}/hra-openservice-menupage.jsp?all` },
  })
  const token = tokenResponse.headers.get('X-CSRF-Token')
  const cookie = tokenResponse.headers.getSetCookie().map((item) => item.split(';', 1)[0]).join('; ')
  if (!tokenResponse.ok || !token || !cookie) throw new Error(`Official form unavailable: HTTP ${tokenResponse.status}`)
  const records = []
  for (const input of makeCases()) {
    await new Promise((resolve) => setTimeout(resolve, 900))
    const response = await fetch(`${BASE}/nhri2/api/open/hra/v4/allmodel`, {
      method: 'POST',
      headers: {
        'X-CSRF-Token': token, Cookie: cookie, Referer: `${BASE}/hra-openservice-menupage.jsp?all`,
        'Content-Type': 'application/json; charset=utf-8', Accept: 'application/json',
      },
      body: JSON.stringify(Object.fromEntries(Object.entries(input).map(([key, value]) => [key, String(value)]))),
    })
    if (!response.ok) throw new Error(`Official form stopped after ${records.length} cases: HTTP ${response.status}`)
    const body = await response.json()
    if (body.code !== 0 || !Array.isArray(body.data) || body.data.length !== 5 ||
        body.data.some((item, index) => item.model !== EXPECTED[index] || !Number.isFinite(item.risk))) {
      throw new Error(`Unexpected official response after ${records.length} cases`)
    }
    records.push({ input, official: body.data.map((item) => item.risk),
      populationAvg: body.data.map((item) => item.populationAvg),
      multipleDiff: body.data.map((item) => item.multipleDiff) })
    if (records.length % 20 === 0) console.log(`Verified ${records.length}/60 synthetic profiles`)
  }
  await writeFile(OUTPUT, `${JSON.stringify({
    source: `${BASE}/hra-openservice-menupage.jsp?all`, collectedAt: new Date().toISOString(),
    syntheticOnly: true, seed: '0xa11ce026', count: records.length, records,
  }, null, 2)}\n`)
  console.log('Saved 60 final blind synthetic profiles.')
}

main().catch((error) => { console.error(error.message); process.exitCode = 1 })
