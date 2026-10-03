# CDSS FHIR 儲存與歷史調閱

2026-10-03。由最新master的隔離分支實作；原工作目錄的合併衝突／未提交變更保留。Gateway整合分支與獨立FHIR仍需審查及院內部署；本輪未發布App、未改pilot/hmc與HMC發布鏈。

## 使用流程

在唯一site=vghtpe、已有有效CDSS結果的頁面，醫師按「儲存 CDSS 紀錄」才送POST /cdss/v1/saves。收到201、status=stored與相同save_id後才成功。profile/result、人工輸入（包含本次visitAnswers）、醫師決策、來源與記憶體事件以v2快照保存。未改內容的失敗重試保留UUID；事件成功才清除，關頁／切病人時取消及清理。既有名稱、生日、遮罩證號只用於瀏覽器內version1假名hash與文字遮蔽，原始全名／生日不送Gateway；這不是EMR病人對應。

「CDSS 歷史紀錄」按需POST查最近10筆，hasMore表示上限。單筆讀回前核對schema、UUID、病人hash、pack和資料大小；歷史視窗呈現原summary／建議、人工輸入與醫師決策。清楚標示歷史快照／医師身分未驗證；不重新跑當前規則、不回填或寫入當次answer stores。關視窗／切病人會abort，過期回覆不能落入新病人畫面。內容只在記憶體，不另存localStorage或IndexedDB歷史快照，不當HTML執行。

## 建置設定

```dotenv
NEXT_PUBLIC_COLLECTOR_ORIGIN=https://collector.mediprisma.tw
NEXT_PUBLIC_CDSS_ADMISSION=intranet-pilot
```

這是建置時設定，不能只修改變數而不重建。明確pilot模式不取Firebase token，不把缺醫師身份當成不能儲存；Gateway仍須按實際院內CIDR／Origin准入，App site與query不是授權。未設定pilot仍保留原Firebase傳輸路徑，歷史按鈕僅在新pilot設定提供。/app同步workflow只新增讀取此公開variable，未設定GitHub variable或執行發布；HMC workflow／guide原樣保留。

來源origin必須是根HTTPS、或本機HTTP，無帳密／query／fragment。所有傳輸credentials=omit、no-referrer、redirect=error、no-store；patient hash／UUID置於body而非URL。save4MiB、15秒逾時；history讀回最多5MiB、15秒，列表最多10筆。查不到／故障使用固定畫面，不把upstream或病人資料印console。

## 驗證與重現

- Jest：儲存／hash／遮蔽／重試、來源院所、history malformed／錯病人／錯UUID／取消／大小與既有LiveFeature回歸。
- Typecheck、針對修改檔lint、production build。
- 真實Chromium→本機臨時Gateway→本機HAPI/PostgreSQL：人工儲存才送資料，201確認、history／detail相同原snapshot/version1。320/390/430/768/1024/1440與橫向截圖檢查，手機無橫向溢出、控制44px。

需要先完成FHIR初始化，並在Gateway隔離分支啟動其scripts/start-fhir-smoke.ts。然後在本repo執行：

```powershell
node node_modules/@playwright/test/cli.js test --config playwright.fhir.config.ts
```

此設定只跑合成fixture、localhost3007／Gateway28787。預設e2e跳過需真實FHIR的這一項，不借用已運行的devserver。院內驗收及備份還原／>72h由FHIR VM-ACCEPTANCE.md記錄；本機通過不宣稱正式VM可用。

## 可見行為

vghtpe有效CDSS結果新增人工儲存與pilot歷史按鈕，未隱藏現有臨床tab／卡片／控制；其他site不送CDSS臨床資料。來源遍歷僅在按儲存時執行，失敗只回未儲存，不影響主CDSS評估。完整病人正式對應、醫師綁定與EMR寫回繼續延後。
