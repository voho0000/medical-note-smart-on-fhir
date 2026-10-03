# CDSS 獨立 FHIR 儲存與 OAuth

2026-10-04 依使用者釐清：Gateway 只做 log／回報資料。App 直接呼叫獨立 FHIR API，沒有 Gateway／Collector FHIR fallback。原工作區衝突保留；未發布 App、未改 pilot/hmc 或 HMC 發布鏈。

## 儲存與歷史

唯一 site=vghtpe 且有效 CDSS 結果，人工按「儲存 CDSS 紀錄」才送 POST /cdss/v1/saves。201、status=stored、相同UUID才成功。保存當下profile/result、visitAnswers等輸入、決策、來源與事件。凍結按下時的輸入，未改內容重試保留UUID；準備階段也可取消，切病人／關頁清理。原始全名／生日留在瀏覽器內作文字遮蔽與既有v1假名hash，不等於EMR病人對應。

歷史清單最近10筆／hasMore，單筆驗UUID、病人hash、pack與大小；唯讀原快照，不重新評估或寫回當次answer stores。標示醫師身分未驗證；不另存localStorage/IndexedDB、不執行HTML。可見臨床tab／卡片／既有控制保留。

## 建置設定

```text
NEXT_PUBLIC_CDSS_API_ORIGIN=https://<核准FHIR專屬主機>
NEXT_PUBLIC_CDSS_ADMISSION=intranet-pilot
```

院內模式不取Firebase、沒有醫師登入前置條件；獨立 API仍須按實際CIDR／Origin准入。NEXT_PUBLIC_COLLECTOR_ORIGIN只用於log／回報，不能當FHIR URL。

啟用可選OAuth：

```text
NEXT_PUBLIC_CDSS_ADMISSION=oauth2
NEXT_PUBLIC_FHIR_OAUTH_ISSUER=https://<核准IdP>/realms/<realm>
NEXT_PUBLIC_FHIR_OAUTH_CLIENT_ID=mediprisma-app
```

Public client使用Authorization Code + S256 PKCE，state、issuer及精確popup來源核對。callback註冊為`https://mediprisma.tw/app/fhir-auth/callback`（其他artifact使用自己的origin/basePath），Keycloak webOrigin亦精確註冊。不能放client secret進公開變數。新「登入 FHIR 授權」按鈕不會自動存病歷或清掉當次病人／評估；授權失敗、過期或未登入不能退回Firebase／匿名FHIR。授權、verifier、token僅記憶體，300秒token提前30秒停用；不使用refresh token。斷開FHIR授權清除本Apptoken，IdP SSO仍可能有效，已簽token可用至到期。

API需要RS256、opaque sub、正確issuer/audience、300秒以下期限、client ID及read/write scope；read/write不能取得bootstrap。Keycloak要配置basic scope或oidc-sub-mapper；登入帳號尚未對應院內醫師，不推定Practitioner／病人consent。FHIR repo的INDEPENDENT-API.md列出完整權限與受信任主機界線。

所有設定皆在建置時固定，變數更改需重建。/app workflow只讀新增公開設定，未設定GitHub variables或部署；HMC鏈原樣保留。所有傳輸omit cookies、no-referrer、no-store、redirect=error，patient key／UUID在POST body；save4MiB/15秒、history5MiB/15秒、最多10筆。

## 本機重現

先啟動FHIR repo的本機HAPI/PG、獨立intranet API28098。OAuth測試另啟動私有Keycloak28080與API8098；Collector origin刻意設定為無法使用的127.0.0.1:1，確認臨床流獨立。

```powershell
node node_modules/@playwright/test/cli.js test --config playwright.fhir.config.ts
# 真實本機Keycloak PKCE（路徑只指向本機新建的合成秘密檔）：
$env:FHIR_E2E_AUTH_MODE='oauth2'
$env:FHIR_E2E_SECRETS_FILE='<FHIR repo>\runtime\oauth-local\secrets.json'
node node_modules/@playwright/test/cli.js test --config playwright.fhir.config.ts
```

專用profile使用localhost3007，不借用devserver；關閉trace/video以免記錄token/帳密。只有成功授權後的App與歷史快照畫面截圖，不截登入密碼或callback URL。預設e2e跳過本機專用測試。

Jest驗hash/遮蔽/retry/準備中取消、來源、history錯病人/UUID/size及LiveFeature；真實Chromium在兩模式儲存→201→history→同snapshot/version1，手機320/390/430、平板768、桌面1024/1440與橫向檢查。VM容量、專屬HTTPS、開機/登出/>72h/備份還原仍待FHIR VM-ACCEPTANCE.md實機執行。正式病人、醫師綁定與EMR寫回延後。
