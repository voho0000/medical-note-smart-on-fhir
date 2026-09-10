import { useCallback } from 'react'
import { useGenerateInsight } from '@/src/application/hooks/clinical-insights/use-generate-insight.hook'
import { useUnifiedAi } from '@/src/application/hooks/ai/use-unified-ai.hook'
import { useLanguage } from '@/src/application/providers/language.provider'
import { useEffectiveModel } from '@/src/application/stores/model-prefs.store'
import type {
  InsightLanguagePolicy,
  InsightOutputFormat,
} from '@/src/shared/constants/clinical-insights.constants'
import { EXAMPLE_OUTPUT_MAX_LENGTH } from '@/features/prompt-gallery/services/prompt-gallery.service'
import { loadDemoExampleContext } from '@/src/application/services/demo-example-context.service'

interface GenerateDemoExampleOptions {
  prompt: string
  outputFormat: InsightOutputFormat
  languagePolicy?: InsightLanguagePolicy
}

export function useDemoExampleOutput() {
  const { locale } = useLanguage()
  const model = useEffectiveModel('insights')
  const generateInsight = useGenerateInsight()
  const { query } = useUnifiedAi()

  return useCallback(async ({
    prompt,
    outputFormat,
    languagePolicy,
  }: GenerateDemoExampleOptions): Promise<string> => {
    const { clinicalContext, piiLiterals } = await loadDemoExampleContext()
    const input = {
      prompt,
      clinicalContext,
      piiLiterals,
      modelId: model,
      locale: locale === 'zh-TW' ? 'zh-TW' as const : 'en' as const,
      outputFormat,
      languagePolicy,
    }
    const validation = generateInsight.validate(input)
    if (!validation.valid) throw new Error(validation.error)

    const output = (await query(generateInsight.buildMessages(input), {
      modelId: model,
      requestedModelId: model,
      maxTokens: 3_000,
      operationKey: 'prompt-gallery:demo-example',
      diagnosticFeature: 'prompt-gallery-example',
    })).trim()
    if (!output) throw new Error('Generated example output is empty')
    return output.slice(0, EXAMPLE_OUTPUT_MAX_LENGTH)
  }, [generateInsight, locale, model, query])
}
