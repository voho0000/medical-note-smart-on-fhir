# 問題回報功能設定指南

> 現行規格｜基準版本：v0.51.0｜最後核對：2026-09-15

Feedback UI 位於 header overflow menu。前端會優先 POST 到 `NEXT_PUBLIC_FEEDBACK_URL`；未設定時 fallback 到同 origin `/api/feedback`。

## 部署模式

| 部署 | Endpoint | 建議 |
|---|---|---|
| `next dev`／`next start`／Vercel Node | 內建 `/api/feedback` 可用 | 設定 Resend server env，或只做本機接收測試 |
| GitHub Pages／其他 static export | 沒有 Next API route | 必須設定 `NEXT_PUBLIC_FEEDBACK_URL` 指向外部 HTTPS function |
| Firebase Functions | 獨立後端 repo | 正式環境建議；加入 ID token、App Check、集中式 rate limit |

若 static build 未設定外部 URL，前端會呼叫不存在的 `<basePath>/api/feedback` 而失敗。

## 前端 payload

```ts
interface FeedbackRequest {
  reportId: `FB-${string}`
  email: string
  issueType: 'bug' | 'ai' | 'ui' | 'data' | 'performance' | 'privacy' | 'other'
  severity: 'low' | 'medium' | 'high' | 'critical'
  description: string
  steps?: string
  images?: Array<{
    contentType: 'image/jpeg' | 'image/png' | 'image/webp'
    data: string // base64，不含 data URL prefix
  }>
  systemInfo: {
    timestamp: string
    userAgent: string
    screenResolution: string
    viewport: string
    devicePixelRatio: string
    rootFontSize: string
    theme: 'light' | 'dark'
    timeZone: string
    language: string
    currentPath: string
    currentView: string
    fhirServerOrigin: string
    appVersion: string
    launchSource: string
    site: string
  }
}
```

`ai` 用於 AI 回答或臨床解讀問題；前端會提示回報者指出錯誤段落、預期內容或參考依據。`patientId` 與圖片本機檔名刻意不收集；FHIR server 只傳 origin，不傳 path 或 query。description／steps／使用者附加的截圖仍可能包含 PHI，介面不另設警示或遮蔽確認勾選。圖片只存在表單記憶體中，瀏覽器會先重編碼以移除 EXIF 等中繼資料，再於送出時序列化；最多三張 JPG／PNG／WebP，解碼後合計 8 MB。

## 內建 Next route

`app/api/feedback/route.ts` 提供：

- 必要欄位與 payload length 驗證。
- 圖片數量、base64、MIME、實際檔頭與解碼後總大小驗證。
- issue type／severity allowlist。
- HTML email escaping。
- Production origin／same-host 檢查。
- 每 instance、每 IP、每小時 5 次的記憶體 rate limit。
- Generic client error；詳細錯誤只寫 server log。
- `RESEND_API_KEY`、`FEEDBACK_TO_EMAIL` 與 `FEEDBACK_FROM_EMAIL` server-side config。

限制：沒有登入驗證，rate limit 不跨 serverless instances，也沒有 durable queue。正式環境應把相同 validation 放到外部 function 並加上 Firebase ID token／App Check。

## 環境變數

### 前端／build-time

```bash
NEXT_PUBLIC_FEEDBACK_URL=https://your-function.example/feedback
NEXT_PUBLIC_PROXY_KEY=public-client-marker
```

`NEXT_PUBLIC_PROXY_KEY` 會公開在 client bundle，不能當 secret 或唯一驗證。

### 內建 Node route

```bash
RESEND_API_KEY=re_...
FEEDBACK_TO_EMAIL=team@example.org
FEEDBACK_FROM_EMAIL="MediPrisma <feedback@example.org>"
```

這三個值不可使用 `NEXT_PUBLIC_` 前綴。任一未設定時，內建 route 回 `503` 與 `emailSent: false`，前端保留草稿並顯示失敗，不會再誤報送出成功。

## Resend 設定

1. 建立 Resend API key 並放入 server secret store。
2. 設定 `FEEDBACK_TO_EMAIL`。
3. 驗證自己的寄件 domain，並把 `FEEDBACK_FROM_EMAIL` 設成該網域的寄件地址。
4. 確認 reply-to 使用回報者 Email，收件人不是寫死在 source。
5. 依組織政策設定郵件保留與刪除。

## 本機測試

```bash
npm run dev
```

在 `http://localhost:3001` 開啟回饋表單：

- 沒有 Resend env：應顯示送出失敗並保留草稿；server log 只記未設定與 issue metadata，不印 description 或圖片。
- 有 Resend env：應回 `emailSent: true` 與 `reportId`，並收到 HTML＋plain text 郵件；有附圖時圖片出現在附件中。
- 必填、Email 格式、description 至少 20 字元由前端驗證。
- 超過三張、偽裝格式或錯誤 base64 回 400；圖片超過 8 MB 回 413。非法 origin 與第 6 次請求分別回 403、429。

也可針對 route 寫 request test，至少覆蓋 HTML injection、缺少 `systemInfo`、Resend failure 與錯誤資訊不外洩。

## 外部 Function 契約

外部 endpoint 應接受同一 JSON schema，並：

- 只允許已知 production origins。
- 驗 Firebase ID token 與 App Check。
- 使用 per-uid 集中式 quota／rate limit，避免院內共用 IP 互相影響。
- 再次做 allowlist、size validation 與 HTML escape。
- 圖片只作為郵件附件，不寫入 Storage、Firestore 或 log。
- 不記錄 request body、token 或 patient identifiers。
- 成功時回傳穩定的 `reportId`；重試沿用同一編號作為 Resend idempotency key，避免逾時重送造成重複郵件；4xx／5xx 只回 generic message。

前端會附上 Firebase ID token、可用時的 App Check token，以及公開的 `x-proxy-key` marker；外部 Function 不得只靠 marker 授權。

## 疑難排解

### GitHub Pages 404

確認 Actions build 有注入 `NEXT_PUBLIC_FEEDBACK_URL`，且 URL 不含錯誤 base path。Static export 沒有 `/api/feedback`。

### UI 成功但沒收到信

內建 route 在缺少 server env 時會回 `503` 與 `emailSent: false`；UI 會保留草稿並顯示失敗。檢查 server response／log、Resend domain、收件信箱與 spam。

### 403 Forbidden

更新外部 Function 的 CORS／origin allowlist；若使用內建 route，確認 `Origin` 與 `Host` 相符或在 `ALLOWED_ORIGINS`。

### 429 Too Many Requests

等待一小時或在 local dev 重啟 instance。正式分散式 quota 的重設方式由後端實作決定。

## 相關文件

- [Feature implementation](../features/feedback/README.md)
- [Security](SECURITY.md)
- [Privacy policy](../PRIVACY_POLICY.md)
