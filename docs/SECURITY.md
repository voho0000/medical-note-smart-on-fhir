# 安全性指南 / Security Guide

> 現行規格｜基準版本：v0.40.0｜最後核對：2026-07-14

本文件描述 app repo 已實作的控制與仍需由部署端承擔的責任。MediPrisma 是研究／教學用途軟體；本 repo 沒有宣稱已取得 HIPAA、GDPR、臺灣醫療器材或資安認證。

## 保護目標

- 病人 FHIR 原始資料不以明文長期留在共用工作站。
- SMART token、user API key 與完整 Bundle 不交給 AI 模型。
- AI 請求只帶完成當次功能所需的資料，並降低可識別資訊。
- 使用者、病人與 FHIR server 的雲端資料互相隔離。
- 生成內容可追溯來源，無來源或無法驗證時明確標示。
- Static host、Node host 與外部 Firebase Functions 的責任不混淆。

## 已實作控制

### SMART on FHIR

- Public client + OAuth 2.0 authorization code + S256 PKCE。
- 不接受 client secret；`NEXT_PUBLIC_SMART_CLIENT_ID` 是公開識別碼。
- EHR launch 與 standalone launch 使用不同 launch scope。
- 有有效 SMART token 時優先於舊 local bundle。
- 分頁搜尋超過 50 頁會明確失敗，不回傳靜默截斷的成功資料。

### 本地 Bundle

- Bundle 與 binary images 以 WebCrypto AES-GCM 加密後存 IndexedDB。
- 每個 tab 產生 256-bit session key，只放在 `sessionStorage`。
- 紀錄最多保留 12 小時；過期、無 key、解密失敗、清除資料或登出時刪除。
- WebCrypto／storage 不可用時不降級成明文 persistence，只保留當次記憶體能力。
- 舊版明文資料讀取後會嘗試原地加密 migration；加密不可用則不再持久保存。

### AI-derived cache

- Medical Summary、Safety、Report Interpretation 等衍生結果使用與 Bundle 相同的 session key envelope。
- 小型密文存在 localStorage，但新 tab 沒有 key，無法解密並會清除。
- cache 有 12 小時上限，並以病人、資料、prompt、model／audience 等 identity 隔離。
- 使用者清除本地資料時一併 purge `mediprisma:ai-result:*`。

### API keys

- OpenAI、Gemini、Claude、Perplexity key 在寫入 storage 前加密。
- 新使用者預設 `sessionStorage`，關閉視窗後消失；只有明確開啟「記住此裝置」才改為 localStorage。
- key 做 trim 與 header-safe 驗證，避免錯誤內容進入 Authorization header。
- provider user key 只在 direct-provider path 使用；proxy interceptor 會先移除 provider credential header。
- 院內 OpenAI-compatible key 與其他 provider key 使用相同的 session-first、加密 browser storage；optional key 只送往使用者設定的 endpoint。

### 院內 OpenAI-compatible endpoint

- 接受 HTTPS hostname、IPv4／IPv6、port 與同源 `/ai/v1`；HTTP 僅允許 loopback 開發環境。
- 拒絕 URL userinfo、query、fragment、非 HTTP(S) scheme 與誤填的完整 `/chat/completions`。
- 連線測試完全在 browser 執行，不提供 server-side arbitrary-URL fetch，因此不建立 SSRF primitive。
- 自訂模型使用固定 logical model id，實際 upstream model id 只在 direct request body；endpoint／model fingerprint 納入 AI cache identity。
- 自訂 endpoint unavailable 時 fail closed，不 fallback 到 owner proxy。
- 院內模式停用 Firestore chat auto-save／smart title、移除 Perplexity tool，follow-up 與可支援的語音功能改走相同 endpoint。
- `NEXT_PUBLIC_OFFLINE_MODE=1` 不初始化 Firebase/Auth/App Check；`build:intranet` 另會清空所有 cloud proxy URL。

瀏覽器端加密無法防禦已執行在同一 origin 的惡意 JavaScript／XSS；它主要降低 storage 被直接讀取或共用工作站殘留的風險。

### Owner-funded AI proxy

- Proxy request 需要 Firebase ID token；匿名 session 與登入 session 都可依後端 quota 使用。
- 有設定時加入 Firebase App Check token。
- `NEXT_PUBLIC_PROXY_KEY`／`x-proxy-key` 位於公開前端，不能當真正身分驗證；後端必須驗 ID token、App Check、quota、allowed model 與 CORS。
- Upstream provider keys 只存在後端 secrets。

### PII minimization

- FHIR tools 不回傳 patient name、id、完整 birth date 或 provider display。
- Tool payload 的每個字串會再做 patient literal／常見識別格式 scrub。
- User message 在 UI／history 保留原文，但傳給 AI 的副本先遮罩已知病人識別文字。
- 回饋表單不收 patientId；UI 提醒使用者不要輸入姓名、病歷號等資料。
- Chat history 不儲存上傳圖片。

這些是 best-effort minimization，不是正式匿名化。病摘、影像文字或使用者自由輸入仍可能含未辨識的 PHI。

### HTML 與輸出

- Markdown rendering 經 DOMPurify sanitization。
- Feedback email 對所有 attacker-controlled 欄位做 HTML escape，badge class 使用 allowlist。
- Structured Medical Summary 以 Zod 驗證固定 schema；來源 key 由 app 建立，日期／機構／resource type 由 app 端回填。
- Unknown citation 顯示未驗證，不應被 UI 靜默包裝成可信來源。

### Feedback endpoint

內建 `/api/feedback`：

- 檢查 Origin／same-host。
- 每個 server instance 對來源 IP 做每小時 5 次的記憶體 rate limit。
- 驗證必要欄位、allowlist 類型與長度。
- 對 caller 回傳 generic 500，詳細錯誤只留 server log。
- 收件人由 `FEEDBACK_TO_EMAIL` 設定，不硬編個人信箱。

限制：instance-local rate limit 不是分散式強制，也沒有登入驗證。正式 static deployment 應使用外部 Firebase Function，在後端加入 ID token、App Check 與集中式 rate limiting。

### Browser security headers

`next.config.ts` 在 Node host 提供：

- `Content-Security-Policy: frame-ancestors ...`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(self), geolocation=()`
- legacy `X-XSS-Protection`

`X-Frame-Options` 刻意不用，因 app 需由 allowlisted HIS／Bridge iframe 嵌入；frame policy 由 CSP `frame-ancestors` 管理。

GitHub Pages 不會執行 Next `headers()`，因此上述 header 不會由 static export 自動送出。若 production 必須強制 CSP，需在 CDN／reverse proxy 層設定或改用可控 header 的 host。

### Quality controls

- ESLint boundary rules 阻止主要跨層依賴回歸。
- GitHub Actions 執行 typecheck、lint、Jest 與 static build。
- CodeQL 在 push、PR 與每週排程分析 JavaScript／TypeScript。
- Dependabot 監控 npm／Actions dependency。
- Playwright 以合成資料測 client flows，另有 Firebase emulator chain。

## 部署端責任

### Firebase

- 部署並版本控制 Auth policy、Firestore Rules、indexes、Functions CORS、quota 與 App Check enforcement。
- 確認 Firebase Authorized Domains，repo 的 daily auth-domain guard 只做 drift detection。
- 對 `users/{uid}` collection 強制 uid ownership。
- 對 `sharedPrompts` 強制 author ownership、schema、長度與安全欄位。
- 設定 data retention、刪除流程、audit log 與 incident response。

### Secrets 與環境變數

- 所有 `NEXT_PUBLIC_*` 都會進瀏覽器 bundle，不可放 server secret。
- `RESEND_API_KEY`、AI provider proxy keys、service credentials 只能放 server／Functions secret store。
- 輪替曾暴露或疑似外洩的 key，不以刪除 Git history 當成輪替替代品。
- Production 與 dev proxy URL／CORS 應分離。

### 組織政策

- 在傳送真實病人資料給第三方 AI 前完成法務、資安、DPA／BAA、資料地區與保留政策審查。
- 共用工作站仍應有 OS 帳號、螢幕鎖定、瀏覽器 profile 與 session timeout。
- 將 AI 輸出定位為 decision support，要求臨床人員回查來源與確認。
- 建立資料主體請求、匯出、刪除與 breach notification 程序。

## 已知限制與剩餘風險

- Client-side app 無法抵抗同 origin XSS、惡意 extension、已被控制的裝置或使用者主動外洩。
- PII scrub 可能漏掉自由文字中的非典型姓名、院內編號或影像 burned-in annotation。
- Firestore chat history 可能包含 PHI，內容目前不是 app-level end-to-end encryption。
- Anonymous Firebase token 降低裸 API 濫用，但攻擊者仍可能自動建立 session；需 App Check、quota 與 rate limit 配合。
- Static GitHub Pages 無自訂 response headers 與 server API route。
- Source key 存在只證明引用可定位，不自動證明每一個自然語言 claim 完全由該來源支持。
- 第三方 AI、Firebase、Resend、GitHub Pages 各有自己的處理條款與 availability。

## 發布前檢查

- [ ] `npm audit` 與 CodeQL findings 已檢視；風險有 owner／期限。
- [ ] `npx tsc --noEmit`、`npm run lint`、Jest、E2E、build 通過。
- [ ] Firebase Rules／indexes／Functions 與 app 版本相容。
- [ ] Authorized domains、CORS、App Check、quota、allowed models 已驗證。
- [ ] Production `NEXT_PUBLIC_FEEDBACK_URL` 指向真正可用的外部 endpoint。
- [ ] CDN／host 的 CSP、HSTS、referrer、permissions headers 實際回應已檢查。
- [ ] Demo Bundle 保持去識別化，未將 `.env.local`、真實 Bundle、trace、screenshots 加入 Git。
- [ ] 隱私政策與 UI consent 反映實際啟用的 providers 與資料流。

## 發現問題

不要在公開 issue 放病人資料、token、key 或完整 request body。一般問題可用 GitHub Security Advisories／私密管道或聯絡 <voho0000@gmail.com>。

## 相關文件

- [Privacy Policy](../PRIVACY_POLICY.md)
- [Architecture](ARCHITECTURE.md)
- [AI Agent](AI_AGENT_IMPLEMENTATION.md)
- [Feedback setup](FEEDBACK_SETUP.md)
