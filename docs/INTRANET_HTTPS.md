# 院內 HTTPS／純內網部署

> 現行規格｜基準版本：v0.43.0｜最後核對：2026-07-22

| 項目 | Cloud profile | On-prem profile |
|---|---|---|
| 官方用途 | `mediprisma.tw/app`、GitHub Pages | 院內 HTTPS／無外網部署 |
| Firebase | Auth、Firestore、Functions、App Check | 不初始化且不進入 static artifact |
| AI | 內建 cloud、自備 key、自訂 endpoint | 僅院內 OpenAI-compatible profiles |
| 對話／範本同步 | 登入後可跨裝置 | 目前瀏覽器裝置，不跨裝置 |
| Prompt Gallery／回饋 | 可用 | 停用雲端服務 |
| 指令 | `dev:cloud`／`build:cloud` | `dev:onprem`／`build:onprem`／`package:onprem` |

目前的 on-prem milestone 是 **Firebase-free 靜態瀏覽器應用**，適合單一工作站或由 EHR/SMART 提供 patient context 的院內部署。它尚未內建醫院 OIDC/SSO、集中式 PostgreSQL、跨裝置 chat history、伺服器 audit trail 或備份管理；需要這些能力的機構應另行提供受管後端與治理流程，不能把 browser localStorage 當成中央病歷系統。

MediPrisma 支援由使用者瀏覽器直接呼叫 OpenAI Chat Completions compatible API，包括：

- `https://llm.intra.example.org/v1/chat/completions`
- `https://10.20.30.40:8443/v1/chat/completions`（憑證 SAN 必須包含該 IP）
- `/ai/v1/chat/completions`（推薦的同源院內 Gateway）
- 開發環境的 `http://localhost:*/v1/chat/completions`、`http://127.0.0.1:*/v1/chat/completions`、`http://[::1]:*/v1/chat/completions`

設定畫面建議貼上完整的 `/chat/completions` 網址。舊版只填到 `/v1` 的 Base URL 仍可使用；App 會先正規化成內部 Base URL，再安全地組合模型清單、Chat 與語音路徑。

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
2. 複製 [`.env.intranet.example`](../.env.intranet.example) 為不納入 Git 的 `.env.intranet`，依院內 SMART 註冊修改後執行：

   ```bash
   cp .env.intranet.example .env.intranet
   npm ci
   npm run build:onprem
   ```

3. 將 `out/` 以離線媒體或院內 artifact registry 搬入 Gateway，例如 `/srv/mediprisma`。
4. 以 [`deploy/intranet/Caddyfile.example`](../deploy/intranet/Caddyfile.example) 為起點，替換 hostname、certificate 與模型 IP。

   同時把 Caddyfile 的 `connect-src`、`frame-ancestors` placeholder 換成院內 FHIR/OAuth 與 EHR origin；不要直接改成 `https:` 或 `*`。

`build:onprem`（`build:intranet` 的相容別名）會：

- 產生 root-path static export；
- 固定 `NEXT_PUBLIC_DEPLOYMENT_PROFILE=onprem`；
- 設定 `NEXT_PUBLIC_OFFLINE_MODE=1`；
- 載入 `.env.intranet` 的院內 SMART／AI allowlist 設定；
- 清除 build shell 中可能殘留的 Firebase、MediPrisma AI、Whisper、Perplexity、feedback、proxy key 與 App Check 設定；
- 不把 Next `/api` route 放進靜態 artifact。
- 在輸出後執行 sanitizer 與 forbidden-domain audit；也可用 `npm run audit:onprem` 對目前的 `out/` 重跑掃描。

模型權重、container image、Caddy binary 與更新套件也必須事先匯入院內；runtime 不需要外網。

若要產生便於離線媒體交付的版本化安裝包，執行：

```bash
npm run package:onprem
```

輸出位於 `artifacts/`，包含 `tar.gz` 與同名 `.sha256`。院內主機解壓前應先用 `sha256sum -c`（Linux）或 `shasum -a 256 -c`（macOS）驗證；壓縮包內含已稽核的 `out/`、Caddyfile、env 範例、安裝文件與 `onprem-manifest.json`。

## TLS 與 DNS

正式環境建議使用院方 DNS 名稱，例如 `mediprisma.intra.<院方網域>`，以及 AD CS／院內 PKI 簽發的 server certificate。把 root/intermediate CA 透過 GPO 或 MDM 安裝到所有工作站。

Pilot 可以使用 Caddy `tls internal`，但仍必須把 Caddy root CA 安裝為受信任根憑證。前端 JavaScript無法、也不應略過瀏覽器的憑證錯誤。

不建議 `.local`（可能與 mDNS 衝突）或裸 IP；若必須使用 IP，certificate SAN 必須精確包含該 IP。

## App 設定

在「設定 → AI 偏好設定 → 院內／地端 OpenAI-compatible API」輸入：

- Chat Completions 網址：同源部署填 `/ai/v1/chat/completions`；跨 origin 直連填完整 HTTPS URL。舊的 `/ai/v1` 或 `/v1` Base URL 仍相容。
- 上游模型 ID：必須是 server 接受的實際 `model` 值。
- API key：選填；無驗證的院內 endpoint 可留白。

「測試連線」由瀏覽器直接執行。它先呼叫 `GET /models`；若 server 未實作，才用不含病人資料的 `Reply with OK.` 做一 token Chat Completions probe。測試與正式請求都不會經過 Next server。

on-prem profile 預設只允許同源 `/ai/v1` 與 loopback endpoint。若必須跨 origin 連到院內 Gateway，必須把完整 origin 加入 `.env.intranet` 的 `NEXT_PUBLIC_ONPREM_AI_ALLOWED_ORIGINS`；未列入的 origin 會在送出 request 前被拒絕。

儲存後，每個院內／地端 profile 都會出現在各 AI 功能的模型選單；最多可保存 10 個並逐一啟用或刪除。端點、模型 ID 與 optional key 以 localStorage v2 envelope 保留於目前瀏覽器裝置，每把 key 分別使用 browser-side encryption；關閉再重開網頁仍可使用，直到使用者刪除 profile 或清除本機資料。

## 跨 origin 直連

若不用同源 `/ai/v1`，模型 Gateway 必須：

- 回應 `OPTIONS` preflight；
- `Access-Control-Allow-Origin` 精確允許 MediPrisma origin；
- 允許 `GET, POST, OPTIONS`；
- 允許 `Authorization, Content-Type` headers；
- 視瀏覽器版本／網路區域回應 Private Network Access 相關 preflight。

不要用 `Access-Control-Allow-Origin: *` 搭配 credentials。此實作不送 cookies（`credentials: omit`），optional API key 只放在 Authorization header。

## 同一份程式碼測試兩種版本

兩種版本由 build profile 決定，不由 port 決定；port 只用來同時啟動兩個獨立 process：

```bash
# 原 Firebase/cloud 模式
npm run dev:cloud       # http://localhost:3001

# 全地端模式（建議在另一個 git worktree 執行）
npm run dev:onprem      # http://localhost:3100
```

正式 cloud build 使用 `npm run build:cloud`；mediprisma.tw/app 與 GitHub Pages build script 也會明確鎖定 `cloud`，不繼承呼叫端的 offline profile。

## 純內網資料邊界

選用院內模型時，程式會 fail closed：

- 主對話、摘要、Safety、Custom Insights 直接呼叫院內 endpoint，絕不 fallback 到 MediPrisma AI proxy。
- Follow-up suggestions 改由同一院內模型產生。
- Agent 不掛載 Perplexity literature tool。
- 對話不自動上傳 Firestore，也不產生雲端 smart title。
- direct profile 的語音轉錄會由同一 Chat Completions 網址推導 API Base，再呼叫 `/audio/transcriptions`；server 未實作時會顯示失敗，不 fallback 到雲端 Whisper。Firebase Gateway profile 目前不支援語音，也同樣 fail closed。
- 固定 helper（報告解讀與 IPS 問題推論）會使用第一個已啟用且 runtime-ready 的院內 profile。
- `NEXT_PUBLIC_OFFLINE_MODE=1` 不初始化 Firebase Auth、Firestore 或 App Check，並停用所有 owner-funded proxy availability。
- SMART launch 沒有 `iss` 時不導向 public sandbox，且只接受 `NEXT_PUBLIC_SMART_ALLOWED_ISS` 明列的院內 issuer；未列入者沒有「繼續連線」繞過選項。
- FHIR Narrative 的跨 origin 圖片會在插入 DOM 前移除；Caddy CSP 再以 `img-src 'self' data: blob:` 阻擋漏網外連。

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
