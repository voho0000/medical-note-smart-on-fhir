import { notFound } from 'next/navigation'
import Preview from './Preview'

export default function HypertensionPreviewPage() {
  if (process.env.NODE_ENV !== 'development') notFound()
  return <Preview />
}
