import { notFound } from 'next/navigation'
import { CoronaryPreview } from '@/features/clinical-decision-support/dev/CoronaryPreview'
import { CORONARY_PREVIEW_SCENARIOS, type CoronaryPreviewScenario } from '@/features/clinical-decision-support/dev/coronary-preview-profile'

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (process.env.NODE_ENV !== 'development') notFound()
  const params = await searchParams
  const scenario = CORONARY_PREVIEW_SCENARIOS.includes(params.scenario as CoronaryPreviewScenario)
    ? params.scenario as CoronaryPreviewScenario : 'stable'
  return <CoronaryPreview scenario={scenario} english={params.lang === 'en'} classic={params.layout === 'classic'} />
}
