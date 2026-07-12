# 醫析 MediPrisma · SMART on FHIR

> 語言 / Language: [**中文**](#中文) ｜ [**English**](#english)

基於 **Next.js 16** 與 **SMART on FHIR** 的臨床資料整合與閱讀工具：集中呈現跨院就診、用藥、檢驗趨勢與臨床文件，並以可回查來源的 AI 摘要、安全提醒與報告解讀協助快速掌握重點。

> ⚠️ 研究／教學用途，非醫療器材，輸出僅供參考，臨床決策請以醫師判斷為準。

---

# 中文

## 這個 app 做什麼

- **臨床摘要**：病人資訊、就診紀錄、報告（含**累積報告**：檢驗數值跨時間表格化）、用藥、文件，從 FHIR 自動整理。
- **報告 AI 翻譯解讀**：影像／病理／出院病摘等報告可一鍵生成忠實中譯＋白話解讀（重點、注意事項），呈現在原文**上方**（民眾預設只看得懂的部分，原文仍在下方供對照）；醫師與民眾皆可用，隨選生成、不預先耗用額度。
- **醫療摘要**（開啟病人後的預設分頁）：**零點擊 AI 簡報**——跨院病程摘要（關鍵片語標示＋可點擊的來源引用，逐筆對回 FHIR 資源，查無來源標「未驗證」）、主動用藥安全警示、需要決定的事、跨院時間軸與資料涵蓋卡；民眾版另有固定的「我的用藥與照護」Card，以藥物帶來的幫助為主、搭配平實注意事項，且每項必須對應原始 Medication FHIR 紀錄。醫療人員版／民眾版各自生成，結果快取 12 小時。
- **AI 協助**：
  - **臨床對話**（一般模式）：依選取的臨床資料提問、比較與整理資訊；輸入 `/` 即可快速套用提示模板；每次回答後提供可點選的追問建議。
  - **深入模式（AI Agent）**：以客戶端 tool calling 查詢 FHIR 資源（病人／診斷／用藥／過敏／檢驗報告／生命徵象／處置／就診）＋醫學文獻搜尋（Perplexity）。
  - **臨床洞察**：自訂提示詞的並行分析工作台——每個標籤一個提示詞，載入病人後可自動生成、結果可手動編輯（主動用藥安全警示已移至**醫療摘要**內嵌呈現；民眾受眾為白話的**健康提醒**版本）。
  - **語音口述**：Whisper 轉錄。
- **資料選擇**：挑選要餵給 AI 的資料範圍（門診／檢驗／用藥…），多種預設與每用途記憶。
- **醫療計算機**：MDCalc 風格的臨床評分／公式（eGFR、CHA₂DS₂-VASc、Child-Pugh、CURB-65… 共 10 類、50+ 個），**檢驗數值自動從病人報告帶入**（依 canonical／LOINC／檢體判定），附適用時機與注意事項，結果可一鍵複製。
- **匯出（IPS）**：組出 International Patient Summary FHIR 文件，附可直接複製的 Markdown 預覽與 AI 問題清單推論（逐項確認後才納入）。
- **提示範本庫**：社群共享的提示範本。
- **雙受眾**：首次使用可選擇醫療人員或民眾身份；藥名、檢驗名稱、臨床代碼與 AI 輸出會配合調整，並可隨時切換。
- **多語言（中／英）、深色模式、響應式**。

## 資料來源（三種）

1. **SMART on FHIR**：由 EHR 啟動（OAuth 2.0 + PKCE），即時讀取 FHIR 伺服器資料。
2. **本地匯入**：匯入健保存摺等來源的 FHIR Bundle（`.json`）。完整匯入檔只儲存在本機；使用 AI 功能時，選取的相關內容才會依使用者設定傳送至雲端服務。
3. **試用資料（示範病人）**：一鍵載入內建、**去識別化**的示範病人（改編自真實健保存摺，含出院病摘與真實影像），無需匯入任何檔案即可體驗；完整資料同樣儲存在本機。

## 隱私與安全

- **病人 FHIR 原始資料儲存在本機**：以 AES-GCM 加密寫入 IndexedDB，最長保留 **12 小時**，下次載入時清除過期紀錄、登出時清除，使用者亦可隨時「清除本地資料」。使用 AI 時，產生內容所需的選取資料會傳送至所選的雲端 AI 服務；內建模型可能經由 MediPrisma Firebase Functions 代理。
- **API 金鑰**：預設只在本次瀏覽工作階段有效（關閉視窗即清除）；可在設定開啟「在此裝置記住金鑰」改為持久保存。金鑰一律留在瀏覽器，不上雲端。
- **對話紀錄**：登入後，一般對話會儲存於 Firestore 並跨裝置同步；「無痕對話」不會儲存，訪客對話不會同步。
- **回饋**：刻意不收集病人識別資訊。
- 詳見 [SECURITY.md](./docs/SECURITY.md)、[PRIVACY_POLICY.md](./PRIVACY_POLICY.md)。

## 線上展示

- **App**：<https://voho0000.github.io/medical-note-smart-on-fhir/>
- **SMART Launch URL**：`https://voho0000.github.io/medical-note-smart-on-fhir/smart/launch`
- 可用 [SMART Health IT Launcher](https://launch.smarthealthit.org/) 輸入 Launch URL 啟動。

## AI 模型

不需自備金鑰時，請求會經由 Firebase Functions 代理（有每日免費額度，登入可提高、訪客較低）。也可在**設定**填自己的金鑰直接呼叫。**模型在各 AI 功能內就地選擇**（對話工具列、自訂模組管理 drawer、醫療摘要標頭，各自記憶）；付費模型未提供金鑰時自動以免費模型執行並如實顯示。

| 類別 | 模型 |
|------|------|
| 免費內建（免金鑰，經代理） | **Gemini 3 Flash Preview（預設）**、Gemini 3.1 Flash-Lite、GPT-5.4 Nano、Claude Haiku 4.5 |
| 進階（需自備金鑰） | GPT-5.4 Mini／GPT-5.4／GPT-5.5；Gemini 3.5 Flash／Gemini 3.1 Pro Preview；Claude Sonnet 4.6／Claude Opus 4.8 |

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
- **右側面板** `src/shared/config/right-panel-registry.ts` — 7 個功能：醫療摘要／筆記對話／資料選擇／臨床洞察／匯出（IPS）／醫療計算機／設定；低頻分頁預設收合於「更多」選單，使用者可在選單內自訂哪些常駐。

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

A clinical-data integration and reading tool built on **Next.js 16** and **SMART on FHIR**: it brings cross-facility visits, medications, test trends, and clinical documents together, with source-linked AI summaries, safety reminders, and report explanations to help users find the key points.

> ⚠️ For research/education only — not a medical device. Output is for reference; clinical decisions remain the clinician's.

## What it does

- **Clinical summary**: patient info, visits, reports (including a **cumulative lab report** — values tabulated across dates), medications, documents — assembled from FHIR.
- **Report AI translate & explain**: imaging/pathology reports and discharge summaries can generate a one-click faithful translation plus a plain-language interpretation (key points, what to watch for), shown **above** the original text (the original stays below for comparison); available to both clinicians and patients, generated on demand so it never spends quota unasked.
- **Medical Summary** (the default tab after loading a patient): a **zero-click AI briefing** — cross-hospital course narrative, disease-oriented test trends, proactive safety alerts, pending decisions, problem list and timeline, followed by optional **custom summary modules**. The patient view also includes a fixed benefit-first **My medicines and care** card; every item must resolve to a Medication FHIR record. Custom modules use user-managed prompts, load independently from the fixed summary, and can be added from the Prompt Gallery directly inside the summary.
- **AI**:
  - **Clinical Chat** (normal): ask questions, compare records, and organize information from selected clinical data; type `/` to quickly apply a prompt template; tappable follow-up suggestions after each answer.
  - **Deep Mode (AI Agent)**: client-side tool calling over FHIR resources (patient / conditions / medications / allergies / diagnostic reports / observations / procedures / encounters) + medical-literature search (Perplexity).
  - **Custom summary modules**: reusable prompt templates embedded in **Medical Summary**; users can add, order, preview, manually run, or auto-generate selected modules without switching tabs.
  - **Voice dictation**: Whisper transcription.
- **Data Selection**: choose which data to feed the AI, with presets and per-consumer memory.
- **Medical Calculator**: MDCalc-style clinical scores/formulas (eGFR, CHA₂DS₂-VASc, Child-Pugh, CURB-65… — 50+ across 10 categories) that **auto-fill lab values from the patient's reports** (resolved by canonical/LOINC/specimen), with when-to-use/caveats and one-click copy.
- **Export (IPS)**: builds an International Patient Summary FHIR document, with a copy-ready Markdown preview and AI problem-list inference (each suggestion confirmed before inclusion).
- **Prompt Gallery**: community-shared prompt templates.
- **Two audiences**: choose healthcare-professional or patient/citizen; medication names, test labels, clinical codes, and AI output adapt, and the audience can be switched at any time.
- **Bilingual (EN/中文), dark mode, responsive.**

## Data sources

1. **SMART on FHIR** — launched from an EHR (OAuth 2.0 + PKCE), reading the FHIR server live.
2. **Local import** — import a FHIR Bundle (`.json`, e.g. from Taiwan's NHI health record). The full imported file stays on the device; when an AI feature is used, only the selected relevant content is sent to cloud services according to the user's settings.
3. **Demo data (sample patient)** — one-click load of a built-in, **de-identified** sample patient (adapted from a real NHI record, with a discharge summary and real images); no file needed, and the full dataset also stays on the device.

## Privacy & security

- **Source FHIR data is stored locally**: AES-GCM-encrypted in IndexedDB, kept at most **12 hours**, purged on next load when expired and on logout; users can "clear local data" anytime. When AI is used, the selected data needed to generate the content is sent to the chosen cloud AI service; built-in models may route through the MediPrisma Firebase Functions proxy.
- **API keys**: by default kept only for the current browser session (cleared when you close the window); a "remember on this device" toggle in Settings makes them persist. Keys never leave the browser.
- **Conversation history**: after sign-in, regular conversations are stored in Firestore and synced across devices; temporary conversations are not saved, and guest conversations are not synced.
- **Feedback** deliberately collects no patient identifiers.
- See [SECURITY.md](./docs/SECURITY.md) and [PRIVACY_POLICY.md](./PRIVACY_POLICY.md).

## Live demo

- **App**: <https://voho0000.github.io/medical-note-smart-on-fhir/>
- **SMART Launch URL**: `https://voho0000.github.io/medical-note-smart-on-fhir/smart/launch`
- Launch via the [SMART Health IT Launcher](https://launch.smarthealthit.org/).

## AI models

Without your own key, requests go through a Firebase Functions proxy (daily free quota — higher signed in, lower for guests). Or add your own key in **Settings** to call providers directly. **Models are picked inside each AI feature** (chat toolbar, custom-module manager, medical-summary header — each remembered separately); a premium pick without its key transparently runs — and displays — as the free model.

| Tier | Models |
|------|--------|
| Free, built-in (no key, via proxy) | **Gemini 3 Flash Preview (default)**, Gemini 3.1 Flash-Lite, GPT-5.4 Nano, Claude Haiku 4.5 |
| Advanced (your own key) | GPT-5.4 Mini / GPT-5.4 / GPT-5.5; Gemini 3.5 Flash / Gemini 3.1 Pro Preview; Claude Sonnet 4.6 / Claude Opus 4.8 |

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
- **Right panel** `src/shared/config/right-panel-registry.ts` — 6 features: Medical Summary / Note Chat / Data Selection / Export (IPS) / Medical Calculator / Settings; low-frequency tabs collapse into a "More" menu by default, and users can customize which tabs stay pinned.

## Docs

- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md), [docs/AI_AGENT_IMPLEMENTATION.md](./docs/AI_AGENT_IMPLEMENTATION.md), [docs/MEDICAL_CHAT.md](./docs/MEDICAL_CHAT.md), [docs/PROMPT_GALLERY.md](./docs/PROMPT_GALLERY.md), [docs/FEEDBACK_SETUP.md](./docs/FEEDBACK_SETUP.md), [docs/FEATURES.md](./docs/FEATURES.md), [docs/SECURITY.md](./docs/SECURITY.md), [PRIVACY_POLICY.md](./PRIVACY_POLICY.md)
- Backend: [firebase-smart-on-fhir](https://github.com/voho0000/firebase-smart-on-fhir)

## Author & contact

**Dr. Yi-Hsin Kuo (郭宜欣), Medical Artificial Intelligence Development Center, Taipei Veterans General Hospital**. Feedback is welcome at <voho0000@gmail.com>.

## License & support

Licensed under the **Apache License 2.0** (see [LICENSE](LICENSE)). Report issues via GitHub Issues or the in-app "report a problem".
