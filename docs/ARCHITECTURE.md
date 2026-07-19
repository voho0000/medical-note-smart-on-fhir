# MediPrisma 系統架構

> 現行規格｜基準版本：v0.40.0｜最後核對：2026-07-14

MediPrisma 是以 Next.js App Router 實作的 client-first SMART on FHIR 應用。它可從 SMART OAuth 或本地 FHIR Bundle 取得同一種領域資料，再由臨床資料面板、結構化 AI 摘要、Agent 對話、醫療計算機與 IPS 匯出共同使用。

## 系統邊界

```text
EHR / FHIR server ── SMART OAuth 2.0 + S256 PKCE ─┐
                                                   ├─> ClinicalDataCollection
FHIR Bundle JSON ─ AES-GCM / IndexedDB ───────────┘
                                                          │
                         ┌────────────────────────────────┼───────────────────────┐
                         │                                │                       │
                  左側臨床資料                     右側臨床功能             AI tool layer
             patient/visits/reports/meds/docs   summary/chat/IPS/calc/settings   FHIR + literature
                         │                                │                       │
                         └──────────── source navigation / shared cache ──────────┘
```

正式靜態部署在 GitHub Pages；同一輸出可用 `/app` base path 同步到 mediprisma.tw。Firebase 提供 Auth、Firestore 與 owner-funded AI／語音／回饋代理；Functions 與 Firestore Rules 位於獨立的 `firebase-smart-on-fhir` repo。

## 分層與依賴方向

```text
src/core  <-  src/shared  <-  src/infrastructure  <-  src/application  <-  features  <-  app
```

| 層 | 目錄 | 責任 |
|---|---|---|
| Domain | `src/core/` | entities、interfaces、純 use cases、錯誤型別；不依賴 React 或具體 infrastructure |
| Shared | `src/shared/` | 共用型別、常數、工具、UI primitives 與 build-time registries |
| Infrastructure | `src/infrastructure/` | SMART/FHIR repositories、local bundle、AI providers、streaming、Firebase、cache |
| Application | `src/application/` | composition roots、providers、React Query hooks、Zustand stores、跨功能 orchestration |
| Feature | `features/` | 使用者可見功能與局部 UI／hooks；由 application/core 取得能力 |
| Presentation | `app/`、`components/` | Next routes、整體版面與 shadcn/ui 元件 |

`eslint.config.mjs` 以 `no-restricted-imports` 強制主要邊界，並逐檔列出目前仍允許的例外。新的 feature 不應直接依賴 infrastructure；需要具體實作時，在 application composition 或 hook 建立 facade。

## Composition roots

- `src/application/composition.ts`：依 SMART context 與 local bundle 狀態選擇 `FhirClinicalDataRepository` 或 `LocalBundleRepository`。有有效 SMART token 時，SMART 優先於先前匯入的 bundle。
- `src/application/composition.chat.ts`：建立聊天 session repository，避免一般臨床資料 import graph 連帶初始化 Firebase。
- `src/shared/config/feature-registry.ts`：左側 tabs 與 feature 元件。
- `src/shared/config/right-panel-registry.ts`：右側功能順序、顯示、pin、force-mount 與 scroll mode。

舊式 runtime registry mutator 已移除；registry 是 build-time 設定，修改陣列後重新建置。

## 資料來源

### SMART on FHIR

入口為 `/smart/launch`，callback 為 `/smart/callback`。`buildSmartAuthorizeConfig()` 建立 public-client 設定：

- EHR launch：`launch openid fhirUser patient/*.rs online_access`
- Standalone：`launch/patient openid fhirUser patient/*.rs online_access`
- PKCE：`required`，S256
- 無 client secret

FHIR 搜尋使用 `requestAllPages()` 跟隨 `Bundle.link[relation="next"]`，最多 50 頁；到達上限會丟出 `FhirPaginationLimitError`，不把不完整資料偽裝成成功結果。

### 本地 FHIR Bundle

`LocalBundleService` 接受標準 Bundle，並在 parse 階段：

- 重新建立缺漏 id、正規化 `urn:uuid`／absolute reference。
- 解析 Practitioner／Organization／Location 顯示值。
- 展開 TW-PAS `Claim` 與 Roche DIP／mCODE contained resources。
- 合併 `MedicationRequest` 與 `MedicationStatement` 的可讀形狀。
- 將 report、observation、procedure、condition 等關聯回 encounter。

完整 Bundle 與影像以 AES-GCM 寫入 IndexedDB；金鑰只存在 tab 的 `sessionStorage`。無法解密、超過 12 小時或使用者清除／登出時，資料會被清除。若 WebCrypto 或儲存不可用，流程不降級成明文持久化。

### 統一領域資料

兩種來源都輸出 `PatientEntity` 與 `ClinicalDataCollection`。React Query 提供查詢生命週期與快取，左側 UI、AI FHIR tools、計算機與 summary 共用同一份 collection，避免各功能自行重查與產生不同真相。

## 畫面組成

### 左側面板

`LEFT_PANEL_TABS` 目前有五個分頁：

1. Patient：病人資訊、生命徵象、問題清單、預立醫療決定、器材、照護計畫。
2. Visits：就診歷史與 encounter detail。
3. Reports：檢驗、累積報告、影像／病理／文件報告與 AI 解讀。
4. Medications：用藥，並內嵌過敏與疫苗子分頁。
5. Documents：FHIR `Composition` narrative。

停用的 Diagnosis 舊卡與獨立 Allergies 卡仍保留在 registry，但不會重複 render。

### 右側面板

目前五個主要功能依序為：

1. Medical Summary：預設 tab；force-mounted，外層面板負責捲動。
2. Medical Chat：force-mounted，保留對話與串流狀態。
3. Medical Calculator：57 個定義，分為 10 類，支援病人數值自動帶入。
4. IPS Export：force-mounted，保留 AI 推論與人工確認狀態。
5. Settings：固定在最右側且不可取消 pin。

右側 tab pin 狀態由 `right-panel-tabs.store.ts` 管理。Medical Summary 內再以 drawer 提供資料範圍、自訂摘要模組與卡片版面管理。

### Responsive layout

- `<768px`：單欄，在臨床資料與功能間切換。
- `>=768px`：可調寬的雙面板，可收合任一側。
- Header 可收合；左側資源導航會自動切回可見面板。

## AI 架構

### Provider 與模型

`ai-provider.factory.ts` 依 model registry 選擇 OpenAI、Gemini 或 Claude。沒有 user key 時，可走 Firebase Functions proxy；premium model 缺 key 時由 `gateModel*()` 降級至免費預設，UI 顯示實際執行模型。

另有固定 logical id `openai-compatible-custom`。設定畫面主推完整 Chat Completions URL，並在儲存前正規化為 canonical HTTPS Base URL；upstream model id、optional key 與明確 transport 存在 browser config，舊 profile 一律遷移為 `direct`。direct transport 由 browser 呼叫，`mediprisma-gateway` transport 則以 Firebase ID token／App Check 呼叫受限 BYO Gateway，provider key 使用獨立 header。兩者不會自動互相 fallback。串流、非串流與 Agent 共用此規則，cache identity 加入 transport／endpoint／model fingerprint。

API key 預設加密存於 `sessionStorage`，使用者可切換為 `localStorage`。模型偏好與 key 分開儲存，各 AI surface 有自己的 model slot。

### Structured Medical Summary

Medical Summary 不是任意 Markdown，而是 Zod 驗證後的固定 schema：問題、時間軸、安全提醒、待決策事項、檢查趨勢、用藥核對／衛教與 coverage。主要原則：

- app 建 source catalog 並發給模型短 key。
- 日期、機構、resource type 與導覽目標由 app 端解析。
- 引用可點回左側對應 FHIR resource；找不到會標成未驗證。
- summary 與 safety 是獨立生成 slot，由 orchestrator 統一快取、重試與更新 UI。
- 加密結果 cache 最長 12 小時，prompt／資料／病人／受眾／模型改變會換 key。

### Medical Chat Agent

聊天只有一條 Agent 路徑。`runDeepModeAgent()` 是 UI 與 headless eval 共用的核心：

- Vercel AI SDK `streamText()` + `stepCountIs(10)`。
- 第一輪可多步 tool calling；若只有 tool result 沒文字，進第二輪整理；必要時第三輪純文字 synthesis。
- 每一輪都有 idle watchdog，預設 60 秒無 token／event 便 abort。
- 16 個 FHIR tools 讀取共用 `ClinicalDataCollection`；另有 1 個 Perplexity 文獻工具。
- Tool payload 會遮罩 id、DOB、provider display 與病人文字識別片段；使用者自由文字在送出前再 scrub。

`clinical-skill-tools.ts` 的 eGFR 與 NLM terminology tools 是 eval 候選，尚未註冊到正式 app Agent。

## 狀態與持久化

| 資料 | 技術 | 生命週期 |
|---|---|---|
| Server/clinical queries | React Query | 記憶體快取；依 query key 與 data source 失效 |
| UI 與生成狀態 | Zustand / Context | in-memory；部分偏好 localStorage |
| Local FHIR bundle | IndexedDB + AES-GCM | tab session，且最多 12 小時 |
| AI-derived cache | localStorage + session AES key | 不可跨 tab 解密，最多 12 小時 |
| API keys | encrypted sessionStorage | 預設關窗清除；可明確改為 localStorage |
| Chat history | Firestore `users/{uid}/chats` | 僅登入且非無痕對話；影像不儲存 |
| User templates/modules | Firestore or localStorage | 登入時同步，訪客留在本機 |

匯入／清除 bundle 會發出 `mediprisma:local-bundle-changed`，重設對話與病人衍生狀態，避免上一位病人的內容殘留。

## Firebase 與 proxy

啟動時可建立匿名 Firebase session，讓訪客在免費額度內使用代理；登入帳號解鎖跨裝置資料。代理請求移除 provider key，加入：

- Firebase ID token：`Authorization: Bearer ...`
- App Check token（有設定時）：`X-Firebase-AppCheck`
- 公開 client marker（相容用途）：`x-proxy-key`

真正的 quota、allowed model、CORS 與 Firestore Rules 必須由後端 repo 執行，不能只依賴前端。

BYO OpenAI-compatible Gateway 另外接受 `X-Upstream-Base-URL`、`X-Upstream-Path` 與 `X-Upstream-API-Key`。後端只允許明確白名單 provider 和 `models`／`chat/completions`，不持久化使用者 key，也不取得 owner-funded secrets。此 transport 代表 prompt／response 會經 Firebase，設定 UI 必須明示。

## 部署

| 模式 | 指令 | 特性 |
|---|---|---|
| Local dev, Turbopack | `npm run dev` | port 3001；Next API route 可用 |
| Local dev, webpack | `npm run dev:webpack` | port 3000 |
| Node build | `npm run build` / `npm start` | `headers()` 與 `/api/feedback` 可用 |
| GitHub Pages | `npm run build:gh` | static export、base path `/medical-note-smart-on-fhir` |
| 院內 HTTPS | `npm run build:intranet` | root static export、offline mode、由院內 Gateway 提供 TLS 與 `/ai/v1` reverse proxy |
| mediprisma mirror | `npm run build:mediprisma` | static export、base path `/app` |

Static host 不會執行 `next.config.ts.headers()` 或 `/api/feedback`，因此正式回饋需設定 `NEXT_PUBLIC_FEEDBACK_URL` 指向外部 function。

## 品質閘門

- `npx tsc --noEmit`
- `npm run lint`
- `npm test`
- `npm run test:e2e`
- `npm run build:gh`

CI 在 master 與 PR 執行 typecheck、lint、Jest 與 static build；E2E 另在 master 執行。CodeQL 每週與 push／PR 執行。`scripts/loop/gate.mjs` 將 typecheck、lint、test 與選用 build 串成可供本機迭代使用的 verifier。

## 延伸閱讀

- [Feature 模組](FEATURES.md)
- [AI Agent](AI_AGENT_IMPLEMENTATION.md)
- [Medical Chat](MEDICAL_CHAT.md)
- [Security](SECURITY.md)
- [文件索引](README.md)
