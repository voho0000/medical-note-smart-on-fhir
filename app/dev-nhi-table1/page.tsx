import { notFound } from 'next/navigation'
import ReviewClient from './ReviewClient'

/**
 * 表一 panel against synthetic profiles, for review without a launch.
 *
 * Development only: the profiles below never touch a record, and the adapter's
 * behaviour on real bundles is covered by the package's own fixtures.
 */
export default function NhiTable1ReviewPage() {
  if (process.env.NODE_ENV !== 'development') notFound()
  return <ReviewClient />
}
