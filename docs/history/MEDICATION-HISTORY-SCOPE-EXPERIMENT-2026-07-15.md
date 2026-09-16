# AI 醫療摘要歷史用藥資料範圍 A/B 實驗 — 2026-07-15

> **狀態：完成。** 本輪使用已回退至 Git HEAD 的目前公開版 synthetic demo，完成 3 個模型、2 個資料臂、每臂 3 次，共 18 次摘要。正式醫療摘要流程尚未修改。

## 結論

**不建議採用本輪 `episode_index` prototype。**

在目前公開版資料量下，episode 表示沒有省 token，反而令完整 prompt 增加 **8.5%**；三個模型的現用藥可稽核引用召回率都下降，模型平均由 **87.9% 降至 71.9%（−16.0 個百分點）**。兩臂在「純歷史藥誤列現用、無效引用、同藥拆成多列」等安全指標都維持良好，因此 episode 沒有提供足以抵銷 token 與召回退步的安全收益。

目前最合理的下一個候選不是把 current／recent／history 全部 episode 化，而是：

1. 現用藥維持目前精簡、可分組的 authoritative list；
2. 只壓縮 older history；
3. 只有當 MedicationRequest／SOURCE LIST 超過預先設定的 token 門檻才啟用；
4. 另做一次單一變因實驗後，才決定是否進 production。

## 試用資料回退確認

依使用者要求，本輪開始前已將這次「以完整病人資料重建 demo」的變更精準回退到 Git 目前公開版：

- `public/demo/demo-bundle.json`
- `scripts/build-demo-bundle.mjs`
- `e2e/tests/demo-data.spec.ts`
- `__tests__/core/use-cases/generate-medical-summary.test.ts`
- 刪除本次新增的 `__tests__/infrastructure/demo/demo-bundle.test.ts`

回退後上述四個 tracked files 對 HEAD 的 diff 為零；其他同時進行中的檢驗名稱／報告 UI 工作未被改動。

公開版 fixture：

- Bundle SHA-256：`7bf6f2738015a5db6780f6304ef62df5ecc32c61fde6f813be0152202221825d`
- Resources：407
- MedicationRequest：105
- 不同健保藥碼／fallback 名稱：61 種
- 評估日仍有有效供藥：17 種產品、18 筆紀錄
- Patient demo name：`陳○明`
- JPG attachments：23 筆，且 23 筆皆保有 `data` 或 `url`

先前針對 777 筆完整資料做的本機 token dry-run 已由本輪回退取代，不納入本報告決策。

## 研究問題與固定條件

研究問題：醫療摘要選取全部歷史用藥時，將逐筆 MedicationRequest 改為健保藥碼層級的 product／episode index，是否能減少 token，並維持或改善 `medicationReview` 的正確性與可稽核性？

固定條件：

- 其他病歷、文件、檢驗、就醫 chronology、system prompt、schema 與 app finalizer 均相同。
- 模型：`gemini-3.1-flash-lite`、`gemini-3-flash-preview`、`gpt-5.4-nano`。
- 每個模型每臂 3 次，依 repetition 交錯 arm 順序。
- 評估基準日：2026-07-15（Asia/Taipei）。
- 模型輸出以真實醫療摘要 schema parse，再執行 app 的 `finalizeResult`。
- 主要品質指標使用 raw AI `medicationReview.regimen` 的 M-key，測量模型本身產生的可稽核現用藥覆蓋；不以 finalizer 後補的項目替模型加分。

## 兩個資料臂

### A：`production_all_history`

使用目前 production medication hook，設定：

- `medicationStatus = all`
- `medicationTimeRange = all`

105 筆 MedicationRequest 全部進入 SOURCE LIST。

### B：`episode_index`

- 以健保藥碼識別相同產品；無藥碼時才 fallback 到正規化名稱。
- 每種產品列出 records、current records、首次／最近日期、最近供藥截止日、慢箋筆數、episode 數、歷史最大 gap 與機構角色。
- 間隔超過 7 天形成新 episode。
- 現用紀錄全部保留為可引用來源；歷史產品保留 earliest/latest 代表來源。
- SOURCE LIST 的 Medication entries 由 105 降為 83。
- 原始 FHIR 不刪除，只改送給摘要模型的文字與可引用來源。

## Token 結果

token 以專案現有 `estimateTokens`／`estimateMessagesTokens` 估算，不是 provider billing usage。

| 指標 | 修改前 | episode index | 差值 | 相對變化 |
|---|---:|---:|---:|---:|
| standalone medication section | 3,375 | 5,652 | +2,277 | **+67.5%** |
| Medication SOURCE LIST entries | 105 | 83 | −22 | −21.0% |
| 完整 SOURCE LIST tokens | 4,297 | 3,788 | −509 | −11.8% |
| clinical context tokens | 10,436 | 12,713 | +2,277 | +21.8% |
| user prompt tokens | 14,755 | 16,524 | +1,769 | +12.0% |
| system + user 完整 prompt | **20,914** | **22,683** | **+1,769** | **+8.5%** |

原因很直接：公開版只有 105 筆處方，逐筆 SOURCE LIST 原本就不大；episode index 為 61 種產品加入大量 records／dates／gap／organization metadata，新增 2,277 tokens，只省下 509 catalog tokens，淨結果反而變大。

## 模型表現

### 主要結果

`current cited` 是每個成功回答中，17 種現用產品有多少種被 raw regimen 的有效 M-key 覆蓋。`direct-current precision` 是 regimen 所引用的 Medication records 中，直接落在有效供藥窗內的比例。

| 模型 | 臂 | 首次生成可 parse | 現用藥引用召回 | direct-current precision | 歷史藥誤列現用 | 無效 M-key |
|---|---|---:|---:|---:|---:|---:|
| Gemini 3.1 Flash-Lite | 修改前 | 3/3 | **84.3%** | 97.6% | 0 | 0 |
| Gemini 3.1 Flash-Lite | episode | 3/3 | 72.5% | 97.4% | 0 | 0 |
| Gemini 3 Flash Preview | 修改前 | 2/3 | **94.1%** | 100% | 0 | 0 |
| Gemini 3 Flash Preview | episode | 3/3 | 90.2% | 100% | 0 | 0 |
| GPT-5.4 Nano | 修改前 | 2/3 | **85.3%** | **100%** | 0 | 0 |
| GPT-5.4 Nano | episode | 2/3 | 52.9% | 93.8% | 0 | 0 |

三個模型方向一致：

- Flash-Lite：episode −11.8 pp
- Flash Preview：episode −3.9 pp
- GPT Nano：episode −32.4 pp
- 三模型等權平均：87.9% → 71.9%，episode **−16.0 pp**

以同一 repetition 且兩臂都成功的 7 組配對看：修改前較高 4 組、相同 2 組、episode 較高 1 組。樣本仍小，這不是一般化統計推論，但沒有支持 episode 優於現行格式的訊號。

### 逐次結果

| 模型 | rep | 修改前 cited | episode cited | 備註 |
|---|---:|---:|---:|---|
| Flash-Lite | 1 | 13/17 | 9/17 | 修改前較完整 |
| Flash-Lite | 2 | 17/17 | 12/17 | 修改前全覆蓋 |
| Flash-Lite | 3 | 13/17 | 16/17 | 唯一 episode 明顯勝出配對 |
| Flash Preview | 1 | 15/17 | 15/17 | 相同 |
| Flash Preview | 2 | parse fail | 14/17 | 修改前輸出 `sig:null` |
| Flash Preview | 3 | 17/17 | 17/17 | 相同、皆全覆蓋 |
| GPT Nano | 1 | 14/17 | 10/17 | 修改前較完整 |
| GPT Nano | 2 | parse fail | parse fail | 兩臂皆輸出 `sig:null` |
| GPT Nano | 3 | 15/17 | 8/17 | episode 僅覆蓋不到一半 |

## 安全與資料忠實度指標

所有成功輸出合計：

- 純歷史 identity 被列入 current regimen：兩臂都是 0。
- 同一 identity 被拆進多個 regimen rows：兩臂都是 0。
- 不存在的 SOURCE LIST key：兩臂都是 0。
- `URETROPIC`、`SIGMART`、`CRESTOR`、`Pradaxa` 被復活為 current regimen：兩臂都是 0。
- raw output 把調劑算式改寫為 SIG：修改前 1 item，episode 5 items；全部由 app finalizer 移除後才不會顯示。

因此兩臂的基本防幻覺表現都不差，但 episode 並沒有在主要安全指標上比現行格式更好，且 raw SIG 品質較差。

## Error analysis

### 1. Episode 格式誘導「一藥一列」，撞上 regimen 8 列上限

這是召回下降最清楚的失敗機制。episode context 對每種產品各列一長行；GPT Nano 常照著輸出一藥一個 regimen item。schema 最多保留 8 個 regimen items，所以前 8 種藥佔滿後，青光眼、泌尿或呼吸道等其他現用藥即使出現在 overview，也沒有可稽核 regimen citation。

最明顯例子是 GPT Nano rep 3：episode 臂用 8 列分別列 Forxiga、Eltroxin、Feburic、Folacin 及 4 種胃腸藥，只覆蓋 8/17；修改前會把同治療領域藥物合併，覆蓋 15/17。

### 2. 歷史 gap metadata 容易被誤讀成當前供藥缺口

GPT Nano 的 episode 成功輸出兩次都把 Folacin 先前一筆 2026-06-29 結束的紀錄描述成 supply gap，但同一 context 已有供藥至 2026-07-22 的現行紀錄。這是 episode 把歷史 gap 與 current state 放在同一產品列後造成的注意力競爭。

### 3. Episode 沒有改善藥局角色理解

自動 regex 曾把修改前的正確句子「醫院開立、藥局調劑」誤計為 pharmacy-as-prescriber，故未採用該 regex 數字作正式結論。人工複核發現：修改前 Flash-Lite 三次都能區分開立與調劑；episode Flash-Lite 有一次 overview 把藥局列為「處方來源」。episode metadata 雖明寫 `dispensing pharmacy; not prescriber`，仍未形成穩定優勢。

### 4. 臨床推論錯誤兩臂皆存在，episode 另出現藥名辨識錯誤

- GPT Nano episode 曾把 ACTEIN 600mg 誤寫成「乙醯胺酚?」，實際為 acetylcysteine 類化痰藥。
- Flash Preview 兩臂都曾產生 guideline-completeness 類待確認事項，例如未見 ACEi/ARB、beta blocker、statin 或抗凝治療；這違反 prompt 對 medication reconciliation 的限制，不能歸因於單一 arm，但說明仍需 app-side guard。
- Episode 較常把時間相近的 Detrusitol／Imimine 寫成「已替換」；部分回答有使用「可能／待確認」，但原始紀錄並沒有明示替換關係。

### 5. Schema failure 不是穩定的 arm 效果

Flash Preview 修改前一次、GPT Nano 兩臂各一次輸出 `medicationReview.regimen[].sig = null`，而 schema 要求 string 或省略，導致首次 parse 失敗。正式 app 對 parse failure 會再試一次；本實驗表格記錄的是第一次生成結果，沒有把失敗重送後的答案混入原本 3 repetitions。因此 parse success 只能視為格式相容性的觀察，不能宣稱 episode 已改善可靠度。

## Latency（探索性）

平均 wall-clock latency，包含 parse 失敗的生成：

| 模型 | 修改前 | episode |
|---|---:|---:|
| Gemini 3.1 Flash-Lite | 8.3 s | 8.2 s |
| Gemini 3 Flash Preview | 40.0 s | 35.0 s |
| GPT-5.4 Nano | 28.0 s | 26.2 s |

episode 雖 prompt 較長，實測 latency 反而略短，但 n=3、provider load 與輸出長度變異很大，不能把這個差異當成格式收益。

## 決策

本輪 decision gate：

- Token 應下降：**未通過**（+8.5%）。
- 現用藥引用召回不得明顯下降：**未通過**（三模型平均 −16.0 pp）。
- 不得增加不可接受的臨床錯誤：**未證明通過**（歷史 gap 誤讀、ACTEIN 誤辨識、更多 arithmetic SIG）。
- 歷史藥復活與 citation validity：通過，但兩臂同樣通過。

因此：**維持現行 production，不套用 episode_index prototype。**

若要繼續研究，下一個單一變因應是 `current baseline + compressed older history`：

- current section 完全不改；
- recent 90 天保留目前資料；
- 只有 older history 改成精簡 episode capsule；
- 不把 `longest_historical_gap` 放在 current product 行；
- 依 MedicationRequest 數量或預估 tokens 動態啟用，而非所有病人一律使用；
- source catalog 只壓縮 older refill events。

這個 hybrid 必須另跑 A/B，不能把本輪失敗的 episode prototype直接改進 production。

## 實驗產物

實驗 runner：`scripts/experiments/medication-history-scope-eval/main.tsx`

Opt-in TypeScript runner：`__tests__/experiments/medication-history-scope-eval.test.tsx`

Raw outputs 與個別報告位於 gitignored：

- `scripts/experiments/medication-history-scope-eval/results/runs-2026-07-14T18-12-44-948Z.jsonl`
- `scripts/experiments/medication-history-scope-eval/results/runs-2026-07-14T18-13-44-246Z.jsonl`
- `scripts/experiments/medication-history-scope-eval/results/runs-2026-07-14T18-17-41-937Z.jsonl`

本文件只保存可 review 的聚合結果與去識別化例子；不把 raw model outputs 納入 git。

## 限制

- 單一 public synthetic patient、每臂每模型僅 3 次。
- Provider 模型可能隨服務更新；跨日期不可直接視為同一權重版本。
- 主要 recall 是 M-key citation coverage，不等於所有臨床敘事品質。
- Episode prototype 是本輪具體格式；結果不能外推成「所有歷史壓縮都不好」。
- 首次 parse failure 沒有執行 production 的一次 retry，故不作 app-level 最終成功率推論。
