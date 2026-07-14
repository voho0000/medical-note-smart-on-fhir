# 檢驗格式 A/B 實驗:樞紐表 (pivot) vs 趨勢行 (trend) — 2026-07-12

> **文件性質：實驗與實作決策紀錄。** 實驗數字與結論保持原樣，不應被解讀為每個新模型／新資料集都會得到相同結果。v0.40.0 的 production 路徑以 `src/application/hooks/clinical-context/formatters.ts`、各 clinical-context hooks、`lab-normalize.ts`、`lab-pivot.utils.ts` 與 coverage manifest 為準；相關回歸測試位於 `__tests__/application/hooks/clinical-context/` 與 lab utility tests。最後核對：2026-07-14。

**研究問題**:AI context 的檢驗段,改用匯出 tab 的「日期×項目 markdown 樞紐表」是否比現行「per-analyte 趨勢行」讓模型答得更準、引用更可靠、token 更省?

**結論(預先登記門檻 +10pp,實測 +20pp → 達標)**:**pivot 全面勝出**——core 題全對率 65% vs 45%、引用有效率 77% vs 53%、幻覺 0.26 vs 1.08/題、token 0.53–0.83×;三個模型方向一致,資料越密差距越大(ICU 型病人 trend 全對率崩至 8%)。唯二例外:單項目趨勢判讀 (T3) 與找極值 (T4) trend 仍小勝 → 建議 pivot 為主、可留 trend 作為輔助選項。

---

## 方法

- **腳本**:`scripts/experiments/lab-format-eval/main.ts`(`npx tsx … --dry-run` 可零 API 重現資料面)。
- **資料**:4 位 NHI-FHIR-Bridge golden fixtures 真實病人(P12074 稀疏 31 點 / F22154 單點型 68 點 / M20047 密集 580 點 / H12113 ICU 型 1156 點),經 app 同一套 `FhirMapper` 映射。
- **兩臂唯一差異=檢驗段格式**(instruction/題目全同,強制要求「日期+數值」引用):
  - `trend`=production 現行 `lab-reports.category`(version=all、window=all、16 點/項)。
  - `pivot`=`buildLabPivots`(累積報告/IPS markdown 同源)渲染成分類樞紐表,異常旗標走 `isObservationAbnormal`。
- **題目與 gold 全部由資料確定性生成**(8 模板 × 4 病人 = 26 題):T1 單點、T2 當日異常、T3 趨勢首末、T4 最低值、T5 同日 panel、T6 深歷史(⚠trend 16 點截斷的涵蓋差,分開統計)、T7 不存在誘餌、T8 筆數。
- **模型**:gemini-3-flash-preview(app 預設)、gpt-5.4-nano、claude-haiku-4-5 — 走 **app 自己的 Firebase 代理**(匿名 session,每 model×arm 一個,26 呼叫 < 匿名 50/日額度),不需 provider key。156 呼叫,0 錯誤。
- **評分**:確定性比對(答案抽數值+日期對 gold 與來源點集;引用有效=答案中每個數值都能在來源找到)。抽樣人工稽核確認判定合理(見下)。

## 結果

### 總表(core 題 n=66/臂;coverage 題 n=12/臂)

| slice | arm | 平均正確(0-2) | 全對率 | 引用有效率 | 幻覺/題 |
|---|---|---|---|---|---|
| core | **pivot** | **1.47** | **65%** | **77%** | **0.26** |
| core | trend | 1.23 | 45% | 53% | 1.08 |
| coverage(深歷史) | **pivot** | **1.17** | **50%** | 58% | 2.08 |
| coverage(深歷史) | trend | 0.33 | 17% | 42% | 2.17 |

三模型無一反轉(core 全對率):haiku 64%/36%、gemini 68%/50%、nano 64%/50%。

### 按病人(全部題)

| 病人 | 輪廓 | trend 全對 | pivot 全對 | trend 引用 | pivot 引用 |
|---|---|---|---|---|---|
| P12074 | 稀疏 | 75% | **100%** | 75% | 83% |
| F22154 | 單點型 | 56% | 56% | 50% | 61% |
| M20047 | 密集 | 46% | **62%** | 71% | **88%** |
| H12113 | ICU 型 | **8%** | **50%** | 21% | **67%** |

→ **資料越密,trend 崩得越厲害**;pivot 的優勢正好出現在最需要它的病人身上。

### 按題型(平均正確)

| 題型 | trend | pivot | 贏家 |
|---|---|---|---|
| T1 單點查值 | 1.33 | **2.00** | pivot |
| T2 當日異常 | 1.33 | **1.67** | pivot(異常旗標 source-faithful) |
| T3 趨勢首末 | **1.17** | 1.00 | trend(它的主軸) |
| T4 最低值 | **1.11** | 0.67 | trend(pivot 欄向掃描較難) |
| T5 同日 panel | 0.75 | **1.58** | pivot(代表案例:trend 臂答「資料中沒有」,值明明在) |
| T6 深歷史 | 0.33 | **1.67** | pivot(trend 16 點截斷) |
| T7 不存在誘餌 | 1.50 | 1.50 | 平手 |
| T8 筆數 | 0.92 | **1.17** | pivot |

### Token(dry-run,確定性)

pivot/trend = 0.83×(稀疏)→ **0.53×**(密集)。日期一天只寫一次,越密省越多。

## 已知限制

- proxy 對 flash 系列強制 temperature=1(app 真實行為),單次取樣、未跑多 rep;但 +20pp 差距遠超取樣噪音等級,且跨三模型方向一致。
- T8 筆數題的「總數」本身不在來源點集,確定性評分會把它記為幻覺 → coverage 切片的幻覺數兩臂皆偏高(同向偏誤,不影響臂間比較)。
- T6/T8 的涵蓋差(trend 截 16 點)是**刻意度量的真實格式差**,已與 core 分開統計。
- 評分為確定性字串/數值比對;已抽樣人工稽核 T2/T5/T6 關鍵判定無誤判。

## 建議 → 實作(同日 2026-07-12,建議 1+2 已落地)

1. ✅ **AI context 檢驗段(labReportVersion='all')已換成 pivot 樞紐渲染**:`buildLabPivots` 純函式搬到 `src/shared/utils/lab-pivot.utils.ts`(hook 檔轉出口,零呼叫端變動),`lab-reports.category.ts` full-history 模式輸出各 panel 的日期×項目表(異常旗標=共用 `isObservationAbnormal`+單位正規化,與累積報告同源)。每張表為單一多行 item,避免 section formatter 的 bullet 前綴破壞表格。
2. ✅ **重點趨勢附錄**:表格後附「Key trends」——有異常值的分析物(≤8 條,深度=labTrendPoints),補 T3/T4。未分類分析物退回原趨勢行(「Other results」),資料零流失;'latest' 模式不變;視窗/保底/panel 子選取全部照舊。
3. 未做 layout filter(直接切換,靠 git 回退)。

**實測 token(全時間+16 點,vs 舊 trend 渲染)**:M20047 密集 2212 vs 3038(**−27%**)、P12074 稀疏持平、H12113 極端 ICU 4796 vs 4576(+5%,但換得全史+重點趨勢;舊格式每項截 16 點)。瀏覽器驗證:demo 病人預覽 tab 正確顯示 cbc/coag/chem 樞紐與 Key trends,異常旗標 H/L 正常。單元測試 2052 全綠(新增 pivot 渲染 3 例)。

## Artifacts

- 原始逐題結果:`scripts/experiments/lab-format-eval/results/runs-*.jsonl`(gitignored,含病人資料)
- 兩臂 context 樣本:`results/<pid>.{trend,pivot}.md`;題目+gold:`results/<pid>.questions.json`
- 彙總:`results/summary-*.md`;完整 log:`results/full-run.log`

---

# 延伸實驗：整份 AI clinical context 是否好讀？— 2026-07-13

## 結論

**目前格式是「AI 讀得到」，但還不是「AI-ready export」。** 已經做對的部分很多：Encounter 下綁 ICD／用藥、同日不同 Encounter 沒合併、就診 ICD 明示為申報證據、lab pivot 也有上面的跨模型實驗支持。現在的主要限制已不是 lab，而是輸出缺少一層穩定的 document schema：沒有語意 heading／來源 handle／資料涵蓋 manifest，空 section 被直接消失，全文 Documents 又佔了 60% context，讓「沒有資料」「未勾選」「被截斷」容易混在一起。

建議不要退回 IPS 顆粒度，也不要刪掉 Encounter；應建立獨立的 **AI Clinical Context Markdown**。Lab 保留 pivot，外面補上 coverage／provenance／document boundary。

## 本次材料與方法

- 輸入：使用者提供的去識別化 demo clinical-context 預覽，800 行、約 10,842 tokens（app 既有 estimator）。
- 段落 token 分布：Documents **60.0%**、Visits 16.5%、Labs 12.1%、Imaging 6.4%，其他合計約 5%。因此問題不是 120k+ context window 放不下，而是高價值結構化事實在全文文件中所占注意力比例偏低。
- 三個 representation arms（臨床事實完全相同）：
  - `current`：目前複製出的原文。
  - `markdown`：真正的 Markdown headings、合法 tables、Visit／Lab panel／Imaging／Document handles，以及 `<clinical_document>` 邊界。
  - `manifest`：`markdown` 再加資料涵蓋、截斷與證據解讀規則。
- 重現腳本：`scripts/experiments/clinical-context-format-eval/main.mjs --input <pasted-text.txt> --dry-run`。
- 原始三臂與離線彙總寫入 `scripts/experiments/clinical-context-format-eval/results/`（gitignored；不提交病歷文字）。
- 離線 audit 後，使用者明確同意將此去識別化 demo context 傳至既有 Firebase/Gemini proxy；遂以 app 的 `gemini-3.1-flash-lite` 完成 **9 題 × 3 arms × 3 repetitions = 81 次呼叫**。Flash-Lite 經 proxy 採 production 行為（temperature=1）。
- 評分先走 deterministic rubric，再逐題人工稽核。稽核修正一個否定句 false positive（「無法證明沒有過敏」被舊 regex 誤記為宣稱無過敏），並補抓兩個原 grader 漏掉的錯誤引用／處置混淆；原始與 regraded JSONL 都留在 gitignored results。
- 本輪三次 repetition 都以固定的 `current → markdown → manifest` 順序呼叫，沒有 seed 控制。這是重要限制：結果可用來找重複錯誤型態，但仍是描述性證據；下一版應把 arm 順序隨機化或 counterbalance。

## 離線 representation audit

| arm | 約略 tokens | 語意 headings | 合法 GFM tables | 穩定來源 handles | 明確 document boundaries | 明示 missing ≠ none | Documents token 比例 |
|---|---:|---:|---:|---:|---:|---|---:|
| current | 10,842 | 0 | 8 | 0 | 0 | 否 | 60% |
| markdown | 10,954（+1.0%） | 36 | 8 | 28 | 2 | 否 | 60% |
| manifest | 11,279（+4.0%） | 37 | 8 | 28 | 2 | **是** | 58% |

## Gemini 3.1 Flash-Lite 實測（9 題 × 3 arms × 3 repetitions）

| arm | 總分 | 平均正確（0–2） | 全對率 | 禁止性 assertion | 約略 context tokens |
|---|---:|---:|---:|---:|---:|
| **current** | **51/54（94.4%）** | **1.89** | **24/27（88.9%）** | **0** | **10,842** |
| markdown | 45/54（83.3%） | 1.67 | 18/27（66.7%） | 5 | 10,954 |
| manifest | 50/54（92.6%） | 1.85 | 23/27（85.2%） | 2 | 11,279 |

> 「全對率」以每一題、每一次生成為單位；27 = 9 題 × 3 repetitions。三輪只有同一個病人，不能把 27 當成 27 個獨立病人做一般化推論。

### 各 repetition 結果

| repetition | current | markdown | manifest |
|---|---:|---:|---:|
| 1 | 2.00；9/9；0 禁止錯誤 | 1.67；6/9；2 禁止錯誤 | 1.89；8/9；1 禁止錯誤 |
| 2 | 1.78；7/9；0 禁止錯誤 | 1.78；7/9；1 禁止錯誤 | 1.89；8/9；0 禁止錯誤 |
| 3 | 1.89；8/9；0 禁止錯誤 | 1.56；5/9；2 禁止錯誤 | 1.78；7/9；1 禁止錯誤 |

### 逐題錯誤型態

- `current`：T4 三次都正確區分「fiberscopy 已做」與「bronchoscopy 僅建議、家屬猶豫」。失分來自 T3 一次漏答必要欄位、T7 兩次沒有完整說明 missing section 的限制，三輪都沒有禁止性 assertion。
- `markdown`：
  - T4 **3/3 次**把原文「fiberscopy 看見 blood-tinged sputum；另建議 bronchoscopy、家屬猶豫」混成「支氣管鏡已做並發現血痰」。這是最穩定的失敗訊號。
  - T3 三輪只有一次全對，另兩次把 `[VISIT-03]` 的 2026-07-01 寫成 2026-07-02；handle 讓這個錯誤引用可以被確定性抓出。
  - T6 三輪只有一次完整引用「3 rows omitted」，另兩次雖知道 18 不是可靠 unique-drug count，但證據不完整。
  - T7 與其他 arms 一樣有兩次只答到部分 rubric。
- `manifest`：T6 **3/3 次全對**，顯示把 `reported count 18; 3 rows omitted` 放進 coverage manifest 對截斷推理有一致幫助；但 T4 仍有 **2/3 次**把 fiberscopy 與未做的 bronchoscopy 混為同一處置。

### 怎麼解讀

1. **不能下結論說「Markdown 讓模型過度相信」。** Markdown 是 representation，不是信念開關；三臂保留相同臨床原文。能說的是：在這個案例與 prompt 下，加入 headings／handles／document tags 的 representation 與較多 T3、T4 錯誤同時出現。可能原因包括 temperature=1 的隨機波動、標題造成注意力與 token 位置改變、模型把整份 document 壓縮時仍無法區分 performed／recommended，以及固定 arm 順序的實驗混淆。三輪重複使 T4 訊號值得追查，但還不是「Markdown 語法造成幻覺」的因果證明。
2. **本次沒有證據顯示「只換成 semantic Markdown」會提升 factual QA。** 三輪 aggregate 中 current 為 51/54，markdown 為 45/54；但仍只有單一病人、單一模型，不能外推成 current 永遠較佳。
3. **Manifest 對 truncation 的價值有被重複實測到。** T6 在 manifest 3/3 次全對；純 markdown 只有 1/3 次完整回答。另一方面，公平實驗的共同 system prompt 已寫「不可把缺席 section 當陰性」，會縮小 manifest 在真實 copy-to-own-AI 情境可能帶來的優勢；export 仍應把 missing ≠ none 規則內嵌。
4. **Document tags 只解決邊界，不解決事件語意。** `<clinical_document>` 無法阻止模型把相鄰的「已執行檢查」與「建議但未執行檢查」合併。下一個高價值實驗不是再換符號，而是 deterministic document capsule：明確輸出 `performed`、`findings`、`recommended`、`declined_or_not_performed`、`follow_up`。
5. **Handles 的第一價值是 auditability，不保證模型變準。** `[VISIT-03]` 讓日期錯配可以自動驗出；current 的自然語言來源標籤較難做機器驗證。產品應保留 handles，但不要宣稱它單獨提升正確率。

## T4 單一變因追查：Current 為何曾勝過 Semantic？— 2026-07-13

原本三輪的 T4 是 `current 3/3 正確、semantic 0/3 正確`，但 `semantic` 同時加入 heading、handle、document tag、table／空白調整，不能歸因給 Markdown。新增 `ablation-t4.mjs`，以同一題、同一完整 context 拆成原子 arms，並輪替執行順序：root／section／visit／lab／document headings、各類 handles、document tags、空白調整，以及完整 semantic。另放入兩個 Current control；`table_fix_only` 在本案例也恰好與 Current byte-identical，三者可估計同 prompt 的生成波動。

### 主要結果

1. **原本的 Current 優勢沒有重現。** Gemini ablation 在每日 quota 前取得 52 筆有效回覆。三個 byte-identical Current prompts 合計有 **3/7** 次 fiberscopy／bronchoscopy 混淆；同批 `full_semantic` 反而是 **0/3** 混淆。這與先前三輪 `current 0/3、semantic 3/3` 的方向相反，證明 3 repetitions 對 temperature=1 的 production 行為不足以支持格式因果。（本批在加入逐筆 checkpoint 前被 quota 中斷，保留 stdout verdict，未保留 52 筆完整 answer body；後續腳本已修正。）
2. **Gemini 的 `document_headings_only` 曾出現 3/3 混淆，但沒有跨模型重現。** GPT-5.4-nano 為 0/10；Claude Haiku 4.5 為 2/5，而且 Claude 的 Current 本身是 5/5 混淆。不能把 document heading 認定為原因。
3. **GPT-5.4-nano 五個候選 arms 都是 0/10 混淆，但常漏答必要細節。** `current / document heading / document handle / document tag / full semantic` 的完整回答率分別為 `3/10、1/10、5/10、2/10、1/10`。因此「未說錯」多半伴隨「沒有完整提到」，不能解讀為該模型較安全。
4. **Claude 顯示錯誤也存在於 Current。** `current / document heading / document handle / document tag / full semantic` 的混淆率為 `5/5、2/5、4/5、5/5、3/5`；方向不支持「加 Markdown 會造成混淆」。

### 根因從格式轉向 procedure entity resolution

人工檢視回答後發現，模型經常把來源中的模糊名稱 `Fiberscopy` 自動翻譯／正規化成「纖維支氣管鏡」。因此模型可能同時輸出：

- 「纖維支氣管鏡看到 trachea blood-tinged sputum」；
- 「後續建議 bronchoscopy，但家屬猶豫而未做」。

在模型內部，這可以被理解為「先做過某種 fiberoptic scope，後來建議更正式的 bronchoscopy evaluation」，未必被它視為自相矛盾。真正缺少的不只是 document boundary，而是**兩個 procedure mention 不可自動合併的實體語意**。

只加換行事件邊界沒有改善 Claude（Current `5/8` 混淆；event boundaries `5/8`）；只加 `performed / recommended_not_performed` 也僅到 `4/8`，信賴區間高度重疊。更完整的單一資訊變因應是：

```yaml
- event_id: EVENT-1
  status: performed
  procedure_name_as_recorded: Fiberscopy
  normalized_procedure: unknown
  finding: trachea blood-tinged sputum; no active bleeding
  do_not_merge_with: EVENT-2

- event_id: EVENT-2
  status: recommended_not_performed
  procedure_name_as_recorded: bronchoscopy evaluation
  reason: family hesitated
  do_not_merge_with: EVENT-1
```

`event status + procedure identity` 的 quota 前單筆 probe 為 1/1 完整且無混淆，但 **n=1 不能當確認結果**。下一個確認批次應比較 `current`、`event boundaries`、`event status`、`procedure identity`、`event status + procedure identity`，每 arm 至少 20 repetitions；Gemini／OpenAI／Claude 免費 proxy 本日配額均已用完，需 quota reset 或 BYO key 才能完成。

### 目前可下的結論

- 不能再用原始 51/54 vs 45/54 宣稱 Current 格式優於 Semantic Markdown；T4 的方向在新批次反轉。
- 尚未找到任何一個 Markdown 符號或 document tag 能穩定、跨模型地造成錯誤。
- 已定位到更符合回答內容的機制候選：**`Fiberscopy` 的 procedure type 不明，模型做了過度正規化，再把 finding 掛到 bronchoscopy 名稱上。**
- 產品修正不應是拿掉 Markdown，而應保留原始 procedure name、標示 normalization uncertainty，並禁止把相鄰但不同狀態的 procedure mentions 自動合併。

### 重要觀察

1. **純 Markdown 結構的 token 成本很低，但 AI accuracy 收益未被證明。** +1% token 就能取得 36 個真正 heading、28 個可引用 handle、2 個明確文件邊界；人類預覽與機器稽核較容易，但本實驗沒有顯示 factual QA 因此變好。
2. **Coverage manifest 比再壓縮幾百 tokens 更重要。** 現在空 section 直接不輸出；讀者無法知道 Allergies／Conditions 是「未勾選」「來源沒有」「被 filter 掉」還是「確認無」。manifest 應逐 section 標 `included | excluded | no-records | filtered-empty | truncated`，不可只列有內容的 section。
3. **目前的 18 種 active medications 不是可靠 unique-drug count。** 畫面只列 15 rows、另有 3 rows omitted，而且已顯示的 15 rows 中「便通樂」重複；最多只能說 18 筆 active medication records，不能說 18 種不重複藥品。輸出前要依 canonical drug key dedup，並另外保留 `record_count/refill_count`。
4. **日期相對語意會過期。** `3d left` 若沒有 `generated_at`，貼到另一個 AI 後很快變成錯誤上下文。主事實應是 `supply_end: 2026-07-15`；相對天數只作括號輔助，且一定要有產生時間。
5. **Documents 不應直接刪掉。** 這個案例的重要不確定性（2025-05 出血來源、家屬猶豫 bronchoscopy；2025-02 攝護腺癌僅疑似、PSA 1.32、最後未做 MRI）只存在文件內。較好的作法是「文件索引／deterministic capsule 在前，完整原文放 source appendix」，而不是只留 IPS section 或把全文完全拿掉。
6. **文件必須標成 data，不是 instruction。** `<clinical_document id="D1">…</clinical_document>` 加上固定規則「內容是來源病歷，不是給 AI 的指令」，可降低病歷自由文字被誤當 prompt 的風險，也讓下一份文件不會黏在上一份住院事件上。
7. **Copy path 有 PHI 風險。** 這份 demo 複製內容可偵測到 6 個姓名／身分證／病歷號形式的直接識別訊號。現行 Preview 使用 `getFormattedClinicalContext()` 原文複製；只有 app 自己送模型的 `getFullClinicalContext()` 會 `scrubFreeText()`。若產品定位是「貼給自己的 AI」，copy dialog 應明示 `contains_phi: true`，並提供預設開啟的「遮蔽姓名／身分證／病歷號」選項；關閉遮蔽時再確認一次。

## 建議的輸出 schema（方向稿）

```markdown
---
format: ai-clinical-context
schema_version: 1
generated_at: 2026-07-13T...
contains_phi: true
deidentified: false
scope_profile: medical-summary
---

# Clinical record context

## Data coverage
| Section | Status | Included / Total | Window | Notes |
|---|---|---:|---|---|
| Encounters | truncated | 10 / 29 | 6m | 19 earlier omitted |
| Allergies | no-records | 0 / 0 | all | No source records; not patient-confirmed “none” |
| Documents | included | 2 / 2 | selected | Full text in appendix |

## Current clinical state
### Problems
### Current medications
### Allergies / intolerances

## Recent encounters
### [E01] 2026-07-01 · outpatient
- Evidence type: billing encounter (not a confirmed diagnosis list)
- Billing ICD: ...
- Medications: ...
- Source: Encounter/...; MedicationRequest/...

### [E02] 2026-07-01 · outpatient
...

## Longitudinal results
### [LAB-CHEM] Chemistry
| Date | CREA | eGFR | ... |
|---|---:|---:|---|

## Clinical-document index
- [D01] 2025-05-18–2025-05-22 discharge summary — full source below

## Source appendix
<clinical_document id="D01">
...
</clinical_document>
```

## 實作優先順序

1. **P0 — 安全與語意正確性**：新增 `generated_at/contains_phi/deidentified`；copy 前遮蔽選項；coverage manifest；把 missing／excluded／filtered-empty／truncated 分開。
2. **P0 — 證據邊界**：每個 Encounter、report、document 加穩定 alias，標示 `billing-code | confirmed-condition | document-assertion`，同日 Encounter 絕不只靠日期合併。
3. **P1 — formatter**：另做 `buildAiClinicalMarkdown()`，不要重用 IPS curation／`buildIpsMarkdown()`；輸出 `# / ## / ###`、原生 GFM table、document tags。
4. **P1 — medication semantics**：active summary 依藥品 key dedup；分開 `unique_drug_count`、`record_count`、`refill_count`，不要把調劑筆數稱為藥品種數。
5. **P1 — documents two-tier**：前置 deterministic capsule（診斷／course／discharge meds／follow-up），完整原文留 appendix；之後再以模型 A/B 實驗決定預設是 capsule-only 還是 capsule+full。
6. **P2 — 顯示清理**：日期統一 ISO 8601、移除沒有 `generated_at` 的裸相對天數、修正 `{ratio}` placeholder、名稱與單位走 canonical label，但保留來源原文供追溯。

## 已執行命令與下一輪

本輪在取得明確同意後，以下命令共執行三次：

```bash
node scripts/experiments/clinical-context-format-eval/main.mjs \
  --input /absolute/path/to/pasted-text.txt \
  --allow-external-clinical-data
```

9 題涵蓋：近期 Encounter 精確查找、同日 lab panel、申報 ICD vs 確診、長文件住院病程、同日多 Encounter 分離、截斷 medication count、missing allergy section、visit coverage、攝護腺癌疑似／PSA／未做 MRI。下一輪建議把三臂改為 `full-document current` vs `capsule + full appendix` vs `capsule only`，新增「已做 vs 建議未做」「入院診斷 vs 出院診斷」「出院用藥 vs 長期用藥」題型；至少跑 3 repetitions，並 randomize／counterbalance arm 順序。

---

# 資料忠實度修正：格式實驗之前，先保證餵入資料是真的 — 2026-07-13

## 為什麼另做這一輪

前面的 representation 實驗比較的是「相同臨床事實如何排版」。後續檢查卻發現 production plain text 本身並未滿足這個前提：`…and 3 more`、`19 earlier visits omitted for brevity` 會讓「全部資料」名不副實；同日同項檢驗會 last-write-wins；查詢失敗、filter 後零筆與真的零筆也可能都表現成 section 消失。這些是 data-fidelity bug，不應由 Markdown A/B test 吸收成格式效果。

因此本輪優先順序改為：

1. 先保證選取範圍、FHIR 狀態與實際送模型的 structured side channels 一致；
2. 再建立可辨識 `excluded / no-source-records / filtered-empty / unavailable / included` 的 coverage manifest；
3. 最後才繼續比較表達格式。

## 已修正的缺口

| 缺口 | 修正後不變量 |
|---|---|
| 用藥只列 15 筆、就診只列 10 筆 | 不再有隱藏筆數上限或 `omitted for brevity`；使用者選「全部」時逐筆保留。 |
| 空字串被 formatter 變成 `- ` | 空字串只作段落分隔，不再產生空 bullet。 |
| `active/completed` 被一律視為現用藥 | 同時檢查 lifecycle status 與可計算的 supply end；`draft / on-hold / entered-in-error / unknown` 絕不升格成現用藥。 |
| 用藥只用名稱 dedup | dedup key 納入藥名、劑量、途徑、頻率、機構與狀態；只把相同療程的 refill 壓成一列，並保留 refill count。 |
| visit 與 standalone section 互相去重造成跨時間窗消失 | standalone 用藥／處置是 filter-faithful authoritative list；visit 只重複提供 chronology，並明示不可 double-count。 |
| `not-done` procedure 像已執行 | 明示 `NOT PERFORMED`；`entered-in-error` 明示 invalidated。 |
| allergy／condition／immunization 狀態語意不足 | 保留 verification、criticality、reaction、severity、每次疫苗事件；refuted／entered-in-error 不會被當成 active/valid fact。 |
| 同日同項檢驗 last-write-wins | 同日多個值全部保留於同一 cell（例如 `95 / 110`），不再靜默覆蓋。 |
| `labDepth` 只有 UI、沒有真的限制 context | 現在依每個 analyte 套用 latest／3／8／16／all；`all` 不設上限。 |
| 非 quantity Observation 消失 | 支援 string、CodeableConcept、boolean、integer、decimal、date/time、range 與 component-only Observation。 |
| Other Observations 被偷偷折進 lab，或 report member 重複出現 | Lab、imaging、vital、other 使用共用 selector；report member 不會再漏進 Other Observations。 |
| DocumentReference 只讀第一個 attachment | 每個 attachment 都處理；binary、URL-backed、decode failure 會留下明確 marker，不再假裝是空文件。 |
| HTML table cell 黏在一起 | `td/th` 轉成 tab、row 轉成 newline，避免 `DrugDose` 類語意黏合。 |
| 文件 decode cache 只用 FHIR id | 改用 resource object identity；切換病人／server 後相同 id 不會讀到上一份病歷。 |
| 文件自由文字可能偽裝 prompt／邊界 | system prompt 固定宣告文件是 untrusted clinical data；每份文件有 BEGIN/END boundary，delimiter id 會 sanitize，文件內偽造 boundary token 會 escape。 |
| 日期 filter 接受無日期／未來資料；`sinceLastVisit` 無就診時退化成 all | bounded window 排除 undated/future；沒有 anchor 時回傳 filtered-empty，不再偷偷放寬。Lab 是唯一保留的明示 fallback，會標出 fallback sampling days。 |
| 查詢失敗被當成零筆 | 每個 FHIR search 保留 `ok / empty / unauthorized / forbidden / unsupported / error`；pagination 超過安全頁數直接失敗，不回傳偽裝完整的 partial bundle。 |
| UI context 有 filter，但 source catalog／longitudinal appendix 又塞回未選資料 | 所有 structured AI input 先走同一個 category/time/status/document scope；lab fallback 的 report-member Observation 也同步進可引用來源。 |
| prompt 加上 source list 後才超 context window | preflight 改檢查完整 messages；超限就阻擋，不送出一個已知不完整的請求。 |
| Preview copy 原文 PHI | 預覽與複製預設走直接識別資訊遮蔽；關閉後才顯示／複製 raw text，且明示這不是完整去識別。 |

## Coverage Manifest 的 production 語意

Manifest 不再只是「告訴模型有哪些 section」。每個類別固定輸出一種狀態：

```text
Medications: status=included; source_records=18; included_records=18; query=MedicationRequest=ok
Visits: status=filtered-empty; source_records=29; included_records=0; query=Encounter=ok
Allergies: status=no-source-records; source_records=0; included_records=0; query=AllergyIntolerance=empty
Lab Results: status=unavailable; source_records=0; included_records=0; query=DiagnosticReport=forbidden,Observation=ok
Other Observations: status=excluded
```

這些狀態的資訊量並不等於「新增病歷事實」，但會改變 absence 的可解釋性：模型不必猜 section 消失是未勾選、沒有來源、被 filter 掉或查詢失敗。Manifest 同時帶 `generated_at`，避免 `3d left` 一類相對日期脫離計算時間；並明示 `contains_phi=possible / deidentified=false`，即使已套直接識別遮蔽，也不得誤稱完整去識別。

## 對既有格式實驗的影響

- 上面 81 次呼叫仍是有效的「歷史 snapshot representation」觀察，但其中 Current 的 omission markers 與缺少 coverage 是當時產品缺陷，不應再當作新 baseline。
- 下一輪格式比較必須從同一個已通過 fidelity invariants 的中間資料模型產生各 arms；不得讓其中一臂多資料、少資料或有不同 filter fallback。
- Handles／headings 的效果仍待跨病人、counterbalanced 實驗；這輪修正沒有把 Markdown 宣稱為 accuracy intervention。
- Procedure event semantics 仍是下一個獨立研究題：目前 FHIR Procedure status 已忠實輸出，但出院病摘自由文字中的 `performed / recommended / declined` deterministic capsule 尚未建置，不能把它與排版效果混在一起。

## 回歸測試重點

新增測試鎖定以下失敗模式：無 omission markers、invalid medication 不進 active、not-done 不當 performed、同名疫苗事件不合併、refuted problem 不進 active、同日檢驗不覆蓋、bounded date 不收 undated/future、文件 cache 不跨 bundle、所有 attachment 都有可見結果、文件 boundary 不可被 title/id 改寫、deselected category 不進 structured AI source、lab fallback 仍有可引用 Observation、panel filter 不會由 side channel 洩漏、query error 與 empty 可區分，以及 Preview 預設複製遮蔽版。

---

# 用藥名稱語言單一變因：中文來源名 vs 英文 coding display — 2026-07-13

## 問題與設計

本輪只問一件事：AI context 中的用藥名稱，從目前的 `MedicationCodeableConcept.text` 中文名稱改為 `MedicationCodeableConcept.coding[0].display` 英文名稱，藥物辨識與配對表現是否改善。

資料使用 public synthetic demo bundle，以 `2026-07-12` 為基準選出供藥窗仍有效的 18 筆 MedicationRequest。兩臂保留完全相同的 record、handle、順序、status、authored date、supply end、sig 與 billing reason；唯一替換的是每列的藥名欄位：

- `zh_name`：FHIR `medicationCodeableConcept.text`
- `en_name`：FHIR `medicationCodeableConcept.coding[].display`

英文名稱覆蓋率為 18/18。兩份 context 約為 1,021 與 1,051 tokens，英文臂增加約 30 tokens（2.9%）。8 題涵蓋 tamsulosin、dapagliflozin、levothyroxine、febuxostat、五種胃腸用藥配對、imipramine + clonazepam 高齡風險、三種青光眼眼藥，以及同名兩筆 record 的重複計數控制。每題每臂跑 3 次，question × repetition 交錯臂順序，共 48 次 `gemini-3.1-flash-lite` 呼叫。

實驗腳本：`scripts/experiments/clinical-context-format-eval/medication-name-language-eval.mjs`。live run 必須明示 `--allow-external-clinical-data`；完整 context、問題與回答只寫入 gitignored `results/`。

## 結果

| arm | n | correctness score | 全對率 | 禁止性錯誤 | context tokens |
|---|---:|---:|---:|---:|---:|
| 中文名稱 `zh_name` | 24 | 40/48（83.3%） | 19/24（79.2%） | 0 | 1,021 |
| 英文名稱 `en_name` | 24 | **48/48（100%）** | **24/24（100%）** | 0 | 1,051 |

| 題型 | 中文：score / 全對 | 英文：score / 全對 | 主要差異 |
|---|---:|---:|---|
| tamsulosin | 6/6 · 3/3 | 6/6 · 3/3 | 無差異 |
| dapagliflozin / SGLT2 | **0/6 · 0/3** | **6/6 · 3/3** | 中文臂三次都說清單沒有此藥；英文 `Forxiga` 三次皆正確 |
| levothyroxine | 6/6 · 3/3 | 6/6 · 3/3 | 無差異 |
| febuxostat | 6/6 · 3/3 | 6/6 · 3/3 | 無差異 |
| 五種胃腸用藥 | 6/6 · 3/3 | 6/6 · 3/3 | 無差異 |
| imipramine + clonazepam | **4/6 · 1/3** | **6/6 · 3/3** | 中文臂兩次找不到「益伊神」是 imipramine/TCA |
| 三種青光眼眼藥 | 6/6 · 3/3 | 6/6 · 3/3 | 無差異 |
| 重複 record 控制 | 6/6 · 3/3 | 6/6 · 3/3 | 無差異 |

配對的全對結果中，英文勝、中文敗有 5 組；中文勝、英文敗為 0 組。探索性的 exact McNemar / sign test 兩側 `p=0.0625`：方向一致且 effect size 大，但 24 組、單一病人仍不足以宣稱一般化顯著。

### 評分器修正紀錄

初版重複 record rubric 只接受字面上的「兩筆」或 `two records`，因此把「[M04] 與 [M09] 是不同紀錄，但不能視為兩種藥」誤判為未全對。這是 grader 假陰性，不是模型錯誤。規則已擴充為接受「兩者……紀錄」的等義表達，並以同一批已保存答案離線 regrade；沒有重送 API 或挑選較有利的生成結果。初版分數為中文 38/48、英文 46/48；上表是語意修正後的正式分數。

## 解讀

在這個病例，**直接使用英文 `coding.display` 確實改善模型表現**，且改善不是全面性的隨機小幅波動，而是集中在中文商品名難以連回國際通用學名／藥理類別的題目。`福適佳 → dapagliflozin` 三輪穩定失敗，`Forxiga → dapagliflozin` 三輪穩定成功；`益伊神 → imipramine` 也有相同但較弱的訊號。

不過，這個 arm 名稱是「FHIR 中文 text vs 英文 coding display」，不能嚴格縮寫成「英文語言本身造成改善」。部分英文 display 直接帶有 ingredient，例如 `NIDOLIUM ... (DOMPERIDONE)`、`VOKER ... (FAMOTIDINE)`；中文 text 有些也帶中文成分、有些只有本地商品名。真正可能起作用的是英文 display 更接近模型訓練中常見的國際商品名／學名，而且某些列提供了較多可辨識的 ingredient 字串。

## 產品建議

1. AI-only context 若有英文 `coding.display`，優先使用它；缺值時 fallback 到來源 `text`。以這批資料看，代價只有約 2.9% tokens，收益明顯。
2. 不建議從可稽核輸出永久刪除中文來源名。供人複製／核對的 Markdown 較適合保留 `source_name_zh`，另加 `normalized_name_en`；這能讓使用者對回原處方，也避免英文 mapping 錯時失去來源證據。
3. 下一個確認實驗應比較 `zh only / en only / zh + en / ingredient-normalized`，並跨多位病人與多種藥名覆蓋。特別要把「只有英文商品名」和「英文 display 直接附 ingredient」拆成不同 strata，才能知道收益來自語言、國際商品名，還是新增的成分資訊。

## 實作狀態

已依本輪結果把 AI 專用用藥名稱統一為英文 `coding[].display` 優先，缺值時依序 fallback 至來源 `text`、`medicationReference.display`。此規則已套用到臨床 context、就診內用藥列、聊天 Agent 的 FHIR medication tools、core clinical-context formatter，以及醫療摘要的 source catalog；不改動一般臨床畫面依 audience／locale 顯示中文名稱的行為。

新增共用 `pickAiMedicationName()`，避免不同 AI 功能各自選名而產生語言不一致。完整回歸結果：173 suites、2,149 tests 全部通過，TypeScript 與異動檔 ESLint 亦通過。

---

# Active medication 跨區塊重複：Visits 摘要是否應保留 — 2026-07-13

## 問題定位

目前 `Visits & Treatment History` 開頭會完整列出 18 筆 `Currently active medication records`，後面的 `Patient's Medications` 又列一次相同 18 筆。從 production data flow 可確定這不是互補資料：Visits 只有在 `selectedData.medications=true` 時才收到 medication records，而同一條件下 authoritative `Patient's Medications` section 也必定產生。因此 Visits 頂部清單是純 representation duplication；逐次 visit 下的 medication rows 才有獨立的 chronology 價值。

## 單一變因實驗

由於附件被執行安全層視為私密臨床資料，未將附件送往外部 proxy。正式模型評測改用 repo 的 public synthetic demo bundle 衍生相同 18 筆現用藥 snapshot：

- `duplicated`：Visits 頂部重複 18 筆簡表，之後仍有 authoritative `Patient's Medications`。
- `single_source`：只刪除 Visits 頂部 18 筆；section 順序、權威用藥清單與逐次 visit chronology marker 都不變。

兩臂依 production 順序排列：Visits 在前，Patient's Medications 在後。7 題涵蓋 record count、unique-name count、同名兩筆語意、最早 supply end、四種眼藥、五種 K317 胃腸用藥與 Forxiga/SGLT2 辨識；每題每臂 3 次，交錯 arm 順序，共 42 次 `gemini-3.1-flash-lite` 呼叫。

> 一個先導批次曾把兩個 section 的順序放反，使重複清單被附加在 context 最末端，形成 recency confound；該批次不納入正式結論。正式批次已按 production 順序重跑。Grader 也曾把 Markdown 粗體中的 `2`／`1` 誤判，並多要求一句與「2 筆、1 個不同藥名」重複的同義句；正式分數使用同一批原始答案離線修正，沒有重送或挑選生成結果。

## 結果

| arm | n | correctness score | 全對率 | context tokens |
|---|---:|---:|---:|---:|
| 重複清單 `duplicated` | 21 | 42/42（100%） | 21/21（100%） | 1,464 |
| 單一來源 `single_source` | 21 | 42/42（100%） | 21/21（100%） | 1,085 |

所有 7 題、3 repetitions 兩臂皆全對。移除重複區塊在這個 current-medication-focused fixture 節省 379 tokens，即相對 duplicated arm 減少 **25.9%**，沒有觀察到 factual QA 退步。若以使用者提供的整份 medication-history attachment（包含 recently ended 與 past medications）做本機 token estimate，同一刪除約從 3,993 降至 3,565 tokens，減少 428 tokens（**10.7%**）；放入更完整的全病歷 context 後，整體百分比會再降低，但絕對 token 仍固定省下約一份 18-row summary。

## 建議

1. 刪除 Visits 頂部完整的 `Currently active medication records` 清單。
2. `Patient's Medications` 保留為唯一 authoritative current／recent／past medication section。
3. Visits 只保留每次就診實際關聯的 medication rows，用來回答「哪次就診開了什麼」，並在 section note 明示它們是 chronology、不可和 authoritative section 重複計數。
4. 若需要導覽，只放一行 cross-reference，不複製藥名：`Current regimen: see Patient's Medications (authoritative list); visit-linked rows below are chronology only.`

本結果支持「刪除純重複、保留時間線」：目前沒有證據顯示第二份 active list 提升正確率，卻確定增加 token、視覺噪音與未來兩份資料不同步的風險。限制是單一 synthetic patient、單一模型與 3 repetitions；不能外推成所有長 context 都完全沒有 position effect，但已足以證明這個重複不是資料完整性所必需。

## 實作狀態

已移除 `Visits & Treatment History` 頂部完整的 `Currently active medication records` 區塊。逐次 visit 關聯的 medication rows 全數保留，沒有截斷；section note 現在明示 `Patient's Medications` 是 authoritative regimen list，visit-linked rows 只提供 chronology，跨 section 不可重複計數。回歸測試同時鎖定英文藥名、18 筆 visit-linked rows 全部存在，以及 active summary 不得再次出現。
