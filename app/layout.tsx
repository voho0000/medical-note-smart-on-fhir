// app/layout.tsx
import "./globals.css"
import { ApiKeyProvider } from "../components/ApiKeyProvider"

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ApiKeyProvider storage="session">{children}</ApiKeyProvider>
      </body>
    </html>
  )
}
