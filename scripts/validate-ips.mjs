#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync } from 'node:fs'
import { get } from 'node:https'
import { resolve, dirname } from 'node:path'
import { spawnSync } from 'node:child_process'

const VALIDATOR_VERSION = '6.10.1'
const VALIDATOR_SHA256 = 'e1b75e86c32d6ea02708027d4bd462e4f853f842579e217bf1b4f5c26b733738'
const VALIDATOR_URL = `https://github.com/hapifhir/org.hl7.fhir.core/releases/download/${VALIDATOR_VERSION}/validator_cli.jar`
const IPS_PACKAGE = 'hl7.fhir.uv.ips#2.0.1'
const IPS_BUNDLE_PROFILE = 'http://hl7.org/fhir/uv/ips/StructureDefinition/Bundle-uv-ips'

function usage() {
  console.error('Usage: npm run validate:ips -- <ips-bundle.json> [additional validator arguments]')
}

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

function download(url, destination, redirects = 0) {
  if (redirects > 8) return Promise.reject(new Error('Too many redirects while downloading the validator'))
  return new Promise((resolveDownload, reject) => {
    get(url, (response) => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume()
        download(new URL(response.headers.location, url).toString(), destination, redirects + 1)
          .then(resolveDownload, reject)
        return
      }
      if (response.statusCode !== 200) {
        response.resume()
        reject(new Error(`Validator download failed with HTTP ${response.statusCode}`))
        return
      }
      const stream = createWriteStream(destination)
      response.pipe(stream)
      stream.on('finish', () => stream.close(resolveDownload))
      stream.on('error', reject)
    }).on('error', reject)
  })
}

async function ensureValidator() {
  const configured = process.env.FHIR_VALIDATOR_JAR
  if (configured) return resolve(configured)

  const jar = resolve('node_modules', '.cache', 'fhir-validator', VALIDATOR_VERSION, 'validator_cli.jar')
  if (existsSync(jar) && sha256(jar) === VALIDATOR_SHA256) return jar

  mkdirSync(dirname(jar), { recursive: true })
  const partial = `${jar}.partial`
  if (existsSync(partial)) unlinkSync(partial)
  console.error(`Downloading pinned HL7 FHIR validator ${VALIDATOR_VERSION}…`)
  await download(VALIDATOR_URL, partial)
  const actual = sha256(partial)
  if (actual !== VALIDATOR_SHA256) {
    unlinkSync(partial)
    throw new Error(`Validator checksum mismatch: expected ${VALIDATOR_SHA256}, received ${actual}`)
  }
  renameSync(partial, jar)
  return jar
}

const [input, ...rawExtraArgs] = process.argv.slice(2)
if (!input) {
  usage()
  process.exit(2)
}

const file = resolve(input)
if (!existsSync(file)) {
  console.error(`IPS Bundle not found: ${file}`)
  process.exit(2)
}

try {
  const jar = await ensureValidator()
  const onlineTerminology = rawExtraArgs.includes('--online-terminology')
  const extraArgs = rawExtraArgs.filter((arg) => arg !== '--online-terminology')
  const hasTerminologyOption = extraArgs.includes('-tx')
  const args = [
    '-jar', jar, file,
    '-version', '4.0.1',
    '-ig', IPS_PACKAGE,
    '-profile', IPS_BUNDLE_PROFILE,
    ...(!onlineTerminology && !hasTerminologyOption ? ['-tx', 'n/a'] : []),
    ...extraArgs,
  ]
  const result = spawnSync('java', args, { stdio: 'inherit' })
  if (result.error) throw result.error
  process.exit(result.status ?? 1)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
