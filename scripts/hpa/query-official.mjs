// Explicit, research-only public-form queries. Plans must contain synthetic
// profiles only; no application code imports this module.
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { parseArgs } from 'node:util'

const { values } = parseArgs({ options: { plan: { type: 'string' }, out: { type: 'string' }, resume: { type: 'boolean' } } })
const BASE = 'https://cdrc.hpa.gov.tw'
const MODELS = ['CHDRiskV3', 'DiabetesRiskV3', 'HypertensionRiskV3', 'StrokeRiskV3', 'MACERisk']
const RANGES = { gender: [0, 1], age: [35, 70], height: [150, 190], weight: [45, 115], waist: [60, 125],
  sbp: [90, 139], glu: [70, 125], chol: [120, 300], tg: [45, 400], ldlc: [45, 220], hdlc: [25, 95],
  diabetes: [0, 1], hbp: [0, 1], smoke: [0, 1] }

async function request(url, init) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(30000) })
    } catch (error) {
      // Only bounded transport retries for this stateless synthetic calculator.
      // HTTP errors (including 403/429) are returned and stopped by the caller.
      const transient = ['UND_ERR_SOCKET', 'UND_ERR_CONNECT_TIMEOUT', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN'].includes(error.cause?.code)
      if (!transient || attempt >= 2) throw error
      const delay = (attempt + 1) * 15000
      console.log(`Transport interruption (${error.cause.code}); waiting ${delay / 1000}s before retry ${attempt + 1}/2`)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
}

async function main() {
  if (!values.plan || !values.out) throw new Error('Usage: --plan synthetic-plan.json --out results.json [--resume]')
  const planText = await readFile(values.plan, 'utf8')
  const plan = JSON.parse(planText)
  if (plan.syntheticOnly !== true || !Array.isArray(plan.records) || plan.records.length > 1000) throw new Error('Invalid synthetic plan')
  for (const { input } of plan.records) {
    if (Object.keys(input).length !== Object.keys(RANGES).length) throw new Error('Unexpected input fields')
    for (const [key, [low, high]] of Object.entries(RANGES)) {
      if (!Number.isFinite(input[key]) || input[key] < low || input[key] > high) throw new Error(`Invalid synthetic ${key}`)
    }
    for (const key of ['gender', 'age', 'sbp', 'diabetes', 'hbp', 'smoke']) {
      if (!Number.isInteger(input[key])) throw new Error(`Expected integer ${key}`)
    }
  }
  const planSha256 = createHash('sha256').update(planText).digest('hex')
  let result = { source: `${BASE}/hra-openservice-menupage.jsp?all`, syntheticOnly: true,
    purpose: plan.purpose, planSha256, candidateSha256: plan.candidateSha256, seed: plan.seed,
    startedAt: new Date().toISOString(), complete: false, records: [] }
  if (values.resume) {
    result = JSON.parse(await readFile(values.out, 'utf8'))
    if (result.planSha256 !== planSha256 || result.complete) throw new Error('Resume requires the same incomplete plan')
  } else {
    await writeFile(values.out, `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' })
  }
  const tokenResponse = await request(`${BASE}/nhri2/api/open/hra/v4/token`, {
    headers: { 'X-CSRF-Token': 'Fetch', Referer: result.source, Connection: 'close' }, signal: AbortSignal.timeout(30000),
  }).catch((error) => { error.message = `Public form session: ${error.message}`; throw error })
  const token = tokenResponse.headers.get('X-CSRF-Token')
  const cookie = tokenResponse.headers.getSetCookie().map((item) => item.split(';', 1)[0]).join('; ')
  if (!tokenResponse.ok || !token || !cookie) throw new Error(`Public form session unavailable: HTTP ${tokenResponse.status}`)
  for (let i = result.records.length; i < plan.records.length; i++) {
    await new Promise((resolve) => setTimeout(resolve, 900))
    const { input, ...metadata } = plan.records[i]
    const response = await request(`${BASE}/nhri2/api/open/hra/v4/allmodel`, {
      method: 'POST', signal: AbortSignal.timeout(30000),
      headers: { 'X-CSRF-Token': token, Cookie: cookie, Referer: result.source,
        'Content-Type': 'application/json; charset=utf-8', Accept: 'application/json', Connection: 'close' },
      body: JSON.stringify(Object.fromEntries(Object.entries(input).map(([key, value]) => [key, String(value)]))),
    }).catch((error) => { error.message = `Profile ${i + 1}: ${error.message}`; throw error })
    if (!response.ok) throw new Error(`Stopped at ${i + 1}: HTTP ${response.status}`)
    const body = await response.json()
    if (body.code !== 0 || !Array.isArray(body.data) || body.data.length !== 5 ||
        body.data.some((item, j) => item.model !== MODELS[j] || item.ver !== 4 ||
          !Number.isInteger(item.risk) || item.risk < 0 || item.risk > 100 ||
          !Number.isFinite(item.populationAvg) || item.populationAvg <= 0 ||
          !Number.isFinite(item.multipleDiff) || item.multipleDiff < 0)) {
      throw new Error(`Unexpected public model response at ${i + 1}`)
    }
    result.records.push({ ...metadata, input, official: body.data.map((item) => item.risk),
      populationAvg: body.data.map((item) => item.populationAvg), multipleDiff: body.data.map((item) => item.multipleDiff) })
    // Every successful response survives a later connection/rate-limit failure.
    await writeFile(values.out, `${JSON.stringify(result, null, 2)}\n`)
    if ((i + 1) % 20 === 0) console.log(`Collected ${i + 1}/${plan.records.length} synthetic profiles`)
  }
  result.complete = true
  result.completedAt = new Date().toISOString()
  result.count = result.records.length
  await writeFile(values.out, `${JSON.stringify(result, null, 2)}\n`)
  console.log(`Complete: ${result.count} profiles; ${values.out}`)
}

main().catch((error) => {
  // Report only a transport code, never request headers/session credentials.
  console.error(error.message, error.cause?.code ?? '')
  process.exitCode = 1
})
