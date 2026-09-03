# 雲端病歷型癌症壓力測試（v2）

以可見於雲端病歷的資料類別為測試目標：**沒有病程紀錄、没有生命徵象 resources**。大量短 CXR 與較長的 CT／MRI、病理報告共同構成負載。
全部內容由規則從零生成，沒有使用真實病人或示範病歷。這不是實際雲端匯出格式的官方認證，也不是臨床驗證病例。

## 檔案

- `artifacts/synthetic-oncology/synthetic-cloud-oncology-v2-1100000-tokens.fhir.json`
- 同目錄、同檔名的 `.manifest.json` 記錄筆數、估計 token 與 SHA-256。

FHIR R4 collection Bundle，約 **66.4 MB**，共 **27,945 個 resources**。可直接使用 MediPrisma 的 FHIR JSON 匯入功能。
第一版檔案沒有刪除或覆寫；比較時請注意檔名中的 `cloud-oncology-v2`。
`artifacts/` 不會納入 Git 或網站發布，長期保存請備份檔案，亦可用下列指令重建。

## 資料組成

| 類別 | 數量 |
| --- | ---: |
| 合成病人／院所 | 1／3 |
| 住院／門診 Encounter | 96／288 |
| 出院病摘 | 96 |
| 更新的非住院測試文件 | 1 |
| 病程紀錄／生命徵象 | **0／0** |
| CXR | 1,344 |
| CT | 443 |
| MRI | 192 |
| 超音波 | 192 |
| 病理組織報告 | 48 |
| 免疫染色補報 | 48 |
| 外院玻片複閱 | 48 |
| 胸水細胞學報告 | 13 |
| 實驗室 Observation | 24,192 |
| 用藥 MedicationRequest | 768 |

所有影像／病理均為 `DiagnosticReport`，不偽装成病程文件。部分正文放在 `conclusion`，部分為內嵌 `presentedForm` 文字附件；同一份正文不在兩處重複存放。沒有實際影像圖檔或外部附件網址。

CXR 是短報告，帶有重複「無明顯變化」、肺不張、導管位置、低肺容積、少量積液等內容；同類檢查重複使用少數名稱，便於測試 latest-by-name 篩選。短 CXR 每份少於 400 估計 tokens。病理原始報告、免疫染色補報、複閱使用同一個 Specimen 參照，並明確寫明補報或複閱沒有新增切片。

**檢查與就醫頻率為維持百萬 token 壓力刻意放大，不代表一般癌症病人就醫頻率，也不是建議檢查排程。** 臨床文字與檢驗數值為合成模板，不宜用來驗證治療決策。

## Token 驗證

經應用程式匯入解析、解碼並使用實際報告／文件 formatter：

- 影像／病理 context：942,374 estimated tokens。
- 出院病摘與測試文件 context：187,070 estimated tokens。
- 兩者合併：**1,129,445 estimated tokens**。尚未加上檢驗、用藥等其他結構化內容。

這是「全部時間、全部版本、未縮減」的內容，不是 JSON 或 base64 大小換算，也不是 VGHBrain tokenizer 的精確計數。
`1100000` 是產生器針對報告及文件正文設定的估計目標；formatting 的日期、標題等還會增加少量 token。

## 使用

1. 以獨立分頁測試，先關閉自動生成再匯入，不要覆蓋仍需使用的真實病人分頁。
2. 在 AI 資料範圍選「全部資料」。觀察報告全部版本與最新版本的差異，以及文件開關、預覽的效能。
3. VGHBrain 的 100K 病人 context／150K 完整 input 保護仍然生效；不應為了測大資料而繞過上限送出請求。
4. 文件共有 97 份；最新任意文件為 `synthetic-newest-non-discharge`。「最近一次住院」仍應取 `synthetic-discharge-95`。
5. 日期固定為 2018–2026 年。跨版本比較請使用全部日期範圍；相對時間篩選會隨日曆改變。

## 重建與測試

```powershell
node scripts/generate-cloud-oncology-stress-bundle.cjs
$env:TZ = 'Asia/Taipei'
$env:SYNTHETIC_FIXTURE_REPORT = '1'
npx jest --runInBand __tests__/scripts/cloud-oncology-stress-bundle.test.ts --silent=false
```

不需要下載依賴、不連網、不呼叫 AI。相同版本及參數產生相同 JSON；不同內容的既有同名檔案不會被覆寫。
測試涵蓋匯入、無病程與生命徵象、全部 2,328 份報告納入 context、解碼後百萬 token 門檻、最新出院病摘保留，以及所有內部參照解析。未宣稱完整 HL7 validator 認證。
