# 檢驗格式 A/B 實驗:樞紐表 (pivot) vs 趨勢行 (trend) — 2026-07-12

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
