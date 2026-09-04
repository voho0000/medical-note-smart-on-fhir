# VGHBrain 初診摘要 Context Engineering — 交接（2026-09-04）

分支：`codex/vghbrain-context-test`

## 背景

目標是**初診病人摘要**的 context engineering。推論在本地模型 **VGHBrain** 上跑，
輸入上限是應用層自訂的三層預算（`src/shared/utils/vghbrain-context-policy.ts`）：

| 常數 | 值 | 意義 |
| --- | --- | --- |
| `VGHBRAIN_CLINICAL_TOKEN_LIMIT` | 100,000 | 臨床 context 本身的上限 |
| `VGHBRAIN_INPUT_TOKEN_LIMIT` | 150,000 | 完整 request（prompt + context + 對話） |
| `VGHBRAIN_CONTEXT_LIMIT` | 154,000 | 上者加既有的 4K 回覆預留 |

真實病人（尤其腫瘤／長期慢病）整份 record 可達 **>1M tokens**，所以核心策略是：

1. **先改表示法**（同樣的事實，用更少 token 表達）；
2. 表示法壓到底之後，才動用**丟資料**的階梯（`full → trimmed → compact → tight → prioritized`）；
3. **醫師手動勾選的文件永遠全文**，任何自動縮減都不得截短它。

---

## 這輪完成的工作

### 1. 18 項功能清單第 1–4 項：審核與修正

| 主題 | 修正 | 檔案 |
| --- | --- | --- |
| VGHBrain 上限套用 | Insights 與 Chat 兩條路徑都補上臨床上限，且**禁止靜默截短**（改為丟錯） | `features/clinical-insights/hooks/useInsightGeneration.ts`、`features/clinical-insights/ClinicalInsightsRuntimeProvider.tsx`、`features/medical-chat/hooks/useAgentChat.ts` |
| Preflight | 送出前先量測，套用 clinical cap 與 exact-fit 判斷 | `src/application/hooks/ai-generation/use-clinical-ai-input.hook.ts` |
| 模型偵測 | regex 放寬成 `/t?vgh[-_ ]?brain/i`，涵蓋 `tvghbrain3.5`／`VGHBrain-3.5`／`vgh_brain`；改名後的部署仍繼承上限 | `src/shared/utils/vghbrain-context-policy.ts` |
| Fail-closed | 認不出模型時走保守路徑，不是放行 | 同上 |
| 階梯選擇 | 從「第一個塞得下」改成**最佳擬合**（`selectBestClinicalContextFitTier`）：`full` 塞得下就短路，否則取**仍塞得下的最大**一階。階梯在 token 上非單調，所以先到的 `trimmed` 可能遠低於目標而 `prioritized` 反而填得滿 | `src/core/utils/adaptive-clinical-context.utils.ts:255` |
| prioritized 收斂 | 新增 `nextPrioritizedContextBudget`，最多 3 pass 逼近目標 | `src/core/utils/adaptive-clinical-context.utils.ts:294`、hook 第 434 行 |
| prioritized 預算單位 | 修正：預算是**渲染後的 token**，不是原始 JSON token | `src/core/utils/prioritized-clinical-context.utils.ts` |
| 自動縮減不丟使用中用藥 | 新增 filter `medicationKeepCurrentRegardlessOfRange`（縮減層自己設 `true`，**不覆蓋使用者設定**） | `src/core/entities/clinical-context.entity.ts:64`、`adaptive-clinical-context.utils.ts:157`、`clinical-context-selection.utils.ts:94` |
| 分段落截短 | 最後手段的文字截短會**保護過敏／問題／用藥**段落 | `src/shared/utils/context-budget.ts` |
| 手術 careType | 由**完整資料集**解析 encounter 的 careType 再帶回 procedure（`withCarriedCareType`），不再靠列舉 marker | `src/core/utils/ai-clinical-domain-filter.utils.ts:151,268` |
| 病摘去重鍵 | 同樣改由完整資料集解析；去重鍵跨 domain filter 攜帶，selector 與 renderer 兩側解析出同一份文件清單 | `src/core/utils/clinical-documents.utils.ts` |
| 自選文件模式 | `custom` 模式可跨重新整理保存 | `src/application/providers/data-selection.provider.tsx` |
| 超量訊息 | 列出**最大 3 份**手動勾選文件（`已選文件中最大的幾份：…`） | `src/shared/utils/context-budget.ts:52,191` |
| Insights 溢位 | 改丟 `ContextOverflowError` | `src/application/hooks/ai-generation/context-window-retry.ts:93,165` |
| jest | `testPathIgnorePatterns` / `modulePathIgnorePatterns` 加入 `tmp/`，避免 gitignore 的 scratch checkout 遮蔽真模組 | `jest.config.js` |

### 2. 表示法壓縮（本輪主力）

| 手法 | 說明 | 檔案 |
| --- | --- | --- |
| 檢驗每項目一行序列 | 放棄 date × test pivot（稀疏格成本 = 日數 × 分析項）。改成每個 analyte 一行：最新值 + 近期歷史 + 深度上限外的 **min/max（含日期）與總筆數**無損摘要。時間範圍放寬時 context 不再線性成長。標籤沿用來源 `code.text`，維持可引用性 | `src/core/utils/lab-series-context.utils.ts`、`src/core/categories/lab-reports.category.ts` |
| 影像 impression-first | 只保留結論段落。**安全規則：只有真的認出結論標頭才縮減**，認不出就回退全文，絕不猜哪段是結論 | `src/core/utils/imaging-impression.utils.ts`、`src/core/categories/imaging-reports.category.ts` |
| 病摘關鍵段落抽取 | `extractDocumentKeySections`；自動模式預設 `keySections`，**`custom`（手動勾選）與 `aiExport` 永遠 `full`**。政策集中在一支檔案，並帶自己的 cache identity（`key-sections-v1` vs `complete-v1`），兩種輸入不會互相 hydrate | `src/core/utils/clinical-documents.utils.ts:401,636`、`src/core/utils/document-text-policy.utils.ts` |
| claims 問題時間軸 | 健保 claims 每次就診重複同一個 ICD-10。改成**每個問題一行**（依 ICD-10 前 3 碼分群、標最具體的碼），成本與就診次數脫鉤；行上印該 Condition 的 catalog 日期以維持引用 | `src/core/utils/problem-timeline.utils.ts`、`src/application/hooks/clinical-context/useProblemTimelineContext.ts` |
| 段落順序重排 | 安全資訊在前（demographics → temporal → allergies → …），文件放最後 | `use-clinical-ai-input.hook.ts:100` |
| source signature | 升到 `clinical-ai-source-v5` | `use-clinical-ai-input.hook.ts:103` |

### 3. 真實資料修正

- **用藥以供藥證據判斷**：bridge（NHI 健保存摺／Medcloud）送出的 MedicationRequest **全部是 `status: unknown`**，只有 days-supply 有值。原本 `status === 'active' || 'completed'` 對所有 claims 來源都回報「0 筆在用」。改為共用 `isMedicationCurrentlyInUse`，選取徽章與 AI context 用同一條規則。（`src/core/categories/medications.category.ts`）
- **預設 `medicationStatus` 改 `all`**（`src/shared/constants/data-selection.constants.ts:58,129）——**產品可見變更**。
- **檢驗窗口 fallback 改為 floor**：舊行為是「範圍內沒資料才回退」，導致非單調——6 個月（空 → 回退）渲染 16 行，3 年（有一筆零星值 → 不回退）只剩 4 行，反而蓋掉最近的真實 panel。改成 floor 後，放寬範圍只會增加、不會減少。（`src/core/categories/lab-reports.category.ts`）

### 4. 量測工具

- `__tests__/scripts/context-reduction-report.test.ts`
  env：`CONTEXT_REDUCTION_REPORT` / `_FIXTURE` / `_OUT_DIR` / `_AS_OF` / `_WIDEN`。
  未設 `CONTEXT_REDUCTION_REPORT=1` 就跳過，`npm test` 不受影響。不呼叫 AI，只做本地格式化 + `estimateTokens`。
- `docs/testing/context-reduction-measurement.md` — 欄位定義與跑法。
- 合成 fixture 改為 **NHI 出院病摘版面**，並加入活動中／近期停藥用藥；產生器 `scripts/generate-oncology-stress-bundle.cjs`、`scripts/generate-cloud-oncology-stress-bundle.cjs`。

---

## 量測數字

**合成腫瘤病歷**（1.28M raw tokens，目標 100K）：

| | 修正前 | 修正後 |
| --- | --- | --- |
| `full` tier tokens | 125,662（超標） | **≈24,900** |
| 實際送出的 rung | `trimmed`（10.6K） | **`full`** |
| 病摘文件 | 60 份 | 去重後 **24 份** |
| 影像 | 6,900 | **718** |
| 病摘節錄 | 46K | **19.6K** |
| 病摘關鍵事實保留 | 4% | — |
| 各類別關鍵事實保留 | — | **100%** |

放寬到「3 年、全版本影像」的壓力控制組：**371K → 73K → 47.8K**。

**真實 Medcloud capture（5 位病人）**：548–4,672 tokens，階梯完全未觸發。
用藥修正後各病人顯示 **9–43 筆**（修正前一律 0）。

---

## 如何重現量測

合成 fixture（在本 repo 內即可跑）：

```powershell
$env:TZ = 'Asia/Taipei'
$env:CONTEXT_REDUCTION_REPORT = '1'
$env:NODE_OPTIONS = '--max-old-space-size=12288'
npx jest --runInBand __tests__/scripts/context-reduction-report.test.ts --silent=false
```

輸出：`artifacts/context-reduction/<fixture>.md`（gitignored）+ stdout 表格。
加 `$env:CONTEXT_REDUCTION_WIDEN = '1'` 產生 widened 控制組（labDepth 16、labs 3 年、全版本影像 3 年），另存 `<fixture>-widened.md`，不影響階梯選擇。

真實 capture：

- 原始檔在**另一個 repo** `medcloud2-FHIR-bridge/data/patientN/capture.json`。
- 用該 repo 自己的 pipeline 轉成 Bundle JSON，**輸出到 repo 外的 scratch 目錄**。
- `CONTEXT_REDUCTION_FIXTURE=<絕對路徑>` 指向該檔；絕對路徑會被視為 **external**，
  報告只出彙總數字，"facts lost" 從標籤降級成計數。
- 一定要配 `CONTEXT_REDUCTION_OUT_DIR=<repo 外目錄>`。
- external fixture 的時鐘釘在 `CONTEXT_REDUCTION_AS_OF=<ISO date>` 或該 bundle 最新記錄日期
  （否則幾個月前擷取的病歷，所有相對窗口都會是空的）。

> **隱私規則**：真實 capture、轉檔產物、報告一律**不得進入本 repo**。
> 本 repo 內的院所／姓名全部是合成的（`合成測試醫院`、`合成測試區域醫院Ｂ`、
> `示範長青醫院`、`合成癌症測試`、`陳○明`、`SYN-*` / `M0000000*` 病歷號）。

---

## 尚未完成／待決定

**工程**

- 18 項清單的**第 5–18 項尚未逐項審核**。第 9 項（來源導引）有已知
  `Maximum update depth exceeded`，建議排到後段處理。
- **住院卡片**未實作：每份病摘先濃縮成 150–300 token、以**文件 id 永久 cache**；
  搭配「<50K 全送、>50K 分流」的策略，兩者都還沒動。
- **Chat 雲端分支沒有本地 overflow preflight**。
- 「必要記錄超量」訊息**未標示是哪個類別**。
- tokenizer **沒有 headroom**（估算值直接拿來比上限）。

**驗證**

- **本地模型有效窗口未評估**。建議把品質目標訂在 **30–50K**，並做
  「關鍵事實放在 context 不同位置」的召回測試 + 醫師金標準比對。
- **病摘抽取詞彙只在合成 fixture 與 demo 上驗證過**，需要 **2–3 家院所、約 50 份真實病摘**才能算數。
- 真正 >1M 的真實病人**不在這台機器上**；NHI-FHIR-BRIDGE golden fixtures 在
  `~/NHI-FHIR-BRIDGE-local`，未同步。

**待 owner 拍板**

- bridge 的 `status: unknown` 之後**會不會補上真實狀態**？會的話用藥判斷可以簡化。
- `medicationStatus: 'all'` 預設與 `keySections` 預設都是**產品可見變更**，需要確認。

**已知效能**

- 超大病歷 + 手動勾選文件時，會多量測 1–2 個 rung：jsdom 下約 **4–7 秒**；
  app 內包在 `startTransition` 裡，不阻塞輸入。

---

## 本輪驗證狀態

- `npx tsc --noEmit` — 通過
- `npx eslint`（59 個變更檔）— 通過
- `TZ=Asia/Taipei npx jest` — **424 suites 通過 / 2 skipped，4250 tests 通過**
- 已知的跨 suite jsdom `scrollIntoView` flake（ChatMessageList / model-execution-info）本輪**未出現**。
