import { notFound } from 'next/navigation'
import PipelineReview from './PipelineReview'

export default function SyntheticLipidPipelinePage() {
  if (process.env.NODE_ENV !== 'development') notFound()
  return <PipelineReview />
}
