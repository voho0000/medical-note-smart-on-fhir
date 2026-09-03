# 完全合成癌症病人：百萬 token 壓力測試

**此為保留的 v1（含病程紀錄）。雲端病歷測試請改用 [v2 報告型資料](synthetic-cloud-oncology-stress.md)，已移除病程與生命徵象。**

這份資料由規則從零產生，**沒有讀取真實病人、去識別病歷或專案示範病人**。
病人、院所、醫師與識別碼都明確標示為合成測試資料。
這是刻意增加就醫密度的軟體負載測試病例，含重複病歷模板；不適合用來評估臨床推理正確性、制定治療或代表真實醫療利用率。

## 產物與大小

執行產生器後，檔案位於專案根目錄下：

- `artifacts/synthetic-oncology/synthetic-oncology-1250000-tokens.fhir.json`：FHIR R4 `collection` Bundle，可從 MediPrisma 匯入 FHIR JSON。
- `artifacts/synthetic-oncology/synthetic-oncology-1250000-tokens.manifest.json`：筆數、估計 token、SHA-256、限制與參照檢查結果。

預設 JSON 約 **65.7 MB**，共 **27,656** 個 resources；未壓縮的 JSON 是為了方便直接匯入。
`artifacts/` 已被專案忽略，不會隨網站發布；需要保存原始檔時請自行備份，或使用下列指令重建。

| 類別 | 數量 |
| --- | ---: |
| 合成病人 | 1 |
| 合成院所 | 3 |
| 住院／門診 Encounter | 96／288 |
| 出院病摘 | 96 |
| 病程紀錄 | 563 |
| 更新的非住院文件 | 1 |
| 檢驗／生命徵象 Observation | 25,536 |
| 影像文字報告 DiagnosticReport | 192 |
| MedicationRequest | 768 |
| Procedure | 96 |

660 份文件混用 Composition 與內嵌 UTF-8 HTML/base64 的 DocumentReference，可測試兩條文件解析路徑。沒有外部附件、真實照片、有效身分證號或實際聯絡資料。

## Token 定義

預設檔名中的 `1250000` 是**文件正文的最低估計目標**，不是總 JSON、base64 或模型輸入上限。
驗證使用應用程式的 `LocalBundleService.parse`、`listClinicalDocuments`、`formatDocumentsSection` 與 `estimateTokens`。

在全部文件、沒有文字截短的情況下，文件 context 本身為 **1,285,021 estimated tokens**；共有 660 對 BEGIN/END 文件界線，沒有中段省略標記。其他結構化病歷還會增加內容量。

這是 MediPrisma 現行中英文比例估算法，**不是 VGHBrain 或其他模型 tokenizer 的精確計數**。若需要模型精確門檻，必須另用該模型 tokenizer 驗證。

## 測試方式

1. 建議開獨立測試分頁，先關閉「自動產生」，再匯入 JSON。不要在仍需保留的真實病人分頁上直接替換資料。
2. 在「AI 資料範圍」選擇「全部資料」，以確保日期、檢驗深度及文件沒有先被手動篩掉。大量文件和檢驗可能使首次載入較久。
3. 測試文件開關、全部／最近一次住院／最近三次住院／自選，以及預覽。
4. VGHBrain 仍應套用現有 **病人 context 100K、完整 input 150K** 政策。畫面顯示縮減後小於 100K，不表示這份原始資料沒有超過 1M；不要為了看到百萬 token 而繞過保護直接送出。
5. 「最近一次住院」應選 `synthetic-discharge-95`，其全文遠小於 100K。最新任意文件則是 `synthetic-newest-non-discharge`，刻意不屬於出院病摘。
6. 依「院所＋第一個 ICD」去重時，96 份出院病摘應保留 24 份；病程與其他非出院文件不屬於這個去重規則，因此這個模式仍可能很大。

資料時間固定為 2018 年至 2026 年，截點為 2026-09-03。日後使用「最近三個月」等相對日期篩選時，數量自然會變少；做跨版本負載比較請使用全部時間範圍。

## 重建與驗證

在專案根目錄執行，不需要新增套件、不需連網、不呼叫 AI：

```powershell
node scripts/generate-oncology-stress-bundle.cjs
$env:TZ = 'Asia/Taipei'
$env:SYNTHETIC_FIXTURE_REPORT = '1'
npx jest --runInBand __tests__/scripts/oncology-stress-bundle.test.ts
```

提高到至少 200 萬估計文件正文 tokens，可另外產生不同檔名：

```powershell
node scripts/generate-oncology-stress-bundle.cjs 2000000
```

固定規則與日期確保同版本、同參數產生相同內容。既有同名 JSON 若內容不同，產生器會拒絕覆寫，請先保留舊版再處理。

測試涵蓋唯一資源 ID、FHIR ID 格式、單一病人、81,854 個內部參照解析、應用程式匯入、解碼後 token 門檻，以及文件選取回歸。**沒有宣稱已通過完整 HL7 FHIR validator 或臨床語意驗證。**
