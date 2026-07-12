// app/layout.tsx
import "./globals.css"
import type { Metadata } from "next"
import { Toaster } from "sonner"

export const metadata: Metadata = {
  title: "MediPrisma · SMART on FHIR",
  description: "A modular SMART on FHIR app with clinical summary and medical note features.",
}

// Content-Security-Policy for the STATIC export. next.config.ts `headers()`
// is dead on GH Pages / mediprisma.tw (the CDN / static mirror serve files
// without our headers), so the policy must ship as a <meta> tag.
// Scope and limits:
// - script-src: 'self' + inline (a static Next export emits inline bootstrap /
//   RSC-payload scripts, so 'unsafe-inline' is unavoidable) + Google hosts for
//   reCAPTCHA v3 (Firebase App Check) and the auth popup helper. The real win
//   is blocking script loads from every OTHER origin — DOMPurify remains the
//   defense for inline injection; CSP removes the remote-script blast radius.
// - connect-src stays broad (https:) because SMART on FHIR must reach an
//   arbitrary `iss` FHIR server chosen at launch time.
// - frame-ancestors CANNOT be set via <meta> (per spec) — embedding control
//   stays in next.config.ts headers() / the mediprisma.tw web server.
// - Production only: `next dev` needs eval/websockets for HMR.
const CSP_CONTENT = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://www.google.com https://www.gstatic.com https://apis.google.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https: wss: blob:",
  "media-src 'self' blob: data:",
  "frame-src https://*.firebaseapp.com https://accounts.google.com https://www.google.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

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
        {process.env.NODE_ENV === 'production' && (
          <meta httpEquiv="Content-Security-Policy" content={CSP_CONTENT} />
        )}
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
