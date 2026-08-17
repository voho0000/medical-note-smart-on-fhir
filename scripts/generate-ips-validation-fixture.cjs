#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')

const root = path.resolve(__dirname, '..')
const originalResolveFilename = Module._resolveFilename
Module._resolveFilename = function resolveProjectAlias(request, parent, isMain, options) {
  const resolvedRequest = request.startsWith('@/') ? path.join(root, request.slice(2)) : request
  return originalResolveFilename.call(this, resolvedRequest, parent, isMain, options)
}

require('ts-node').register({
  transpileOnly: true,
  compilerOptions: {
    module: 'commonjs',
    moduleResolution: 'node',
    target: 'es2020',
    rootDir: root,
    ignoreDeprecations: '6.0',
  },
})

const { buildIpsBundle } = require('../features/ips-export/utils/ips-builder.ts')

const output = path.resolve(process.argv[2] || 'tmp/ips-validation/health-bank-summary.json')
const data = {
  conditions: [{
    id: 'condition-1',
    clinicalStatus: 'active',
    verificationStatus: 'confirmed',
    recordedDate: '2026-01-01',
    code: { text: 'Type 2 diabetes mellitus', coding: [{ system: 'http://hl7.org/fhir/sid/icd-10', code: 'E11.9' }] },
  }],
  medications: [],
  allergies: [],
  observations: [],
  vitalSigns: [],
  diagnosticReports: [],
  imagingStudies: [],
  procedures: [],
  encounters: [],
  documentReferences: [],
  compositions: [],
  immunizations: [],
  consents: [],
  devices: [],
  carePlans: [],
}
const patient = {
  id: 'validation-patient',
  resourceType: 'Patient',
  name: [{ text: 'Validation Patient' }],
  gender: 'unknown',
  birthDate: '1970-01-01',
}
const bundle = buildIpsBundle({ patient, data, now: new Date('2026-08-07T00:00:00Z') })

fs.mkdirSync(path.dirname(output), { recursive: true })
fs.writeFileSync(output, `${JSON.stringify(bundle, null, 2)}\n`)
console.log(output)
