// Privacy policy page — renders PRIVACY_POLICY.md from the repo root via
// react-markdown. Server component so the file is read at build time (works
// under Next.js `output: "export"`).
import fs from 'fs'
import path from 'path'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export default function PrivacyPage() {
  const filePath = path.join(process.cwd(), 'PRIVACY_POLICY.md')
  let content = ''
  try {
    content = fs.readFileSync(filePath, 'utf8')
  } catch {
    content = '# Privacy Policy\n\nPrivacy policy unavailable. Please contact the maintainer.'
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <article className="prose prose-sm sm:prose-base dark:prose-invert max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </article>
      </div>
    </main>
  )
}
