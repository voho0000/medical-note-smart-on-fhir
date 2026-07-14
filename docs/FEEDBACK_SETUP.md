# 問題回報功能設定指南

> 現行規格｜基準版本：v0.40.0｜最後核對：2026-07-14

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
  email: string
  issueType: 'bug' | 'ui' | 'performance' | 'feature' | 'other'
  severity: 'low' | 'medium' | 'high' | 'critical'
  description: string
  steps?: string
  systemInfo: {
    timestamp: string
    userAgent: string
    screenResolution: string
    language: string
    currentPath: string
    fhirServerUrl: string
  }
}
```

`patientId` 刻意不收集。FHIR server URL 仍可能透露機構，description／steps 也可能由使用者輸入 PHI；UI 會提示不要加入姓名或病歷號。

## 內建 Next route

`app/api/feedback/route.ts` 提供：

- 必要欄位與 payload length 驗證。
- issue type／severity allowlist。
- HTML email escaping。
- Production origin／same-host 檢查。
- 每 instance、每 IP、每小時 5 次的記憶體 rate limit。
- Generic client error；詳細錯誤只寫 server log。
- `RESEND_API_KEY` 與 `FEEDBACK_TO_EMAIL` server-side config。

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
```

這兩個值不可使用 `NEXT_PUBLIC_` 前綴。未設定時，內建 route 仍回 `success: true, emailSent: false`，但不寄信；只適合 local development。

## Resend 設定

1. 建立 Resend API key 並放入 server secret store。
2. 設定 `FEEDBACK_TO_EMAIL`。
3. Production 應驗證自己的寄件 domain，並把 route 的 `from` 從 `onboarding@resend.dev` 改成已驗證地址。
4. 確認 reply-to 使用回報者 Email，收件人不是寫死在 source。
5. 依組織政策設定郵件保留與刪除。

## 本機測試

```bash
npm run dev
```

在 `http://localhost:3001` 開啟回饋表單：

- 沒有 Resend env：應顯示送出成功，server log 只記未設定與 issue metadata，不印 description。
- 有 Resend env：應回 `emailSent: true` 並收到 HTML＋plain text 郵件。
- 必填、Email 格式、description 至少 20 字元由前端驗證。
- 大於 server 上限、非法 origin 與第 6 次請求要分別回 413、403、429。

也可針對 route 寫 request test，至少覆蓋 HTML injection、缺少 `systemInfo`、Resend failure 與錯誤資訊不外洩。

## 外部 Function 契約

外部 endpoint 應接受同一 JSON schema，並：

- 只允許已知 production origins。
- 驗 Firebase ID token 與 App Check。
- 使用集中式 quota／rate limit。
- 再次做 allowlist、size validation 與 HTML escape。
- 不記錄 request body、token 或 patient identifiers。
- 回傳穩定的 2xx／4xx／5xx 與 generic message。

前端若設定 `NEXT_PUBLIC_PROXY_KEY` 會附上 `X-Client-Key`，但外部 Function 不得只靠它授權。

## 疑難排解

### GitHub Pages 404

確認 Actions build 有注入 `NEXT_PUBLIC_FEEDBACK_URL`，且 URL 不含錯誤 base path。Static export 沒有 `/api/feedback`。

### UI 成功但沒收到信

內建 route 在缺少 server env 時會回 `emailSent: false`；目前 UI 只以 HTTP success 顯示成功。檢查 server response／log、Resend domain、收件信箱與 spam。

### 403 Forbidden

更新外部 Function 的 CORS／origin allowlist；若使用內建 route，確認 `Origin` 與 `Host` 相符或在 `ALLOWED_ORIGINS`。

### 429 Too Many Requests

等待一小時或在 local dev 重啟 instance。正式分散式 quota 的重設方式由後端實作決定。

## 相關文件

- [Feature implementation](../features/feedback/README.md)
- [Security](SECURITY.md)
- [Privacy policy](../PRIVACY_POLICY.md)
