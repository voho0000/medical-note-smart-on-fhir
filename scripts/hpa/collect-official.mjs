// Research-only collector for synthetic profiles submitted through the public
// HPA five-risk form's documented browser flow. Never pass patient data here.
// Run explicitly; this is not imported by the application or test suite.
import { writeFile } from 'node:fs/promises'

const BASE = 'https://cdrc.hpa.gov.tw'
const OUTPUT = new URL('../../__tests__/features/medical-calculator/fixtures/hpa-official-research-2026-09-16.json', import.meta.url)
const EXPECTED_MODELS = ['CHDRiskV3', 'DiabetesRiskV3', 'HypertensionRiskV3', 'StrokeRiskV3', 'MACERisk']

let seed = 0x5eed2026
function random() {
  seed ^= seed << 13
  seed ^= seed >>> 17
  seed ^= seed << 5
  return (seed >>> 0) / 2 ** 32
}
function integer(min, max) { return min + Math.floor(random() * (max - min + 1)) }

const BASELINE = {
  age: 50, height: 170, weight: 70, waist: 85, sbp: 120, glu: 90,
  chol: 180, tg: 100, ldlc: 100, hdlc: 50, diabetes: 0, hbp: 0, smoke: 0,
}
const FACTORS = {
  age: [35, 42, 58, 70], height: [150, 160, 180, 190],
  weight: [45, 55, 90, 115], waist: [60, 72, 105, 125],
  sbp: [90, 105, 132, 139], glu: [70, 80, 110, 125],
  chol: [120, 150, 230, 300], tg: [45, 75, 250, 400],
  ldlc: [45, 75, 160, 220], hdlc: [25, 35, 70, 95],
  diabetes: [1], hbp: [1], smoke: [1],
}
const LIMITS = {
  age: [35, 70], height: [150, 190], weight: [45, 115], waist: [60, 125],
  sbp: [90, 139], glu: [70, 125], chol: [120, 300], tg: [45, 400],
  ldlc: [45, 220], hdlc: [25, 95],
}

function makeCases() {
  const cases = []
  for (const gender of [0, 1]) {
    cases.push({ kind: 'baseline', input: { gender, ...BASELINE } })
    for (const [key, levels] of Object.entries(FACTORS)) {
      for (const value of levels) {
        cases.push({ kind: 'one-factor', factor: key, input: { gender, ...BASELINE, [key]: value } })
      }
    }
  }
  for (let i = 0; i < 160; i++) {
    const input = { ...BASELINE, gender: i % 2 }
    const central = i % 4 < 2
    for (const [key, [low, high]] of Object.entries(LIMITS)) {
      const innerLow = Math.round(low + (high - low) * .18)
      const innerHigh = Math.round(high - (high - low) * .18)
      input[key] = central ? integer(innerLow, innerHigh) : integer(low, high)
    }
    input.diabetes = random() < .12 ? 1 : 0
    input.hbp = random() < .16 ? 1 : 0
    input.smoke = random() < .22 ? 1 : 0
    cases.push({ kind: i >= 120 ? 'fresh-holdout' : 'random', input })
  }
  return cases
}

function cookieHeader(response) {
  return response.headers.getSetCookie().map((item) => item.split(';', 1)[0]).join('; ')
}

async function main() {
  const tokenResponse = await fetch(`${BASE}/nhri2/api/open/hra/v4/token`, {
    headers: { 'X-CSRF-Token': 'Fetch', Referer: `${BASE}/hra-openservice-menupage.jsp?all` },
  })
  const token = tokenResponse.headers.get('X-CSRF-Token')
  const cookie = cookieHeader(tokenResponse)
  if (!tokenResponse.ok || !token || !cookie) throw new Error(`Official form session unavailable: HTTP ${tokenResponse.status}`)

  const cases = makeCases()
  const records = []
  for (let index = 0; index < cases.length; index++) {
    // Single-threaded, at most approximately one profile per second. Stop on
    // any HTTP/application error instead of probing past rate/maintenance gates.
    await new Promise((resolve) => setTimeout(resolve, 900))
    const { input, ...metadata } = cases[index]
    const response = await fetch(`${BASE}/nhri2/api/open/hra/v4/allmodel`, {
      method: 'POST',
      headers: {
        'X-CSRF-Token': token, Cookie: cookie, Referer: `${BASE}/hra-openservice-menupage.jsp?all`,
        'Content-Type': 'application/json; charset=utf-8', Accept: 'application/json',
      },
      body: JSON.stringify(Object.fromEntries(Object.entries(input).map(([key, value]) => [key, String(value)]))),
    })
    if (!response.ok) throw new Error(`Official form stopped at ${index + 1}/${cases.length}: HTTP ${response.status}`)
    const body = await response.json()
    if (body.code !== 0 || !Array.isArray(body.data) || body.data.length !== 5 ||
        body.data.some((item, itemIndex) => item.model !== EXPECTED_MODELS[itemIndex] || !Number.isFinite(item.risk))) {
      throw new Error(`Unexpected official response at ${index + 1}/${cases.length}`)
    }
    records.push({ ...metadata, input, official: body.data.map((item) => item.risk),
      populationAvg: body.data.map((item) => item.populationAvg),
      multipleDiff: body.data.map((item) => item.multipleDiff) })
    if ((index + 1) % 25 === 0) console.log(`Collected ${index + 1}/${cases.length} synthetic profiles`)
  }
  await writeFile(OUTPUT, `${JSON.stringify({
    source: `${BASE}/hra-openservice-menupage.jsp?all`, collectedAt: new Date().toISOString(),
    syntheticOnly: true, count: records.length, records,
  }, null, 2)}\n`)
  console.log(`Saved ${records.length} synthetic profiles; last 40 random profiles reserved as a fresh holdout.`)
}

main().catch((error) => { console.error(error.message); process.exitCode = 1 })
