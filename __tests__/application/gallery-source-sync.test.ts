// Exercise the actual serialization boundaries used by both account libraries.
jest.mock('@/src/infrastructure/firebase/user-collection-sync', () => ({
  createUserCollectionSync: jest.fn(() => ({})),
}))
import { createUserCollectionSync } from '@/src/infrastructure/firebase/user-collection-sync'
import '@/src/infrastructure/firebase/template-sync'
import '@/src/infrastructure/firebase/clinical-insights-sync'

const configs = jest.mocked(createUserCollectionSync).mock.calls.map(([config]) => config)

it.each(['chatTemplates', 'clinicalInsightPanels'])('%s preserves gallery provenance across account sync', collectionName => {
  const config = configs.find(config => config.collectionName === collectionName)!
  const sourcePromptKey = '["hospital","prompt-1"]'
  const stored = config.toDoc({
    id: 'local-id', label: 'Chat', content: 'Edited chat', title: 'Summary', prompt: 'Edited summary',
    audience: 'medical', order: 0, showInSummary: false, autoGenerate: false,
    outputFormat: 'markdown', languagePolicy: 'interface-language', sourcePromptKey, sourcePromptFingerprint: 'source-fingerprint',
  }, { toDate: () => new Date(0) } as never)
  expect(stored.sourcePromptKey).toBe(sourcePromptKey)
  expect(config.fromDoc('local-id', stored)).toMatchObject({ sourcePromptKey, sourcePromptFingerprint: 'source-fingerprint' })
  const { sourcePromptKey: _source, ...legacy } = stored
  expect(config.fromDoc('local-id', legacy)).toHaveProperty('sourcePromptKey', undefined)
})
