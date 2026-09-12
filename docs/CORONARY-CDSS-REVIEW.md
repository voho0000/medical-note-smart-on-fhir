# 冠心病 CDSS 分支審閱

分支：`codex/coronary-cdss-hf-style`。主程式基於 `origin/master` 的
`1c17761f`（HF 五區塊看診流程），規則基於 personalization `origin/main`
的 `bd8220d`，並接續既有 `codex/ccd-ship` 的冠心病規則。
兩個原有冠心病工作目錄均保留。

## 本機開啟

```sh
npm run packages:ci
npm run dev:coronary
```

開啟 `http://127.0.0.1:3015/dev/coronary-cdss`。
可切換慢性期、ACS 後、用藥安全、資料缺漏、無冠心病證據及 HF 對照。
更新套件後如曾載入舊版預覽，請重新啟動開發服務；本分支套件已使用獨立的 `-ccd.1` 版本。
預覽頁只在開發模式開放；正式畫面由既有 CDSS 疾病選單進入。
HF 仍為預設，冠心病列於其後。

合成資料是供畫面驗證的 `CdssPatientProfile`，不是 bridge/FHIR 真實資料樣本。
所有日期、年齡、檢驗及處方均為虛構。FHIR 轉換另由規則 repo 的
`coronary-adapter.test.ts` 驗證。

## 畫面與模組對應

| 畫面 | 來源與操作 |
|---|---|
| 核對冠心病 | `coronary-disease-evidence`；證據開關回到 profile，整個 pack 重算 |
| 臨床資訊 | LDL-C、LVEF、血壓、心率、eGFR、K、Hb；日期、資料年齡、過期及缺值分開呈現 |
| 醫療計算機結果 | ASCVD 極高風險分類；可展開共用的醫療計算機輸入，同一份結果供降脂建議引用 |
| 用藥安全警訊 | pack 的 `domain=safety` 且 `status=actionable`，置於治療前 |
| 抗栓治療 | `coronary-antiplatelet-strategy`；aspirin、P2Y12、OAC 為處方狀態，整組有一個判斷 |
| 降脂治療 | `coronary-lipid-lowering`；statin、ezetimibe、PCSK9 為處方狀態，整組有一個判斷 |
| 其餘今日處置 | 所有尚未展示的模組，按 actionable → needs-data → review → no-action 排序；折疊列仍列出模組名稱 |
| 紀錄與追蹤 | 沿用 HF 的處置、原因、備註與加密工作階段儲存；可複製摘要 |

HF 和 CCD 共用數值讀取模型及處置控制項。

計分與風險分類統一由醫療計算機執行。此分支新增 `ascvd-vhr-2023`（AHA/ACC 2023 Table 10），病歷提供逐項證據，計算機統一計數並回傳極高風險／未達條件／資料不足。`ascvdVeryHighRisk` 含計算機版本，CDSS 只讀這個結果；不支援版本或缺資料時不自行重算。醫師輸入依病人加密儲存，醫療計算機列表與 CDSS 內嵌輸入使用同一個元件及儲存。缺病史不當陰性；同一次 ACS 不再計為獨立 MI，持續 LDL-C 升高及最大耐受劑量需另行確認。DAPT／PRECISE-DAPT／ARC-HBR 未在此版實作，沒有對外宣稱其分數。

冠心病畫面不新增臨床門檻、
不根據藥名字串把整組建議分配給單藥，也不自行算停藥日期。
ACS 診斷碼的日期不當成 ACS 住院日期；未取得資料不當成正常。
每個模組可展開原有決策詳情、病人依據、指引與限制。

臨床規則及範圍延續原 CCD pack：慢性冠心病及 ACS 出院後追蹤，
不是急性胸痛處置工具。抗心絞痛選藥、個別劑量、完整出血分數及
部分無法由雲端資料計算的項目，仍依 pack 的使用限制交由臨床判斷。

## 可重現的分支依賴

`vendor/coronary-cdss/` 內含規則與 adapter 的分支套件，版本分別為
`2.1.0-ccd.1` 與 `1.7.0-ccd.1`。`package.json` / lockfile 都指向這兩個檔案，
adapter 使用同一份 care，避免裝到原本只含 HF 的已發佈版本。
這些套件未上傳 npm registry；來源位置與完整性資訊見同目錄 manifest。

## 驗證

- 規則 repo：原整合版 984 個測試、型別、引用索引通過；計算機契約修改後 28 個冠心病測試與型別再次通過；HF/CCD 文件引用核對通過。
- 計算機及串接：155 個測試通過，涵蓋 Table 10 邊界、缺資料、同事件排除、重複 MI、輸入確認與版本契約。
- 主程式：新增冠心病模型、真實規則輸出、門診重算、狀態、展開依據、
  HF 回歸與選單測試；型別檢查、變更檔案 lint、正式建置通過。
- Playwright：320、390、430、640、768、880、1024、1440 px，明暗主題，
  並檢查展開詳情後的手機寬度；沒有頁面橫向溢出。
- 瀏覽器操作：量測重算、證據開關重算、處置重整後保留、不同病人隔離、
  複製摘要、安全／空白／英文／HF 對照均驗證。醫療計算機補填、風險分類更新、加密重整還原與病人隔離亦已驗證。

最終 CDSS 與醫療計算機回歸共 **453 項：440 通過、13 失敗**。這 13 項集中於既有
加密還原的五個套件（clinic vitals、physician decisions、phenotype、
HFpEF inputs、clinic-vitals wiring），已在未修改的 `origin/master`
`1c17761f` 重現同樣 13 項失敗。真實瀏覽器的量測與處置還原測試通過。

```sh
npm run test:e2e:coronary
npx tsc --noEmit
npm run build
npm run check:lockfile
```

Visible behaviour changes: none. 現有頁籤、HF、Beta 與醫院開啟方式均保留。
冠心病作為此獨立分支的新增路徑，尚未合併或部署。
