import { notFound } from 'next/navigation'
import { QueryProvider } from '@/src/application/providers/query-provider'
import ReviewClient from './ReviewClient'
export default function LipidReviewPage() {
  if (process.env.NODE_ENV !== 'development') notFound()
  // The heart-failure baseline draws a rhythm panel, which reads the record
  // through React Query; without the provider that scenario throws before it
  // renders. The synthetic profiles never fetch, so the client stays idle.
  return <QueryProvider><ReviewClient /></QueryProvider>
}
