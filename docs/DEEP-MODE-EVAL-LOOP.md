# Deep-mode eval loop — 規格

目標:用 teacher-student 自動 eval 迴圈量化並降低 deep-mode AI agent 的錯誤率。
**這不是模型訓練(無 fine-tuning / 不改權重)**,改的是 harness(prompt、工具、驗證、生命週期、fallback)。
成績單見 [DEEP-MODE-HARNESS-LEDGER.md](DEEP-MODE-HARNESS-LEDGER.md)。

---

## 1. 迴圈架構

```
FHIR bundle (fuzz) → 自動產生 30–50 題 eval
        │
        ├─→ Oracle: Opus 4.8 + 強 harness ──→ gold answers(跑一次、快取)
        └─→ Student: 5 個候選模型 ─────────→ answer + 完整 trajectory
                                   ↓
                LLM-as-judge:比對 student vs gold「FHIR 事實」(不是比文字)
                                   ↓
                Diagnose:失敗按 ETCLOVG 分層
                                   ↓
                Scoped repair(一次一層) ── human gate: approve patch
                                   ↓
                Re-run → 量 Δ → 填 ledger → 下一圈
```
human 只在 patch-approval 進場;eval 產生與評分全自動。

---

## 2. 第一輪決定(2026-06-28)

- **Student = 全部 5 個跑同一批 eval(排行榜)**
  | 模型 ID | provider | key |
  |---|---|---|
  | `gpt-5.4-nano` | OpenAI | `OPENAI_API_KEY` |
  | `gpt-5.4-mini` | OpenAI | `OPENAI_API_KEY` |
  | `gemini-3.1-flash-lite` | Google AI | `GOOGLE_AI_API_KEY` |
  | `gemini-3-flash-preview` | Google AI | `GOOGLE_AI_API_KEY` |
  | `claude-haiku-4-5-20251001` | Anthropic | `ANTHROPIC_API_KEY` |
  - Oracle + Judge = `claude-opus-4-8`(用 `ANTHROPIC_API_KEY`)
- **執行方式 = 我(Claude)只寫腳本,使用者自己在家裡 server 跑**,把結果貼回讓我解讀填表。
- key 放 gitignored `.env.local`(對齊 `scripts/seed-prompts.ts` 的 env 慣例),不進 git、不外流。

---

## 3. ⚠️ 關鍵技術前提:agent loop 目前綁在 React hook 裡

deep-mode 的編排目前活在 `features/medical-chat/hooks/useAgentChat.ts`(React hook,node 無法直接跑)。
**要 eval「真實 harness」,腳本必須呼叫和 app 一模一樣的工具與 prompt**,否則量到的是另一套 harness。

→ **階段 0 的第一件事:把 agent loop 抽成 headless 核心函式**,例如
`src/core/use-cases/agent/run-deep-mode-agent.use-case.ts`:
```ts
runDeepModeAgent({ question, model, apiKey, clinicalData, tools, systemPrompt })
  → { answer, trajectory, citations, error }
```
讓 `useAgentChat`(UI)和 eval 腳本**共用同一個核心**。這本身也是好的 harness 重構(可測試性 ↑)。
必須沿用:`build-agent-system-prompt.use-case.ts`、`src/infrastructure/ai/tools/fhir-tools.ts`、`stopWhen: stepCountIs(10)`、idle watchdog。

---

## 4. Trajectory schema(每題記錄)

```jsonc
{
  "qId": "q012",
  "question": "病人最近一次的腎功能如何?",
  "model": "gpt-5.4-nano",
  "toolCalls": [{ "name": "searchObservationByName", "args": {...}, "ok": true, "ms": 320 }],
  "steps": 3,                 // 實際用幾步(上限 10)
  "answer": "...",
  "citations": [...],
  "latencyMs": 14200,
  "p95Bucket": null,
  "error": null,             // 或 "StreamIdleTimeoutError" 等
  "errorChunk": false        // fullStream error chunk 是否出現
}
```

## 5. Eval 題目產生器

- 輸入:demo FHIR bundle(`scripts/build-demo-bundle.mjs` 產的合成 bundle)。
- fuzz 維度:缺欄位、空陣列、多型 `Reference[]`、怪 coding system、邊界日期(對齊 [fhir-generic 鐵則](../README.md))。
- 產 30–50 題,涵蓋:病人總覽、就診史、診斷、檢驗趨勢、用藥/過敏、跨資源推理、文獻查詢。
- 每題標 `category` 與 `requiredResources`(這題該用到哪些 FHIR 資源),供 judge 做事實對照。

## 6. Gold answer(Oracle = Opus 4.8)+ 兩道防幻覺

oracle 也是 LLM,gold 不是絕對真理,所以:
1. **可追溯**:gold answer 必須附上引用的 FHIR 資源(哪個 Observation / Encounter id)。
2. **code 自核**:gold 提到的 LOINC/SNOMED/ICD 必須真的存在於 bundle,否則該題踢出或標記(對齊 [LOINC](../README.md) / SNOMED 查證鐵則)。

## 7. Judge rubric(LLM-as-judge,Opus)

對每題輸出:
```jsonc
{ "qId":"q012",
  "factMatch": true,        // 有沒有對上 gold 的 FHIR 事實(主判準,非文字相似)
  "hallucination": false,   // 有沒有 bundle 外的 code/citation
  "complete": true,         // 有沒有答完
  "failingLayer": null,     // 失敗時標 ETCLOVG: Tooling/Context/Lifecycle/Verification...
  "note": "" }
```
judge 評「事實對不對」而非「像不像 Opus 的措辭」,避免懲罰合理的不同表述。

## 8. 指標計算 → 對應 ledger

跑完一輪輸出每模型的:gold-match accuracy、per-layer error rate、tool precision/recall、hallucination rate、empty/incomplete rate、avg steps、p95 latency、timeout rate、tokens/Q。回歸 = 對照上一版、由過轉不過的題數。全部 append 進 ledger。

## 9. 建議的腳本佈局(階段 0)

```
scripts/eval/
  gen-eval-set.mjs        # FHIR fuzz → eval-set.json
  run-oracle.mjs          # 產 gold answers(快取 gold.json)
  run-students.mjs        # 5 模型跑 eval → trajectories/*.json
  judge.mjs               # LLM-as-judge → verdicts.json
  compute-metrics.mjs     # → metrics.json,印 ledger 列(markdown)
.env.local                # OPENAI_API_KEY / GOOGLE_AI_API_KEY / ANTHROPIC_API_KEY(gitignored)
```
全部設計成冪等、可重跑(對齊本專案 Node 腳本慣例)。
