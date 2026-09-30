import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { detectOptionalPackages } from './optional-package-state.mjs'

export function optionalBuildConfig(root, options = {}) {
  const state = options.state ?? detectOptionalPackages(root)
  const sdkImport = options.sdkImport ?? (existsSync(join(root, 'vendor/nhi-fhir-bridge-sdk-json/browser.js')) && existsSync(join(root, 'vendor/nhi-fhir-bridge-sdk-json/browser.d.ts')))
  /** @type {Record<string, string>} */
  const aliases = {}
  const excluded = []
  const fallback = (name, file) => { aliases[name] = `./src/optional/${file}` }
  if (!state.labs) {
    for (const subpath of ['', '/canonical', '/display']) {
      fallback(`@voho0000/clinical-lab-normalization${subpath}`, 'lab-normalize.ts')
    }
    fallback('@voho0000/clinical-lab-normalization/interpretation', 'lab-interpretation.ts')
  }
  if (!state.fhir) fallback('@voho0000/personalized-care-fhir', 'fhir-helpers.ts')
  if (!state.care) {
    fallback('@/features/clinical-decision-support/LiveFeature', 'unavailable-cdss.tsx')
    fallback('@/features/clinical-decision-support/guideline-packs/registry', 'care-registry.ts')
    for (const preview of ['app/dev/af/preview', 'app/dev/cdss-scenarios/view/view', 'app/dev-nhi-table1/ReviewClient', 'app/dev-nhi-table1/pipeline/PipelineReview']) {
      fallback(`@/${preview}`, 'unavailable-cdss.tsx')
    }
    excluded.push('features/clinical-decision-support/**', 'app/dev/af/preview.tsx', 'app/dev/cdss-scenarios/view/view.tsx',
      'app/dev-nhi-table1/ReviewClient.tsx', 'app/dev-nhi-table1/pipeline/**')
  }
  if (!state.education) {
    fallback('@/features/personalized-education/module', 'education-module.ts')
    fallback('@/features/personalized-education/LiveFeature', 'unavailable-education.tsx')
    excluded.push('features/personalized-education/**')
  }
  if (!sdkImport) fallback('@/vendor/nhi-fhir-bridge-sdk-json/browser.js', 'sdk-json.ts')
  return { aliases, excluded, env: {
    NEXT_PUBLIC_CDSS_AVAILABLE: String(state.care),
    NEXT_PUBLIC_SDK_IMPORT_AVAILABLE: String(sdkImport),
  } }
}

export function writeOptionalBuildTsconfig(root, config) {
  if (!Object.keys(config.aliases).length) return 'tsconfig.build.json'
  const base = JSON.parse(readFileSync(join(root, 'tsconfig.build.json'), 'utf8'))
  const file = 'tsconfig.optional.generated.json'
  const content = JSON.stringify({
    extends: './tsconfig.build.json',
    compilerOptions: { paths: {
      '@/*': ['./*'],
      ...Object.fromEntries(Object.entries(config.aliases).map(([name, file]) => [name, [file]])),
    } },
    exclude: [...base.exclude, ...config.excluded],
  }, null, 2) + '\n'
  const target = resolve(root, file)
  if (!existsSync(target) || readFileSync(target, 'utf8') !== content) writeFileSync(target, content)
  return file
}
