# 實驗索引

這些是手動評測入口，並非正式 app 的功能註冊。模型與結果代表實驗當時條件；不要把成功一次的輸出當成可發布結論。歷史結果摘要見 [history](../../docs/history/README.md)，工作狀態見 [WIP](../../docs/WIP.md)。

以下從 repo 根目錄執行。`tsx` 是部分原始腳本指定的 runner，未列於本 repo 直接依賴；這些入口需要另備相容的 tsx 執行環境，本次沒有安裝或驗證該 runner。`node` 與 Jest 入口使用現有工具。腳本可能依賴本機資料與 `.env.local`；先確認各檔案開頭的條件，再決定是否發出模型請求。

| 入口 | 用途／輸入 | 輸出 | 執行方式 |
|---|---|---|---|
| [lab-format-eval](lab-format-eval/main.ts) | 比較檢驗 pivot / trend；`LAB_EVAL_FIXTURES` 指定本機 fixtures | 同目錄 `results/` | `tsx scripts/experiments/lab-format-eval/main.ts --dry-run` |
| [med-recon-eval](med-recon-eval/main.tsx) | 跨院用藥整合；`MED_RECON_FIXTURES` 指定 fixtures | `MED_RECON_OUT`，預設外部 bridge 的本機 fixtures 目錄 | `tsx scripts/experiments/med-recon-eval/main.tsx --dry-run` |
| [medication-history-scope-eval](medication-history-scope-eval/main.tsx) | 用藥全歷史與 episode index A/B；輸入參數見腳本 | 同目錄 `results/` | 下方 Jest 指令 |
| [clinical-context-format-eval](clinical-context-format-eval/main.mjs) | 臨床 context 格式；`--input` 文字檔 | 同目錄 `results/` | `node scripts/experiments/clinical-context-format-eval/main.mjs --input /absolute/path/context.txt --dry-run` |
| [ablation-t4](clinical-context-format-eval/ablation-t4.mjs) | 格式消融比較；`--input` 文字檔 | 同目錄 `results/` | `node scripts/experiments/clinical-context-format-eval/ablation-t4.mjs --input /absolute/path/context.txt --dry-run` |
| [active-medication-duplication](clinical-context-format-eval/active-medication-duplication-eval.mjs) | 現用藥重複處理；`--input` 文字檔 | 同目錄 `results/` | `node scripts/experiments/clinical-context-format-eval/active-medication-duplication-eval.mjs --input /absolute/path/context.txt --dry-run` |
| [medication-name-language](clinical-context-format-eval/medication-name-language-eval.mjs) | 藥名語言比較；預設 demo bundle，可用 `--bundle` 指定 | 同目錄 `results/` | `node scripts/experiments/clinical-context-format-eval/medication-name-language-eval.mjs --dry-run` |
| [tvghbrain-medication-reliability](tvghbrain-medication-reliability.ts) | 合成 fixture；需 `TVGHBRAIN_ENDPOINT`、`TVGHBRAIN_API_KEY`，可設 `TVGHBRAIN_MODEL` | stdout 的逐次 JSON 與 RESULT | `tsx scripts/experiments/tvghbrain-medication-reliability.ts`（會呼叫端點，沒有 dry-run） |

用藥歷史範圍實驗的原生入口：

```bash
RUN_MED_SCOPE_EVAL=1 MED_SCOPE_EVAL_ARGS='--dry-run' \
  ./node_modules/.bin/jest --runInBand \
  __tests__/experiments/medication-history-scope-eval.test.tsx
```

`--dry-run` 仍可能讀取本機檔案並產生結果。要使用真實資料呼叫外部服務，須符合原腳本的 `--allow-external-clinical-data` 條件與資料使用授權；不要把此索引當成資料傳送授權。`results/` 已被 Git 忽略；自訂輸出目錄須另外確認是否忽略。

## 外部 Agent 評測

[clinical-skill-tools.ts](../../src/infrastructure/ai/tools/clinical-skill-tools.ts) 的 eGFR 與 NLM terminology tools 供私有 medical-agent-harness A/B 使用，尚未註冊到正式 app Agent。保留原路徑以維持外部引用，不能只因 app 未 import 就刪除。評測契約與 ledger 見 [DEEP-MODE-EVAL-LOOP](../../docs/DEEP-MODE-EVAL-LOOP.md)。

實驗 TypeScript 仍可能被 repo 的廣泛型別檢查涵蓋；放在本目錄不代表免除檢查。結果若要影響產品，另提小範圍實作與回歸證據。
