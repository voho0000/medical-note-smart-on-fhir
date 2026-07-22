# 醫析 MediPrisma · SMART on FHIR

> 文件基準：v0.43.0（2026-07-22）｜程式行為以 registry、composition root 與測試為準。

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
  - **臨床 AI Agent 對話**：依問題自主決定是否以 tool calling 查詢 FHIR 資源（病人／診斷／用藥／過敏／檢驗報告／生命徵象／處置／就診）；cloud 模式亦可搜尋醫學文獻（Perplexity）。輸入 `/` 可快速套用提示模板，每次回答後提供可點選的追問建議。
  - **自訂摘要模組**：嵌入**醫療摘要**的提示詞工作台；每個模組可排序、隱藏、手動執行或設定自動生成，也可從提示範本庫加入。主動安全警示由固定摘要流程獨立生成，不屬於自訂模組。
  - **語音口述**：Whisper 轉錄。
- **AI 資料範圍**：從醫療摘要的側邊 panel 調整要納入摘要與自訂摘要的 FHIR 資料（門診／檢驗／用藥…），並預覽 AI 主要收到的內容；臨床對話改由 Agent 按需查詢。
- **醫療計算機**：MDCalc 風格的臨床評分／公式（eGFR、CHA₂DS₂-VASc、Child-Pugh、CURB-65… 共 10 類、57 個），**檢驗數值自動從病人報告帶入**（依 canonical／LOINC／檢體判定），附適用時機與注意事項，結果可一鍵複製。
- **匯出（IPS）**：組出 International Patient Summary FHIR 文件，附可直接複製的 Markdown 預覽與 AI 問題清單推論（逐項確認後才納入）。
- **提示範本庫**：Cloud 模式提供社群共享的提示範本；on-prem 保留本機 templates，但不連共享 gallery。
- **雙受眾**：首次使用可選擇醫療人員或民眾身份；藥名、檢驗名稱、臨床代碼與 AI 輸出會配合調整，並可隨時切換。
- **多語言（中／英）、深色模式、響應式**。

## 資料來源（三種）

1. **SMART on FHIR**：由 EHR 啟動（OAuth 2.0 + PKCE），即時讀取 FHIR 伺服器資料。
2. **本地匯入**：匯入健保存摺等來源的 FHIR Bundle（`.json`）。完整匯入檔只儲存在本機；使用 AI 功能時，選取的相關內容才會依 deployment profile 與使用者設定傳送至所選 AI endpoint。
3. **試用資料（示範病人）**：一鍵載入內建、**去識別化**的示範病人（改編自真實健保存摺，含出院病摘與真實影像），無需匯入任何檔案即可體驗；完整資料同樣儲存在本機。

## 部署模式

同一份 codebase 支援兩種**建置時** profile；port 只用來讓本機同時執行兩個 process，不是安全邊界。

| 模式 | 用途 | 開發／建置 | Firebase 與雲端服務 |
|---|---|---|---|
| `cloud`（預設） | `mediprisma.tw/app`、GitHub Pages、一般開發 | `npm run dev:cloud`／`build:cloud`／`build:mediprisma`／`build:gh` | 保留 Auth、Firestore、Functions、Prompt Gallery、回饋與雲端／自備模型 |
| `onprem` | 院內 HTTPS、無外網或受限網路 | `npm run dev:onprem`／`build:onprem`／`package:onprem` | 建置前置換 Firebase boundary，只保留院內 OpenAI-compatible endpoint，禁止 fallback 到公共 AI |

`build:mediprisma` 與 `build:gh` 會明確鎖定 `cloud`；合併 on-prem 支援不會把 `mediprisma.tw/app` 改成地端模式。`build:onprem` 會產生 root-path static export，並在完成後掃描產物中的 Firebase、公共 AI 與公共 SMART sandbox endpoint。完整步驟見 [院內 HTTPS／純內網部署指南](./docs/INTRANET_HTTPS.md)。

## 隱私與安全

- **本地匯入的完整 FHIR Bundle 儲存在本機**：以 AES-GCM 加密寫入 IndexedDB，最長保留 **12 小時**，下次載入時清除過期紀錄、登出時清除，使用者亦可隨時「清除本地資料」。Cloud 模式使用 AI 時，產生內容所需的選取資料會傳送至所選服務；內建模型可能經由 MediPrisma Firebase Functions 代理。On-prem 模式只允許送往同源、loopback 或部署者明列的院內 AI origin。
- **API 金鑰**：Cloud provider keys 預設只在本次瀏覽工作階段有效（關閉視窗即清除）；可在設定開啟「在此裝置記住金鑰」改為持久保存。Cloud 模式的自訂 OpenAI-compatible 端點可明確選擇瀏覽器直連，或對不支援 CORS 的白名單 provider 使用 Firebase Gateway；後者會讓提示、回應與自備 key 暫時經過 Firebase，畫面會先行提示。On-prem 只允許院內 direct endpoint。
- **自訂模型深入對話**：每個端點預設採自動偵測且 fail closed；能力測試會送出正式 FHIR tool schemas，但只用合成文字與瀏覽器內隨機值，不讀取病歷或呼叫 FHIR server。只有完整串流 tool-call 往返成功才會使用 Agent；端點、模型、transport 或 key 改變時會重新驗證。使用者也可固定採標準對話。自訂 Agent 只取得瀏覽器綁定的 FHIR tools，不取得外部文獻搜尋工具。
- **對話紀錄**：Cloud 模式登入後，一般對話會儲存於 Firestore 並跨裝置同步；「無痕對話」不會儲存，訪客對話不會同步。On-prem 模式不初始化 Firestore，對話不跨裝置同步。
- **回饋**：Cloud 模式表單不自動附加 patientId，並提醒不要在自由文字輸入病人識別資訊；FHIR server URL 仍可能透露機構。On-prem 模式不載入雲端回饋服務。
- 詳見 [SECURITY.md](./docs/SECURITY.md)、[PRIVACY_POLICY.md](./PRIVACY_POLICY.md)。

## 線上展示

- **App**：<https://voho0000.github.io/medical-note-smart-on-fhir/>
- **SMART Launch URL**：`https://voho0000.github.io/medical-note-smart-on-fhir/smart/launch`
- 可用 [SMART Health IT Launcher](https://launch.smarthealthit.org/) 輸入 Launch URL 啟動。

## AI 模型

Cloud 模式不需自備金鑰時，請求會經由 Firebase Functions 代理（有每日免費額度，登入可提高、訪客較低）。也可在**設定**填自己的金鑰直接呼叫；自訂 OpenAI-compatible provider 若封鎖瀏覽器 CORS，可明確改選受限的 Firebase Gateway。**模型在各 AI 功能內就地選擇**（對話工具列、自訂模組管理 drawer、醫療摘要標頭，各自記憶）；付費模型未提供金鑰時自動以免費模型執行並如實顯示。

On-prem 模式只顯示院內／地端 OpenAI-compatible profiles，不接受公共 provider key，也不會改走免費 cloud model。每個 profile 的 Agent mode 必須通過不讀取病歷的 tool-call capability probe；未驗證時使用標準對話。

| 類別 | 模型 |
|------|------|
| 免費內建（免金鑰，經代理） | **Gemini 3 Flash Preview（預設）**、Gemini 3.1 Flash-Lite、GPT-5.4 Nano、Claude Haiku 4.5 |
| 進階（需自備金鑰） | GPT-5.6 Luna／GPT-5.6 Terra／GPT-5.6 Sol；Gemini 3.5 Flash／Gemini 3.1 Pro Preview；Claude Sonnet 4.6／Claude Opus 4.8 |

醫學文獻搜尋使用 Perplexity（cloud 模式的 AI Agent 對話）；on-prem 不掛載外部文獻搜尋工具。

## 技術堆疊

- **框架**：Next.js 16（App Router、Turbopack）、靜態匯出
- **UI**：shadcn/ui、Tailwind CSS 4
- **FHIR**：fhirclient 2.6.3
- **AI**：Vercel AI SDK（OpenAI、Gemini、Claude、Perplexity）
- **後端**：Cloud profile 使用 Firebase（Auth、Firestore、Functions）；on-prem profile 為 Firebase-free static artifact。Functions 與 Firestore Rules 在另一個 repo：[firebase-smart-on-fhir](https://github.com/voho0000/firebase-smart-on-fhir)
- **狀態**：Zustand + React Context
- **測試**：Jest 30 + React Testing Library
- **架構**：Clean Architecture + 功能模組（feature-based）

## 快速開始

需要 Node.js 20+（CI 使用 24）。

```bash
npm install

# Cloud 開發（npm run dev 是同一個預設模式）
npm run dev:cloud     # http://localhost:3001

# On-prem 開發，可與 cloud 同時執行
npm run dev:onprem    # http://localhost:3100

# Production builds
npm run build:cloud
npm run build:onprem
npm run package:onprem  # 產生 tar.gz + SHA-256

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
- EHR launch scopes：`launch openid fhirUser patient/*.rs online_access`
- Standalone launch scopes：`launch/patient openid fhirUser patient/*.rs online_access`
- Public client authorization requires S256 PKCE.

> 本專案只用 **public client + PKCE**，不支援 client secret（靜態前端無法藏密碼）。`NEXT_PUBLIC_SMART_CLIENT_ID` 為公開識別碼、選用（預設 `my_web_app`）。

## 部署

**`mediprisma.tw/app` 與 GitHub Pages（cloud）**：`npm run build:mediprisma` 與 `npm run build:gh` 都會強制 `NEXT_PUBLIC_DEPLOYMENT_PROFILE=cloud`。GitHub Pages 在 push 到 `master` 且 CI 通過後自動部署；手動可執行 `npm run deploy`。

**院內 HTTPS／純內網（on-prem）**：複製 `.env.intranet.example` 為 `.env.intranet`，執行 `npm run build:onprem` 產生 root-path `out/`，再由院內 Caddy／Nginx 提供靜態 App，並將同源 `/ai/v1` 反向代理到院內 OpenAI-compatible model server。`build:intranet` 保留為相容別名。此 build 會停用 Firebase 與所有 owner-funded cloud proxy，並執行 forbidden-domain audit。完整設定、TLS、CORS、防火牆與離線交付說明見 [院內 HTTPS 部署指南](./docs/INTRANET_HTTPS.md)。

> 注意：`next.config.ts` 的 `headers()`（CSP `frame-ancestors` 等）只在 Node 託管（`next start` / Vercel）生效；GitHub Pages 為靜態 CDN，這些 response header 不會送出。

環境變數以 [`.env.example`](./.env.example) 為準。`NEXT_PUBLIC_` 變數會在建置時進入瀏覽器 bundle，不可放入密鑰；`RESEND_API_KEY` 等伺服器端變數只適用於 `next dev`／Node 託管，不會被 GitHub Pages 靜態站使用。

```
# 部署 profile（一般環境使用 cloud；on-prem build script 會強制 onprem）
NEXT_PUBLIC_DEPLOYMENT_PROFILE=cloud
NEXT_PUBLIC_OFFLINE_MODE=0
NEXT_PUBLIC_ONPREM_AI_ALLOWED_ORIGINS=...

# AI / 語音 / 回饋 代理（選用）
NEXT_PUBLIC_CHAT_URL=...
NEXT_PUBLIC_GEMINI_URL=...
NEXT_PUBLIC_CLAUDE_URL=...
NEXT_PUBLIC_OPENAI_COMPATIBLE_GATEWAY_URL=...
NEXT_PUBLIC_PERPLEXITY_PROXY_URL=...
NEXT_PUBLIC_WHISPER_URL=...
NEXT_PUBLIC_FEEDBACK_URL=...
NEXT_PUBLIC_PROXY_KEY=...
NEXT_PUBLIC_STREAM_IDLE_TIMEOUT_MS=60000

# Firebase（選用：登入、對話歷史、提示範本庫、免費額度）
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=...
NEXT_PUBLIC_APPCHECK_RECAPTCHA_SITE_KEY=...
NEXT_PUBLIC_APPCHECK_DEBUG=...
NEXT_PUBLIC_FIREBASE_EMULATOR=...

# SMART（選用；client id 是公開識別碼，預設 my_web_app）
NEXT_PUBLIC_SMART_CLIENT_ID=...
NEXT_PUBLIC_SMART_ALLOWED_ISS=...

# 靜態部署
GITHUB_PAGES=...
NEXT_PUBLIC_BASE_PATH=/medical-note-smart-on-fhir
DEPLOY_BASE_PATH=...

# Node 託管的內建 feedback route（伺服器端，靜態站不使用）
RESEND_API_KEY=...
FEEDBACK_TO_EMAIL=...
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
- **右側面板** `src/shared/config/right-panel-registry.ts` — 5 個主功能：醫療摘要／臨床對話／匯出（IPS）／醫療計算機／設定；資料範圍與自訂摘要管理以可插拔 drawer 嵌入醫療摘要。
- **AI 模型** `src/shared/constants/ai-models.constants.ts` — 唯一 model manifest；ID、provider、API surface、金鑰／proxy、內容視窗、Agent 模式與背景任務角色皆由同一筆定義驅動。具體 provider wiring 只放在 `src/application/composition.ai.ts`。若開放免費 proxy 模型，仍須另外審核 Firebase 後端 allowlist（安全邊界）。

## 文件

- [docs/README.md](./docs/README.md) — 文件入口、維護規則與歷史文件索引
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) — 系統架構
- [docs/AI_AGENT_IMPLEMENTATION.md](./docs/AI_AGENT_IMPLEMENTATION.md) — AI Agent 實作
- [docs/MEDICAL_CHAT.md](./docs/MEDICAL_CHAT.md) — 對話功能
- [docs/PROMPT_GALLERY.md](./docs/PROMPT_GALLERY.md) — 提示範本庫
- [docs/FEEDBACK_SETUP.md](./docs/FEEDBACK_SETUP.md) — 回饋系統
- [docs/FEATURES.md](./docs/FEATURES.md) — 功能模組
- [docs/SECURITY.md](./docs/SECURITY.md) ／ [PRIVACY_POLICY.md](./PRIVACY_POLICY.md) — 安全與隱私
- [docs/INTRANET_HTTPS.md](./docs/INTRANET_HTTPS.md) — Cloud／on-prem profile、院內 HTTPS、離線套件與防火牆
- [firebase-smart-on-fhir](https://github.com/voho0000/firebase-smart-on-fhir) — 後端 Functions / Rules / 部署

## 作者與聯絡

**臺北榮總醫療人工智慧發展中心 郭宜欣醫師**。任何回饋歡迎來信 <voho0000@gmail.com>。

## 授權與支援

本專案以 **Apache License 2.0** 授權（見 [LICENSE](LICENSE)）。問題請開 GitHub Issue，或用 app 內的「回報問題」。

---

# English

[🔝 Back to top](#醫析-mediprisma--smart-on-fhir) ｜ [切換中文](#中文)

A clinical-data integration and reading tool built on **Next.js 16** and **SMART on FHIR**: it brings cross-facility visits, medications, test trends, and clinical documents together, with source-linked AI summaries, safety reminders, and report explanations to help users find the key points.

Documentation baseline: v0.43.0 (2026-07-22). Runtime registries, composition roots, and tests are authoritative.

> ⚠️ For research/education only — not a medical device. Output is for reference; clinical decisions remain the clinician's.

## What it does

- **Clinical summary**: patient info, visits, reports (including a **cumulative lab report** — values tabulated across dates), medications, documents — assembled from FHIR.
- **Report AI translate & explain**: imaging/pathology reports and discharge summaries can generate a one-click faithful translation plus a plain-language interpretation (key points, what to watch for), shown **above** the original text (the original stays below for comparison); available to both clinicians and patients, generated on demand so it never spends quota unasked.
- **Medical Summary** (the default tab after loading a patient): a **zero-click AI briefing** — cross-hospital course narrative, disease-oriented test trends, proactive safety alerts, pending decisions, problem list and timeline, followed by optional **custom summary modules**. The patient view also includes a fixed benefit-first **My medicines and care** card; every item must resolve to a Medication FHIR record. Custom modules use user-managed prompts, load independently from the fixed summary, and can be added from the Prompt Gallery directly inside the summary.
- **AI**:
  - **Clinical AI Agent chat**: autonomously decides whether to use client-side tool calling over FHIR resources (patient / conditions / medications / allergies / diagnostic reports / observations / procedures / encounters); cloud mode can also use medical-literature search (Perplexity). Type `/` for prompt templates and use tappable follow-up suggestions after each answer.
  - **Custom summary modules**: reusable prompt templates embedded in **Medical Summary**; users can add, order, preview, manually run, or auto-generate selected modules without switching tabs.
  - **Voice dictation**: Whisper transcription.
- **AI data scope**: a reusable drawer inside Medical Summary for selecting and previewing the main FHIR context supplied to standard and custom summaries; agent chat queries FHIR on demand.
- **Medical Calculator**: 57 MDCalc-style clinical scores/formulas across 10 categories (eGFR, CHA₂DS₂-VASc, Child-Pugh, CURB-65…) that **auto-fill lab values from the patient's reports** (resolved by canonical/LOINC/specimen), with when-to-use/caveats and one-click copy.
- **Export (IPS)**: builds an International Patient Summary FHIR document, with a copy-ready Markdown preview and AI problem-list inference (each suggestion confirmed before inclusion).
- **Prompt Gallery**: cloud mode provides community-shared prompt templates; on-prem keeps local templates without connecting to the shared gallery.
- **Two audiences**: choose healthcare-professional or patient/citizen; medication names, test labels, clinical codes, and AI output adapt, and the audience can be switched at any time.
- **Bilingual (EN/中文), dark mode, responsive.**

## Data sources

1. **SMART on FHIR** — launched from an EHR (OAuth 2.0 + PKCE), reading the FHIR server live.
2. **Local import** — import a FHIR Bundle (`.json`, e.g. from Taiwan's NHI health record). The full imported file stays on the device; when an AI feature is used, only selected relevant content is sent to the chosen AI endpoint according to the deployment profile and user settings.
3. **Demo data (sample patient)** — one-click load of a built-in, **de-identified** sample patient (adapted from a real NHI record, with a discharge summary and real images); no file needed, and the full dataset also stays on the device.

## Deployment profiles

One codebase supports two **build-time** profiles. Ports only let two local processes run side by side; they are not the security boundary.

| Profile | Intended use | Develop / build | Firebase and cloud services |
|---|---|---|---|
| `cloud` (default) | `mediprisma.tw/app`, GitHub Pages, normal development | `npm run dev:cloud` / `build:cloud` / `build:mediprisma` / `build:gh` | Keeps Auth, Firestore, Functions, Prompt Gallery, feedback, and cloud/BYO models |
| `onprem` | Hospital HTTPS, air-gapped or restricted networks | `npm run dev:onprem` / `build:onprem` / `package:onprem` | Replaces Firebase boundaries before bundling, exposes only hospital OpenAI-compatible endpoints, and never falls back to public AI |

`build:mediprisma` and `build:gh` explicitly pin `cloud`, so adding on-prem support does not change the profile deployed to `mediprisma.tw/app`. `build:onprem` creates a root-path static export and audits the artifact for Firebase, public-AI, and public SMART sandbox endpoints. See the [hospital HTTPS / air-gapped guide](./docs/INTRANET_HTTPS.md).

## Privacy & security

- **A locally imported full FHIR Bundle stays on the device**: it is AES-GCM-encrypted in IndexedDB, kept at most **12 hours**, purged on next load when expired and on logout; users can "clear local data" anytime. In cloud mode, selected data needed for AI is sent to the chosen service and built-in models may route through MediPrisma Firebase Functions. On-prem mode permits only same-origin, loopback, or explicitly allow-listed hospital AI origins.
- **API keys**: cloud-provider keys are kept only for the current browser session by default (cleared when you close the window); a "remember on this device" toggle in Settings makes them persist. In cloud mode, a custom OpenAI-compatible endpoint explicitly uses either direct browser transport or the allow-listed Firebase Gateway for providers that block browser CORS. Gateway mode temporarily sends prompts, responses, and the user-owned key through Firebase and is disclosed in the UI. On-prem permits only hospital direct endpoints.
- **Deep Conversation for custom models**: each endpoint defaults to fail-closed automatic detection. The probe sends the production FHIR tool schemas but uses only synthetic text and a browser-generated random value; it never reads the chart or calls the FHIR server. Agent execution is enabled only after the streamed tool-call round trip succeeds; users can instead lock a profile to standard chat. Endpoint, model, transport, or key changes invalidate that trust. Custom Agents receive browser-bound FHIR tools but never the external literature-search tool.
- **Conversation history**: in cloud mode, signed-in regular conversations are stored in Firestore and synced across devices; temporary conversations are not saved, and guest conversations are not synced. On-prem mode does not initialize Firestore and provides no cross-device chat sync.
- **Feedback** in cloud mode does not automatically attach a patient ID and warns users not to enter identifiers in free text; the FHIR server URL may still reveal the institution. On-prem mode does not load the cloud feedback service.
- See [SECURITY.md](./docs/SECURITY.md) and [PRIVACY_POLICY.md](./PRIVACY_POLICY.md).

## Live demo

- **App**: <https://voho0000.github.io/medical-note-smart-on-fhir/>
- **SMART Launch URL**: `https://voho0000.github.io/medical-note-smart-on-fhir/smart/launch`
- Launch via the [SMART Health IT Launcher](https://launch.smarthealthit.org/).

## AI models

In cloud mode, requests without your own key go through a Firebase Functions proxy (daily free quota — higher signed in, lower for guests). Or add your own key in **Settings** to call providers directly. Custom OpenAI-compatible providers that block browser CORS can explicitly use the restricted Firebase Gateway. **Models are picked inside each AI feature** (chat toolbar, custom-module manager, medical-summary header — each remembered separately); a premium pick without its key transparently runs — and displays — as the free model.

On-prem mode shows only hospital/local OpenAI-compatible profiles. It rejects public-provider keys and never falls back to a free cloud model. Agent mode is enabled only after a synthetic, chart-free tool-call capability probe succeeds; otherwise the profile uses standard chat.

| Tier | Models |
|------|--------|
| Free, built-in (no key, via proxy) | **Gemini 3 Flash Preview (default)**, Gemini 3.1 Flash-Lite, GPT-5.4 Nano, Claude Haiku 4.5 |
| Advanced (your own key) | GPT-5.6 Luna / GPT-5.6 Terra / GPT-5.6 Sol; Gemini 3.5 Flash / Gemini 3.1 Pro Preview; Claude Sonnet 4.6 / Claude Opus 4.8 |

Literature search uses Perplexity in cloud AI Agent chat; on-prem never mounts the external literature-search tool.

## Tech stack

- **Framework**: Next.js 16 (App Router, Turbopack), static export
- **UI**: shadcn/ui, Tailwind CSS 4
- **FHIR**: fhirclient 2.6.3
- **AI**: Vercel AI SDK (OpenAI, Gemini, Claude, Perplexity)
- **Backend**: the cloud profile uses Firebase (Auth, Firestore, Functions); the on-prem profile is a Firebase-free static artifact. Functions & Firestore Rules live in a separate repo: [firebase-smart-on-fhir](https://github.com/voho0000/firebase-smart-on-fhir)
- **State**: Zustand + React Context
- **Testing**: Jest 30 + React Testing Library
- **Architecture**: Clean Architecture + feature-based modules

## Quick start

Requires Node.js 20+ (CI uses 24).

```bash
npm install

# Cloud development (`npm run dev` is the same default profile)
npm run dev:cloud     # http://localhost:3001

# On-prem development; may run alongside cloud
npm run dev:onprem    # http://localhost:3100

# Production builds
npm run build:cloud
npm run build:onprem
npm run package:onprem  # tar.gz + SHA-256

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
- EHR launch scopes: `launch openid fhirUser patient/*.rs online_access`
- Standalone launch scopes: `launch/patient openid fhirUser patient/*.rs online_access`
- Public client authorization requires S256 PKCE.

> This app uses **public client + PKCE** only — no client secret (a static front end can't keep one). `NEXT_PUBLIC_SMART_CLIENT_ID` is a public identifier, optional (defaults to `my_web_app`).

## Deployment

**`mediprisma.tw/app` and GitHub Pages (cloud)**: `npm run build:mediprisma` and `npm run build:gh` explicitly force `NEXT_PUBLIC_DEPLOYMENT_PROFILE=cloud`. GitHub Pages auto-deploys after a push to `master` passes CI. Manual: `npm run deploy`.

**Hospital HTTPS / air-gapped (on-prem)**: copy `.env.intranet.example` to `.env.intranet`, then run `npm run build:onprem` for a root-path `out/` artifact. Serve it through an internal Caddy/Nginx host and reverse-proxy same-origin `/ai/v1` to the hospital OpenAI-compatible model server. `build:intranet` remains a compatibility alias. This build disables Firebase and every owner-funded cloud proxy and runs a forbidden-domain audit. See the [intranet HTTPS deployment guide](./docs/INTRANET_HTTPS.md).

> Note: `next.config.ts`'s `headers()` (CSP `frame-ancestors`, etc.) only takes effect on a Node host (`next start` / Vercel); GitHub Pages is a static CDN and won't send those response headers.

See [`.env.example`](./.env.example) and the Chinese section above for the full list. Values prefixed with `NEXT_PUBLIC_` are injected into the browser bundle and must not contain secrets; server-only feedback variables apply only to `next dev` or a Node host.

## Architecture

```
Presentation      app/ · features/ · components/
Application       src/application/
Domain            src/core/
Infrastructure    src/infrastructure/
```

Pluggable via registries:

- **Left panel** `src/shared/config/feature-registry.ts` — 5 tabs: Patient / Visits / Reports / Medications / Documents.
- **Right panel** `src/shared/config/right-panel-registry.ts` — 5 primary features: Medical Summary / Clinical Chat / Export (IPS) / Medical Calculator / Settings. Data scope and custom-summary management are pluggable drawers owned by Medical Summary.
- **AI models** `src/shared/constants/ai-models.constants.ts` — the single model manifest for ids, providers, API surfaces, key/proxy policy, context windows, conversation mode, and internal task roles. Concrete provider wiring lives only in `src/application/composition.ai.ts`. Enabling an owner-funded proxy model still requires a separate review of the Firebase backend allowlist (the security boundary).

## Docs

- [Documentation index](./docs/README.md), [architecture](./docs/ARCHITECTURE.md), [AI agent](./docs/AI_AGENT_IMPLEMENTATION.md), [medical chat](./docs/MEDICAL_CHAT.md), [prompt gallery](./docs/PROMPT_GALLERY.md), [feedback](./docs/FEEDBACK_SETUP.md), [feature modules](./docs/FEATURES.md), [security](./docs/SECURITY.md), [privacy policy](./PRIVACY_POLICY.md), [hospital/on-prem deployment](./docs/INTRANET_HTTPS.md)
- Backend: [firebase-smart-on-fhir](https://github.com/voho0000/firebase-smart-on-fhir)

## Author & contact

**Dr. Yi-Hsin Kuo (郭宜欣), Medical Artificial Intelligence Development Center, Taipei Veterans General Hospital**. Feedback is welcome at <voho0000@gmail.com>.

## License & support

Licensed under the **Apache License 2.0** (see [LICENSE](LICENSE)). Report issues via GitHub Issues or the in-app "report a problem".
