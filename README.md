# Medical Note · SMART on FHIR (Next.js)

Minimal SMART on FHIR demo built with **Next.js App Router**, **shadcn/ui (Radix)**, and **fhirclient**.  
Fetch Patient data from a SMART sandbox, record audio (Whisper), and generate GPT summaries.

> Status: WIP — interfaces and APIs may change.

---

## Features
- SMART on FHIR OAuth (PKCE): `/smart/launch` → `/smart/callback`
- Fetch **Patient** via `fhirclient` (`useSmartPatient` hook)
- Audio recording + Whisper transcription
- GPT-based summary generation
- API key input stored in browser (session/local storage)

---

## Prerequisites
- Node **18.18+** or **20.x LTS**
- npm / pnpm / yarn (examples use npm)

---

## Install & Run

```bash
# install deps
npm i

# development (webpack — recommended for this repo)
npm run dev:webpack

# production build
npm run build

# start production server
npm start
```

---
```json
{
  "scripts": {
    "dev": "next dev --turbopack",
    "dev:webpack": "next dev",
    "build": "next build --turbopack",
    "start": "next start"
  }
}
```
Use `npm run dev:webpack` during development. Turbopack scripts are available if you want to try them.

---

## Use with SMART Sandbox

1. Start dev server: http://localhost:3000

2. In the SMART App Launcher (or your sandbox app registration), set:

   - Launch URL: http://localhost:3000/smart/launch
   - Redirect URL: http://localhost:3000/smart/callback
   - Client Type: Public (PKCE)
   - Client ID: my_web_app (or your registered ID)
   - Scopes: launch openid fhirUser patient/*.read online_access

3. Launch → complete auth → redirected back to the app → Patient info loads on the home page.

Don’t refresh /smart/callback directly; always start from /smart/launch.