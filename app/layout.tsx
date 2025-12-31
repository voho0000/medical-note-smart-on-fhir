// app/layout.tsx
import "./globals.css"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "MediPrisma · SMART on FHIR",
  description: "A modular SMART on FHIR app with clinical summary and medical note features.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  
  return (
    <html lang="zh-TW">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <link rel="icon" href={`${basePath}/favicon.ico`} sizes="any" />
        <link rel="icon" href={`${basePath}/icon.svg`} type="image/svg+xml" />
        <link rel="apple-touch-icon" href={`${basePath}/favicon.ico`} />
      </head>
      <body>
        {children}
      </body>
    </html>
  )
}
