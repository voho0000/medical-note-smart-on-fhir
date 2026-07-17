# 院內 HTTPS／純內網部署

MediPrisma 支援由使用者瀏覽器直接呼叫 OpenAI Chat Completions compatible API，包括：

- `https://llm.intra.example.org/v1`
- `https://10.20.30.40:8443/v1`（憑證 SAN 必須包含該 IP）
- `/ai/v1`（推薦的同源院內 Gateway）
- 開發環境的 `http://localhost:*`、`http://127.0.0.1:*`、`http://[::1]:*`

不要輸入完整的 `/chat/completions`；SDK 會在 Base URL 後自行加上 API path。

## 推薦拓樸

```text
院內瀏覽器
  └─ HTTPS https://mediprisma.intra.example.org
       ├─ /            → out/ 靜態 App
       └─ /ai/v1/*     → http://10.20.30.40:8000/v1/*
                              └─ vLLM / Ollama / LM Studio / 其他 compatible server
```

瀏覽器只看見同一個 HTTPS origin，因此不需要 CORS，也不會遇到 HTTPS→HTTP mixed content 或 public-to-private network access 問題。Gateway 與模型主機都由院方管理；請求不經過 MediPrisma owner server。

## 建置

1. 在可取得 npm packages 的受控建置環境先完成 dependency 與原始碼稽核。
2. 依院內 SMART 註冊修改 [`.env.intranet.example`](../.env.intranet.example)，再執行：

   ```bash
   npm ci
   npm run build:intranet
   ```

3. 將 `out/` 以離線媒體或院內 artifact registry 搬入 Gateway，例如 `/srv/mediprisma`。
4. 以 [`deploy/intranet/Caddyfile.example`](../deploy/intranet/Caddyfile.example) 為起點，替換 hostname、certificate 與模型 IP。

`build:intranet` 會：

- 產生 root-path static export；
- 設定 `NEXT_PUBLIC_OFFLINE_MODE=1`；
- 清除 build shell 中可能殘留的 MediPrisma AI、Whisper、Perplexity、feedback 與 App Check URL；
- 不把 Next `/api` route 放進靜態 artifact。

模型權重、container image、Caddy binary 與更新套件也必須事先匯入院內；runtime 不需要外網。

## TLS 與 DNS

正式環境建議使用院方 DNS 名稱，例如 `mediprisma.intra.<院方網域>`，以及 AD CS／院內 PKI 簽發的 server certificate。把 root/intermediate CA 透過 GPO 或 MDM 安裝到所有工作站。

Pilot 可以使用 Caddy `tls internal`，但仍必須把 Caddy root CA 安裝為受信任根憑證。前端 JavaScript無法、也不應略過瀏覽器的憑證錯誤。

不建議 `.local`（可能與 mDNS 衝突）或裸 IP；若必須使用 IP，certificate SAN 必須精確包含該 IP。

## App 設定

在「設定 → AI 偏好設定 → 院內／地端 OpenAI-compatible API」輸入：

- API Base URL：同源部署填 `/ai/v1`；跨 origin 直連填完整 HTTPS URL。
- 上游模型 ID：必須是 server 接受的實際 `model` 值。
- API key：選填；無驗證的院內 endpoint 可留白。

「測試連線」由瀏覽器直接執行。它先呼叫 `GET /models`；若 server 未實作，才用不含病人資料的 `Reply with OK.` 做一 token Chat Completions probe。測試與正式請求都不會經過 Next server。

儲存後，在各 AI 功能的模型選單選擇「院內／地端」模型。Base URL、模型 ID 與 optional key 預設只保留於目前 browser session；開啟「在此裝置記住金鑰」才會移到 localStorage，key 仍以既有 browser-side encryption 儲存。

## 跨 origin 直連

若不用同源 `/ai/v1`，模型 Gateway 必須：

- 回應 `OPTIONS` preflight；
- `Access-Control-Allow-Origin` 精確允許 MediPrisma origin；
- 允許 `GET, POST, OPTIONS`；
- 允許 `Authorization, Content-Type` headers；
- 視瀏覽器版本／網路區域回應 Private Network Access 相關 preflight。

不要用 `Access-Control-Allow-Origin: *` 搭配 credentials。此實作不送 cookies（`credentials: omit`），optional API key 只放在 Authorization header。

## 純內網資料邊界

選用院內模型時，程式會 fail closed：

- 主對話、摘要、Safety、Custom Insights 直接呼叫院內 endpoint，絕不 fallback 到 MediPrisma AI proxy。
- Follow-up suggestions 改由同一院內模型產生。
- Agent 不掛載 Perplexity literature tool。
- 對話不自動上傳 Firestore，也不產生雲端 smart title。
- 語音轉錄改呼叫同一 Base URL 的 `/audio/transcriptions`；server 未實作時會顯示失敗，不 fallback 到雲端 Whisper。
- 固定 helper（報告解讀與 IPS 問題推論）在院內 connection 啟用時優先使用它。
- `NEXT_PUBLIC_OFFLINE_MODE=1` 不初始化 Firebase Auth、Firestore 或 App Check，並停用所有 owner-funded proxy availability。

SMART FHIR 請求仍會依 launch 的 `iss` 連到 EHR/FHIR server；純內網部署必須確保這些 endpoints、OAuth authorize/token URL 與 redirect URI 全部在院內可達。

## 防火牆與 logging

最低規則：

```text
使用者 VLAN → Gateway:443
Gateway → 模型主機:模型 port
使用者／Gateway → 院內 EHR/FHIR/OAuth endpoints
其他 Internet egress → deny
```

Gateway 與模型 server 不應記錄 prompt、response、Authorization、FHIR token 或完整 request body。建議以封包稽核確認沒有 Internet egress，並以 signed offline artifact 進行更新。
