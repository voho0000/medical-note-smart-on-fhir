import { notFound } from 'next/navigation'
import ReviewClient from './ReviewClient'
export default function LipidReviewPage() {
  if (process.env.NODE_ENV !== 'development') notFound()
  return <ReviewClient />
}
