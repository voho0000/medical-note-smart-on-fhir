// app/layout.tsx
import "./globals.css"
import type { Metadata } from "next"
import { Toaster } from "sonner"

export const metadata: Metadata = {
  title: "MediPrisma · SMART on FHIR",
  description: "A modular SMART on FHIR app with clinical summary and medical note features.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning silences false-positive mismatches caused by
    // browser extensions (Dark Reader, 1Password, Google Translate, etc.)
    // injecting attributes / classes into <html> and <body> before React
    // hydrates. These injections look identical to a real hydration mismatch
    // in Next.js 16's stricter check. The official Next.js fix:
    // https://nextjs.org/docs/messages/react-hydration-error
    <html lang="zh-TW" suppressHydrationWarning>
      <head>
        {/* Allow pinch-zoom — disabling it (maximum-scale=1, user-scalable=no)
            fails WCAG 1.4.4 and blocks low-vision users from zooming dense lab
            tables. The in-app font-size control complements, not replaces, zoom. */}
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </head>
      <body suppressHydrationWarning>
        {children}
        <Toaster richColors closeButton position="top-center" />
      </body>
    </html>
  )
}
