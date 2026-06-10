// app/layout.tsx
import "./globals.css"
import type { Metadata } from "next"
import { TwcatBootstrap } from "./twcat-bootstrap"

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
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      </head>
      <body suppressHydrationWarning>
        <TwcatBootstrap />
        {children}
      </body>
    </html>
  )
}
