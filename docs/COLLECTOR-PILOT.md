# TVGH 旁路紀錄試行

2026-09-22。先 pull 最新 origin/master `338a5d70`，於 `codex/vghtpe-collector-telemetry` 修改。使用者授權本次跨 repo sender 與 Gateway 契約擴充；尚未發布網站或啟用真實紀錄。

## 行為與啟用

AI、Whisper、文獻搜尋使用原本 endpoint、身份與額度流程；紀錄沒有 await 依賴、沒有失敗 toast、不會重叫模型。

使用者已要求自動傳送：當前 URL 恰有一個 `site=vghtpe` 就自動觀察並背景傳送，不需手動啟用、不新增登入提示，也沒有八小時後手動重開的限制。觀察開始、完成、取得憑證前後與實際 fetch 前皆檢查 site。缺少、不同大小寫、其他站點或重複 site 參數都不送，也不做 discovery/health probe。site 是 client 標記，不是醫院身分認證。

判斷與 URL 路徑無關：`/app/?site=vghtpe`、`/app-hmc/?site=vghtpe` 都自動傳送。`/app-hmc/` 不代表 `site=hmc`；只有 site 參數改成 `hmc`（或其他不符合值）才停止收集。此處描述本次 sender 的規則，不代表已將變更發布至 app-hmc；未修改協作者的 `pilot/hmc` 分支。

筆電預設 endpoint 為 `http://127.0.0.1:8787/collector/v1/events`。其他主機由建置設定 `NEXT_PUBLIC_COLLECTOR_ORIGIN=https://<核准主機>:8787` 指定，只接受 origin，不接受帳密、path、query 或 fragment。HTTP 僅限 loopback，其他主機要求 HTTPS。不從 `gw=`、launch URL、localStorage 或任意 runtime endpoint 讀取收件位置。

既有 Firebase session（含匿名）提供憑證，直接送原 POST API；Gateway 驗證 project、簽章、issuer/audience 與有效期限。不新增 token 發放端點、不把共用 ingest secret 放進公開 build。原本的 SDK 負責 token 更新；Collector 不另存 token。觀察所捕捉帳號在送件前若已切換／登出，就丟棄該紀錄，避免誤記到另一帳號。沒有 Firebase session 時只漏記，不跳登入視窗。

只有唯讀的診斷介面，無 enable/disable 操作需求：

```js
window.mediprismaCollector.status()
```

每個 origin／瀏覽器設定檔自動產生 UUID，存於 localStorage 的 `mediprisma.collector.browser-id.v1`；不含病人或帳號資料、不跨裝置同步。儲存被封鎖時退回 page scope，清資料／更換瀏覽器會換 ID。不是硬體指紋，不保證一台電腦只有一個 ID。

上傳最多兩筆 in-flight，沒有等待佇列；滿載丟棄新紀錄。每筆取得憑證與 HTTP 合計五秒逾時；連續三次失敗冷卻六十秒，之後新事件自動恢復嘗試，401/403 不要求手動重開。無自動重送舊事件、磁碟補送或 unload beacon。pagehide 取消舊觀察；新頁自動開始。status 只回 enabled/in_flight/sent/dropped/cooling_down；enabled 表示站點與 endpoint 條件成立，不代表 Firebase 或 Gateway 已連通。不可用、關頁、同時多個事件都可能漏記，不可當作完整帳務 audit。

## v4 資料契約

`src/shared/contracts/collector-event.ts` 與 Gateway `src/collector-event-v2.ts` 保持一致；route 仍為 `/collector/v1/events`，新 payload schema_version=4，保留 browser_id/browser_id_scope，loaded/prepared 改為精確資源筆數。Gateway 保留 v1/v2/v3 支援，SQLite table 不變。新密文為 event＋receipt 的版本化 envelope；舊 flat rows 仍可讀，舊區間不換算成臆測的精確數字。

固定欄位：UUID、操作結束時間、site、feature/provider/model 白名單、model_source、sample_kind、耗時、結果、固定 error_class、response_complete、app_version、build_revision、diagnostics。所有物件拒絕未知欄位。

| 診斷 | 實際意義 |
|---|---|
| loaded / prepared | total、encounters、medications、observations、reports、documents 的精確筆數。未知省略，確定零筆才填數字 0 |
| 資源筆數 | 非負整數，例：就診 23、用藥 47。發送端不分桶、不四捨五入、不將負數取絕對值；無效測量省略，Gateway 拒收非整數／負數／字串。上限為 JavaScript 可精確表示的整數 9,007,199,254,740,991 |
| prepared_count_basis | structured_input_upper_bound；最後文字裁切可能減少實際送出筆數 |
| context_tokens_bucket | 0、1-2000、2001-8000、8001-32000、32001-128000、128000+；估計值，非帳務 usage |
| context_trimmed | 有實際裁切資訊才提供，其他省略 |
| phase / mode | 固定階段與執行方式代碼；未知階段不猜测 |
| first_chunk_ms | 第一個非空文字 callback 耗時，不是 provider 原生 TTFT |
| http_status | 明確取得 HTTP response 時才提供，網路錯誤不猜狀態碼 |

用藥是紀錄數，不是正在服用的藥物種類；就診是本次已載入 Encounter 數。自訂模型一律 custom，未知 upstream model 為 unknown，不傳 profile ID、名稱或 endpoint。app_version/revision 是編譯版本，未提交修改不會反映於 Git hash；發布前須提交重建。

v2 response_complete 可為 null（功能層未知）；true 只表示傳輸完成，解析/驗證仍可失敗，不代表臨床正確。

## 掛點與口徑

| 流程 | 觀察層級／可用數字 |
|---|---|
| 摘要（含安全／用藥卡片）、報告解讀 | runGenerationJob 功能終態：loaded/prepared 精確筆數、token 估計區間、裁切；另有 unified request |
| 聊天 | turn 的 feature 終態與第一段文字耗時；標準病人對話提供 counts，Agent／一般問題省略病歷數量 |
| 自訂摘要、IPS 推論、後續問題、範例生成 | useUnifiedAi request 終態與 stream 第一段文字耗時；缺少筆數不假造 |
| NHI 血脂 AI | query request + feature 驗證終態；不傳答案、日期、證據或 catalog |
| Whisper | request 終態與 HTTP status；不傳音訊、轉錄文、檔名或 key |
| Perplexity | request 終態與 HTTP status；不傳 query、內容、citations 或 key；後端決定模型，記 unreported/provider-managed |

feature 和 request 不可加總成使用次數。request 是應用層呼叫，SDK retry 與 Agent 內部多輪未逐筆計數，不能換算帳单。快取命中不製造新的 AI 呼叫事件。目前沒有跨事件 parent/child ID、retry/tool 次數、FHIR 載入失敗事件、模板版本或全階段 timing；不聲稱全流程 tracing。摘要局部卡片錯誤可能與整體功能成功並存，本版未逐卡記錄。

## 診間、電腦與使用者

使用者已授權新增識別資訊。Gateway 在收件時補入以下 `receipt`，前端不可以自填這些欄位：

| 欄位 | 來源與意義 |
|---|---|
| source_ip / source_ip_basis | socket peer IP／固定 socket_peer；IPv4-mapped IPv6 正規化。忽略 X-Forwarded-For 等自報 headers |
| auth_type / user_id / email | firebase 或相容工具的 ingest_token；Firebase UID/email 僅取驗證成功憑證。匿名 UID 的 email 為 null；ingest_token 兩者為 null |
| room / workstation / mapping_basis | 管理員對照表快照，browser_id 優先，其次來源 IP；未對應為 null/unmapped，不猜診間 |

UID 是網站 Firebase 帳號，不是 Windows 或院內員工帳號；已簽章 email claim 不代表另做 email 所有權驗證。Browser ID 是 client 自述，可被複製，不是設備認證。IP 經 NAT/代理可能只代表共用出口，DHCP 也可能換機；127.0.0.1／::1 不以 IP 配對診間。

依使用者最新決定，現在不尋找、不建立診間對照表，也不將其當作部署前提；先記 IP／瀏覽器 ID，room/workstation 保持未對應，日後有需要再對照。

預留能力：管理員可在 Gateway 的 `COLLECTOR_WORKSTATION_MAP_PATH` 設定 JSON 清單，每項包含 `room`、`workstation`，以及 `browser_id` 或 `ip`（可同時指定，兩者皆須相符）；重啟載入。範例見 Gateway `deploy/collector-workstations.example.json`。首次收件的歸屬固定，不因之後更新對照而改寫舊 log。

## 保護與部署

不傳病歷全文、病人 ID 或其 hash、就診日期、診斷碼、藥名、檢驗值、FHIR、raw error、URL 或完整 headers 副本。唯一新增認證傳輸為 Authorization 的 Firebase ID token，Gateway 不保存原 token。UID/email、IP 與設備對照按上述授權加密落地。Collector 不訂閱或複製現有完整 AI diagnostics store。既有 GA4 資料流不擴充。

counts 是病歷衍生的精確統計，搭配時間／設備／帳號可能交叉比對，不宣稱正式匿名化。Gateway AES-GCM 加密 payload；UUID/received_at 索引仍明文；沿用管理 Basic Auth 與指定 retention。試行一週不自動決定保存天數。

正式網站、Gateway 正式排程與真實收件均未啟用。Gateway 需設定 `COLLECTOR_FIREBASE_PROJECT_ID`；本 repo Firebase project 為 `smart-on-fhir-ac97d`，部署時確認與網站一致。Gateway 定期向 Google 下載公鑰，不上傳紀錄；公鑰不可用且無有效快取時拒收，前端只漏記。院內 TLS/CORS/DNS、保存天數與瀏覽器私網權限須實機確認。跨電腦收件必須將網站的 NEXT_PUBLIC_COLLECTOR_ORIGIN 設成筆電／VM 的共用 HTTPS 位址；127.0.0.1 只會指向使用者自己的電腦。CSP 本次未放寬。

## 驗證與回復

2026-09-22 PR 前複驗：MediPrisma 14 suites／186 tests、TypeScript、全部修改的 TS/TSX/MJS 檔 ESLint、正式 build、lockfile 與契約一致性檢查通過；Chromium 合成瀏覽器測試 1/1 通過。新增 `/app-hmc/?site=vghtpe` 會傳送、保留 site 切換路徑不抑制觀察、其他 site 不傳送的回歸案例。維持 Firebase 驗證，不改成前端自述 UID/email。網段限制須在部署環境另外驗收，記錄 IP 不等於已設防火牆白名單。提交 PR 不代表正式部署。

2026-09-22 v4 精確筆數版：MediPrisma 9 suites／119 tests、Gateway collector/identity/auth 12 tests、Chromium 1/1、兩 repo 型別檢查與建置、修改檔案 lint、契約一致性與 diff whitespace 檢查通過。覆蓋全部六類 loaded/prepared 精確筆數、零／未知／無效值、儲存與重啟保持原值，以及 v3 歷史區間相容。尚未 commit/push/部署。

單元/整合驗證 site gate、自動啟用、途中導航/換帳號、精確筆數／零／未知／無效值、token 區間、內容排除、browser ID、最大併發、逾時、冷卻、pagehide，以及 Collector 離線仍能完成 query/stream/Whisper/搜尋。Gateway 驗證簽章認證、來源 IP／診間對照、加密、重啟、去重與拒收。瀏覽器 spec：`e2e/tests/collector-pilot.spec.ts`，使用合成 Firebase session/Bundle/AI 及攔截的 Collector HTTP，不代表院內實際 TLS 通過。

2026-09-22 自動收件版：MediPrisma 9 個相關 Jest suites／118 tests、TypeScript、修改檔案 ESLint、正式 build 與 lockfile 檢查通過；Gateway typecheck/build 與 collector/identity/auth 共 11 tests 通過。Chromium 瀏覽器測試 1/1 通過，全程沒有人工啟用，Collector 離線與將查詢參數切換成 `?site=hmc` 後聊天都能完成，後者不再送出事件；該案例不是切換至 `/app-hmc/` 路徑。Windows installer PowerShell parser 通過，兩 repo 契約一致。未執行整個 repo 的所有測試，也未發布網站或啟用正式收件。

Windows 的 `packages:ci` wrapper 另修正 `npm.cmd` spawn EINVAL，改由 Node 執行 npm CLI；沒有變更套件或 lockfile。安裝回報既有 11 個 dependency audit findings（6 low、1 moderate、4 high），本次沒有進行相依版本升級或宣稱消除這些風險。

回復可停止 Collector 或回復網站 sender，主要功能持續。保留原 DB/key 及新版 reader；舊 binary 無法讀新 envelope，勿刪除／重寫既有紀錄。新版可讀舊 flat v1/v2，舊事件不回填新增識別資料。

Visible behaviour changes: none（未隱藏或停用臨床畫面）。
