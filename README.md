# 醫析 MediPrisma · SMART on FHIR

> 語言 / Language: [**中文**](#中文) ｜ [**English**](#english)

基於 **Next.js 16** 與 **SMART on FHIR** 的臨床文件 AI 助理：把病人的 FHIR 資料整理成可讀的臨床摘要，並用 AI 協助查詢資料、檢索醫學文獻、起草病歷。

> ⚠️ 研究／教學用途，非醫療器材，輸出僅供參考，臨床決策請以醫師判斷為準。

---

# 中文

## 這個 app 做什麼

- **臨床摘要**：病人資訊、就診紀錄、報告（含**累積報告**：檢驗數值跨時間表格化）、用藥、文件，從 FHIR 自動整理。
- **AI 協助**：
  - **筆記對話**（一般模式）：互動式 AI 助理，可插入選定的臨床資料、起草病歷章節；輸入 `/` 即可快速套用提示模板。
  - **深入模式（AI Agent）**：以客戶端 tool calling 查詢 FHIR 資源（病人／診斷／用藥／過敏／檢驗報告／生命徵象／處置／就診）＋醫學文獻搜尋（Perplexity）。
  - **臨床洞察**：自動生成摘要，並內建**主動用藥安全警示**（純 AI、結構化卡片，固定置於最前且不可改寫提示）。
  - **語音口述**：Whisper 轉錄。
- **資料選擇**：挑選要餵給 AI 的資料範圍（門診／檢驗／用藥…），多種預設與每用途記憶。
- **IPS 匯出**：International Patient Summary。
- **提示範本庫**：社群共享的提示範本。
- **多語言（中／英）、深色模式、響應式**。

## 資料來源（三種）

1. **SMART on FHIR**：由 EHR 啟動（OAuth 2.0 + PKCE），即時讀取 FHIR 伺服器資料。
2. **本地匯入**：匯入健保存摺等來源的 FHIR Bundle（`.json`）。資料**只留在本機**，不上傳。
3. **試用資料（示範病人）**：一鍵載入內建、**去識別化**的示範病人（改編自真實健保存摺，含出院病摘與真實影像），無需匯入任何檔案即可體驗；資料同樣只留在本機。

## 隱私與安全

- **病人 FHIR 資料只存在本機**：以 AES-GCM 加密寫入 IndexedDB，最長保留 **12 小時**，下次載入時清除過期紀錄、登出時清除，使用者亦可隨時「清除本地資料」。
- **API 金鑰**：預設只在本次瀏覽工作階段有效（關閉視窗即清除）；可在設定開啟「在此裝置記住金鑰」改為持久保存。金鑰一律留在瀏覽器，不上雲端。
- **回饋**：刻意不收集病人識別資訊。
- 詳見 [SECURITY.md](./docs/SECURITY.md)、[PRIVACY_POLICY.md](./PRIVACY_POLICY.md)。

## 線上展示

- **App**：<https://voho0000.github.io/medical-note-smart-on-fhir/>
- **SMART Launch URL**：`https://voho0000.github.io/medical-note-smart-on-fhir/smart/launch`
- 可用 [SMART Health IT Launcher](https://launch.smarthealthit.org/) 輸入 Launch URL 啟動。

## AI 模型

不需自備金鑰時，請求會經由 Firebase Functions 代理（有每日免費額度，登入可提高、訪客較低）。也可在**設定**填自己的金鑰直接呼叫。

| 類別 | 模型 |
|------|------|
| 免費內建（免金鑰，經代理） | **Gemini 3.1 Flash-Lite（預設）**、GPT-5.4 Nano、Claude Haiku 4.5 |
| 進階（需自備金鑰） | GPT-5.4 Mini／GPT-5.4／GPT-5.5；Gemini 3 Flash Preview／Gemini 3.5 Flash／Gemini 3.1 Pro Preview；Claude Sonnet 4.6／Claude Opus 4.8 |

醫學文獻搜尋使用 Perplexity（深入模式）。

## 技術堆疊

- **框架**：Next.js 16（App Router、Turbopack）、靜態匯出
- **UI**：shadcn/ui、Tailwind CSS 4
- **FHIR**：fhirclient 2.6.3
- **AI**：Vercel AI SDK（OpenAI、Gemini、Claude、Perplexity）
- **後端**：Firebase（Auth、Firestore、Functions）— Functions 與 Firestore Rules 在另一個 repo：[firebase-smart-on-fhir](https://github.com/voho0000/firebase-smart-on-fhir)
- **狀態**：Zustand + React Context
- **測試**：Jest 30 + React Testing Library
- **架構**：Clean Architecture + 功能模組（feature-based）

## 快速開始

需要 Node.js 20+（CI 使用 24）。

```bash
npm install

# 開發
npm run dev:webpack   # webpack，http://localhost:3000（推薦）
npm run dev           # Turbopack，http://localhost:3001（較快、實驗性）

# 建置 / 啟動
npm run build
npm start

# 測試
npm test
npm run test:watch
npm run test:coverage
```

## SMART on FHIR 設定

在 FHIR 沙盒／伺服器註冊應用程式（**public client + PKCE**）：

- Launch URL：`<origin>/smart/launch`
- Redirect URL：`<origin>/smart/callback`
- Client Type：Public（PKCE）
- Scopes：`launch openid fhirUser patient/*.read online_access`

> 本專案只用 **public client + PKCE**，不支援 client secret（靜態前端無法藏密碼）。`NEXT_PUBLIC_SMART_CLIENT_ID` 為公開識別碼、選用（預設 `my_web_app`）。

## 部署

**GitHub Pages（靜態，目前正式環境）**：push 到 `master` → CI 通過後自動部署。手動：`npm run deploy`。

> 注意：`next.config.ts` 的 `headers()`（CSP `frame-ancestors` 等）只在 Node 託管（`next start` / Vercel）生效；GitHub Pages 為靜態 CDN，這些 response header 不會送出。

環境變數（皆為 `NEXT_PUBLIC_`，建置時注入）：

```
# AI / 語音 / 回饋 代理（選用）
NEXT_PUBLIC_CHAT_URL=...
NEXT_PUBLIC_GEMINI_URL=...
NEXT_PUBLIC_CLAUDE_URL=...
NEXT_PUBLIC_PERPLEXITY_PROXY_URL=...
NEXT_PUBLIC_WHISPER_URL=...
NEXT_PUBLIC_FEEDBACK_URL=...
NEXT_PUBLIC_PROXY_KEY=...

# Firebase（選用：登入、對話歷史、提示範本庫、免費額度）
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=...

# SMART（選用；公開 client id，預設 my_web_app）
NEXT_PUBLIC_SMART_CLIENT_ID=...
```

## 架構

Clean Architecture 分層：

```
展示層 (Presentation)      app/ · features/ · components/
應用層 (Application)        src/application/
領域層 (Domain)            src/core/
基礎設施層 (Infrastructure) src/infrastructure/
```

功能以 registry 可插拔：

- **左側面板** `src/shared/config/feature-registry.ts` — 5 個分頁：病人資訊／就診紀錄／報告／用藥／文件。
- **右側面板** `src/shared/config/right-panel-registry.ts` — 5 個功能：筆記對話／資料選擇／臨床洞察／IPS／設定。

## 文件

- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) — 系統架構
- [docs/AI_AGENT_IMPLEMENTATION.md](./docs/AI_AGENT_IMPLEMENTATION.md) — AI Agent 實作
- [docs/MEDICAL_CHAT.md](./docs/MEDICAL_CHAT.md) — 對話功能
- [docs/PROMPT_GALLERY.md](./docs/PROMPT_GALLERY.md) — 提示範本庫
- [docs/FEEDBACK_SETUP.md](./docs/FEEDBACK_SETUP.md) — 回饋系統
- [docs/FEATURES.md](./docs/FEATURES.md) — 功能模組
- [docs/SECURITY.md](./docs/SECURITY.md) ／ [PRIVACY_POLICY.md](./PRIVACY_POLICY.md) — 安全與隱私
- [firebase-smart-on-fhir](https://github.com/voho0000/firebase-smart-on-fhir) — 後端 Functions / Rules / 部署

## 作者與聯絡

**臺北榮總醫療人工智慧發展中心 郭宜欣醫師**。任何回饋歡迎來信 <voho0000@gmail.com>。

## 授權與支援

本專案以 **Apache License 2.0** 授權（見 [LICENSE](LICENSE)）。問題請開 GitHub Issue，或用 app 內的「回報問題」。

---

# English

[🔝 Back to top](#醫析-mediprisma--smart-on-fhir) ｜ [切換中文](#中文)

A clinical-documentation AI assistant built on **Next.js 16** and **SMART on FHIR**: it turns a patient's FHIR data into a readable clinical summary and uses AI to query data, search medical literature, and draft notes.

> ⚠️ For research/education only — not a medical device. Output is for reference; clinical decisions remain the clinician's.

## What it does

- **Clinical summary**: patient info, visits, reports (including a **cumulative lab report** — values tabulated across dates), medications, documents — assembled from FHIR.
- **AI**:
  - **Note Chat** (normal): interactive assistant; insert selected clinical data, draft note sections; type `/` to quickly apply a prompt template.
  - **Deep Mode (AI Agent)**: client-side tool calling over FHIR resources (patient / conditions / medications / allergies / diagnostic reports / observations / procedures / encounters) + medical-literature search (Perplexity).
  - **Clinical Insights**: auto-generated summaries, with a built-in **proactive medication-safety scanner** (pure-AI, structured cards, pinned first and prompt-locked).
  - **Voice dictation**: Whisper transcription.
- **Data Selection**: choose which data to feed the AI, with presets and per-consumer memory.
- **IPS export**: International Patient Summary.
- **Prompt Gallery**: community-shared prompt templates.
- **Bilingual (EN/中文), dark mode, responsive.**

## Data sources

1. **SMART on FHIR** — launched from an EHR (OAuth 2.0 + PKCE), reading the FHIR server live.
2. **Local import** — import a FHIR Bundle (`.json`, e.g. from Taiwan's NHI health record). Data **stays on the device**, never uploaded.
3. **Demo data (sample patient)** — one-click load of a built-in, **de-identified** sample patient (adapted from a real NHI record, with a discharge summary and real images); no file needed, and it also stays on the device.

## Privacy & security

- **Patient FHIR data stays local**: AES-GCM-encrypted in IndexedDB, kept at most **12 hours**, purged on next load when expired and on logout; users can "clear local data" anytime.
- **API keys**: by default kept only for the current browser session (cleared when you close the window); a "remember on this device" toggle in Settings makes them persist. Keys never leave the browser.
- **Feedback** deliberately collects no patient identifiers.
- See [SECURITY.md](./docs/SECURITY.md) and [PRIVACY_POLICY.md](./PRIVACY_POLICY.md).

## Live demo

- **App**: <https://voho0000.github.io/medical-note-smart-on-fhir/>
- **SMART Launch URL**: `https://voho0000.github.io/medical-note-smart-on-fhir/smart/launch`
- Launch via the [SMART Health IT Launcher](https://launch.smarthealthit.org/).

## AI models

Without your own key, requests go through a Firebase Functions proxy (daily free quota — higher signed in, lower for guests). Or add your own key in **Settings** to call providers directly.

| Tier | Models |
|------|--------|
| Free, built-in (no key, via proxy) | **Gemini 3.1 Flash-Lite (default)**, GPT-5.4 Nano, Claude Haiku 4.5 |
| Advanced (your own key) | GPT-5.4 Mini / GPT-5.4 / GPT-5.5; Gemini 3 Flash Preview / Gemini 3.5 Flash / Gemini 3.1 Pro Preview; Claude Sonnet 4.6 / Claude Opus 4.8 |

Literature search uses Perplexity (Deep Mode).

## Tech stack

- **Framework**: Next.js 16 (App Router, Turbopack), static export
- **UI**: shadcn/ui, Tailwind CSS 4
- **FHIR**: fhirclient 2.6.3
- **AI**: Vercel AI SDK (OpenAI, Gemini, Claude, Perplexity)
- **Backend**: Firebase (Auth, Firestore, Functions) — Functions & Firestore Rules live in a separate repo: [firebase-smart-on-fhir](https://github.com/voho0000/firebase-smart-on-fhir)
- **State**: Zustand + React Context
- **Testing**: Jest 30 + React Testing Library
- **Architecture**: Clean Architecture + feature-based modules

## Quick start

Requires Node.js 20+ (CI uses 24).

```bash
npm install

# Development
npm run dev:webpack   # webpack, http://localhost:3000 (recommended)
npm run dev           # Turbopack, http://localhost:3001 (faster, experimental)

# Build / start
npm run build
npm start

# Test
npm test
npm run test:watch
npm run test:coverage
```

## SMART on FHIR config

Register the app in your FHIR sandbox/server (**public client + PKCE**):

- Launch URL: `<origin>/smart/launch`
- Redirect URL: `<origin>/smart/callback`
- Client Type: Public (PKCE)
- Scopes: `launch openid fhirUser patient/*.read online_access`

> This app uses **public client + PKCE** only — no client secret (a static front end can't keep one). `NEXT_PUBLIC_SMART_CLIENT_ID` is a public identifier, optional (defaults to `my_web_app`).

## Deployment

**GitHub Pages (static, current production)**: push to `master` → auto-deploys after CI. Manual: `npm run deploy`.

> Note: `next.config.ts`'s `headers()` (CSP `frame-ancestors`, etc.) only takes effect on a Node host (`next start` / Vercel); GitHub Pages is a static CDN and won't send those response headers.

Env vars are all `NEXT_PUBLIC_` (injected at build) — see the Chinese section above for the full list (AI/voice/feedback proxies, Firebase, optional SMART).

## Architecture

```
Presentation      app/ · features/ · components/
Application       src/application/
Domain            src/core/
Infrastructure    src/infrastructure/
```

Pluggable via registries:

- **Left panel** `src/shared/config/feature-registry.ts` — 5 tabs: Patient / Visits / Reports / Medications / Documents.
- **Right panel** `src/shared/config/right-panel-registry.ts` — 5 features: Note Chat / Data Selection / Clinical Insights / IPS / Settings.

## Docs

- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md), [docs/AI_AGENT_IMPLEMENTATION.md](./docs/AI_AGENT_IMPLEMENTATION.md), [docs/MEDICAL_CHAT.md](./docs/MEDICAL_CHAT.md), [docs/PROMPT_GALLERY.md](./docs/PROMPT_GALLERY.md), [docs/FEEDBACK_SETUP.md](./docs/FEEDBACK_SETUP.md), [docs/FEATURES.md](./docs/FEATURES.md), [docs/SECURITY.md](./docs/SECURITY.md), [PRIVACY_POLICY.md](./PRIVACY_POLICY.md)
- Backend: [firebase-smart-on-fhir](https://github.com/voho0000/firebase-smart-on-fhir)

## Author & contact

**Dr. Yi-Hsin Kuo (郭宜欣), Medical Artificial Intelligence Development Center, Taipei Veterans General Hospital**. Feedback is welcome at <voho0000@gmail.com>.

## License & support

Licensed under the **Apache License 2.0** (see [LICENSE](LICENSE)). Report issues via GitHub Issues or the in-app "report a problem".
