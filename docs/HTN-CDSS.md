# 高血壓 CDSS 分支

主程式與規則庫皆使用 `codex/hypertension-cdss-complete`。介面基於
`origin/master` 的 `1c17761f`，規則基於 `origin/main` 的 `bd8220d`，接續
`codex/hypertension-on-main` 的高血壓模組與臨床審閱文件。

## 使用

安裝此分支的套件後啟動主程式，於設定開啟 Beta 功能，進入個人化照護指引，
選擇「高血壓」。HF 保留為預設。高血壓沿用既有試辦入口與院內路由規則。

```sh
npm run packages:ci
npm run dev:webpack -- --webpack -p 3018
```

本機合成病例預覽：`http://localhost:3018/dev-htn-preview`。
此預覽只在 development 模式提供，production 回傳 404；兩個病例皆為合成資料。
正式功能透過既有病歷載入與疾病切換器使用。

## 畫面與資料對照

| 畫面 | 規則輸出 |
|---|---|
| 本次看診重點 | 原始狀態計數；安全問題先於其他處置；按鈕開啟對應決策 |
| 病歷已有資料 | 血壓、K、eGFR、Creatinine、Na、定量 UACR；缺值、日期、過期與門診輸入分開呈現 |
| 安全提醒 | 安全領域中需處理、需確認或缺資料的模組；保留原始狀態，嚴重血壓不會因為是 review 而被藏在一般列內 |
| 血壓分類、目標與確認 | 血壓分類、控制目標、量測品質三個模組，各自展開同一份決策詳情 |
| 目前降壓治療 | 治療策略的五類藥物原始證據；判斷屬於整體策略，不複製成各類藥物的判定 |
| 處置／依據 | 其餘模組依可處理、需資料、臨床確認、無需處理排列；收合仍顯示模組名稱 |

所有 16 個模組均可由畫面查閱（條件未觸發而不產生的模組除外）。
共用的數值模型由 `DiseaseBoardConfig` 決定位置；HF 的表型、療程及看診流程仍由 HF 自己的模型決定。

門診血壓沿用既有病人別的加密工作階段保存。套用後重新建立 profile 並重算整個 pack；
清除高血壓表單只撤回收縮壓與舒張壓，不清掉 HF 症狀、體重或其他評估。
規則能讀取沒有 FHIR resource 的門診輸入，不建立虛構 Observation。
分類平均納入一個量測日期，同日重測仍只算一天；門診值不替代 HBPM／ABPM 確認。
證據開關控制納入判定的資料；未知列即使被納入仍為未知，不因此變成陽性或陰性。

## 可重建的分支套件

`vendor/htn/` 封裝兩個尚未發布的 prerelease，並以 `file:` 與 SHA-512 鎖定。
因此安裝此分支會取得 HTN 規則，無須修改全域套件或依賴另一個工作目錄的 symlink。
`vendor/htn/provenance.json` 記錄規則來源提交與檔案雜湊。

規則更新後，先在規則庫完成驗證並提交，再於主程式執行：

```sh
node scripts/sync-htn-packages.mjs /path/to/mediprisma-personalization
npm run packages:ci
```

這個流程不發布套件、不部署網站。正式合併／發布時再依專案發布流程更新版本。

## 驗證

- 規則庫：1,116 項規則及 FHIR 測試、測試型別、109 個引用索引與 3 份來源 PDF 核對。
- 主程式：相關測試 640 項通過（醫療計算機＋CDSS）；HTN 模型、完整詳情、藥物呈現、單筆／同日血壓、嚴重血壓、清除範圍、證據重新計算及試辦路由測試；HF 回歸測試。
- 正式 webpack 建置（含 TypeScript）及修改檔案 lint 通過。
- `scripts/experiments/hypertension-board/verify.mjs`：兩病例 × 8 種寬度、10 項互動檢查通過，涵蓋英文、暗色、詳情、門診血壓及計算機引用；輸出截圖及 `checks.json`。
- 既有加密儲存測試在此環境有 13 項失敗；同一批測試於未修改的 `origin/master`（`1c17761f`）也以相同方式失敗。本分支沒有修改加密儲存實作。

指引與臨床審閱文件位於規則庫的 `docs/htn-module-flowcharts/`，
包含 [2024 ESC](https://www.escardio.org/guidelines/clinical-practice-guidelines/all-esc-practice-guidelines/elevated-blood-pressure-and-hypertension/)、
[2025 AHA/ACC](https://professional.heart.org/en/science-news/2025-high-blood-pressure-guideline/top-things-to-know) 與台灣 2022 指引對照。

## 醫療計算機 → CDSS

`features/medical-calculator/calculators/cardiovascular-risk.ts` 是 PREVENT-CVD、
SCORE2、SCORE2-OP 的唯一公式來源，並已加入一般醫療計算機清單。高血壓畫面
直接使用同一個計算機元件。醫師確認輸入、量測日期及族群適用性後按「引用至高血壓 CDSS」。
結果保存未四捨五入百分比、模型版本、時間、終點、地區及全部輸入來源；CDSS 不解析顯示文字。

引用結果以病人分開、只存在記憶體，不寫入 localStorage 或病歷。重新整理、資料變更、
編輯計算參數或滿 24 小時即需重新引用。新出現已知 CVD 的病歷不接受初級預防結果；
SCORE2 亦不接受病歷已知糖尿病。醫療計算機缺項不當作「否」或零。

- PREVENT-CVD：30–79 歲、無已知 CVD 的基礎 10 年總 CVD 模型（ASCVD＋HF），
  不混用 PREVENT-ASCVD、30 年或 WHO 風險。BMI 用於適用範圍確認，總 CVD 基礎公式本身不含 BMI 係數。
  未包含可選 UACR／HbA1c／SDI 擴充。輸入限值採 AHA quickstart；超出範圍不截斷。
- SCORE2：40–69 歲、無已知 CVD 與糖尿病；SCORE2-OP：70–89 歲、無已知 CVD，含糖尿病變項。
  明確指定四個歐洲風險地區，不替台灣推定地區。介面只接受 SBP 100–200、TC 3–8、HDL 0.7–2.5 mmol/L 的保守輸入範圍。
- CDSS facts：`preventCvdRisk10y`、`score2Risk10y`、`score2OpRisk10y`；
  `numericValue` 為百分比，`unit='%'`，`calculator` 包含模型 ID、版本、完整狀態、10 年終點與日期。
  規則庫只檢查契約並比較指引門檻；PREVENT ≥7.5% 只影響 AHA，SCORE2／OP ≥10% 只影響 ESC。
  低於某一分數門檻不能否定其他高風險條件；ESC 的三個月生活型態仍需醫師確認。

公式來源（核對日 2026-09-12）：

1. Khan et al., Circulation 2024;149:430–449，doi:10.1161/CIRCULATIONAHA.123.067626。
   [CDC KDSS 的公開 PREVENT-CVD 方程式](https://wwwn.cdc.gov/KDSS/detail.aspx?Qnum=Q811&topic=1)
   提供基礎模型全部係數；本分支自行實作公開方程式，未匯入 AHA 授權程式碼。
   [AHA Quickstart](https://professional.heart.org/en/-/media/PHD-Files/Guidelines-and-Statements/PREVENT/PREVENT-Equations-Quickstart-Guide.pdf) 提供適用年齡及輸入範圍。
2. [SCORE2 作者四位小數係數與校準表](https://academic.oup.com/eurheartj/article/43/3/241/6433491)，Table 1。
3. [SCORE2-OP 原始論文](https://doi.org/10.1093/eurheartj/ehab312) 官方補充檔
   `Supplementary material_20210604_v2.docx`，Methods Tables 1–3。
   採 Table 1 地區校準；Table 3 範例使用不同校準值，且線性預測值一行的正負號有不一致，
   因此測試使用其輸入與四位小數係數，套 Table 1 校準，不抄錄不一致的最終範例百分比。
   此差異保留在文件供臨床審閱；沒有改成其他網站的分數。
