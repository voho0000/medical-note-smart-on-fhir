# Deep-mode Agent eval loop

> 評估規格與現況｜基準版本：v0.40.0｜最後核對：2026-07-14

目標是用可重跑的 teacher–student eval 量化並降低 Medical Chat Agent 的錯誤率。這不是 fine-tuning；改進對象是 prompt、tools、context、lifecycle、verification 與 fallback 等 harness。

成績見 [DEEP-MODE-HARNESS-LEDGER.md](DEEP-MODE-HARNESS-LEDGER.md)。Ledger 目前仍無可公開重現的 baseline，因此所有主指標保持 `TBD`。

## 目前 codebase 狀態

已完成：

- Agent loop 已從 React hook 抽成 `src/infrastructure/ai/agent/run-deep-mode-agent.ts`。
- `useAgentChat` 與 private eval runner 可共用同一個 `runDeepModeAgent()`。
- Headless result 包含 answer、tool calls、citations、完整 trajectory 與三種 token usage。
- Main round 使用 `stepCountIs(10)`；follow-up／synthesis、citation merge、error chunk 與 idle watchdog 都在共用核心。
- 正式 app 有 16 個 FHIR tools；`clinical-skill-tools.ts` 另提供 eGFR 與 NLM terminology 兩個 A/B 候選，未註冊到 production Agent。

尚未在本 repo 完成：

- 可公開的 eval-set generator、oracle、student runner、judge 與 metrics scripts。
- 第一次可重現的 baseline 與固定 dataset hash。
- 自動把 metrics 寫入 ledger 的流程。

Private `medical-agent-harness` 可以呼叫共用核心，但其內部、資料與結果不屬於本公開 repo。任何 production tool 變更仍須在這裡有測試與 review。

## 評估迴圈

```text
versioned synthetic FHIR fixtures
  -> deterministic question set + expected evidence
  -> oracle draft + programmatic evidence checks
  -> student models run shared runDeepModeAgent()
  -> trajectories + usage + latency + errors
  -> judge facts against evidence, not prose similarity
  -> ETCLOVG diagnosis
  -> one scoped repair
  -> regression rerun + human approval
  -> append measured result to ledger
```

一次只改一個可解釋變因。沒有主指標提升或產生不可接受回歸時，patch 應標成 reverted，不得只保留「感覺比較好」的修改。

## 模型 cohort

2026-06-28 首輪規劃的 student cohort：

- `gpt-5.4-nano`
- `gpt-5.4-mini`
- `gemini-3.1-flash-lite`
- `gemini-3-flash-preview`
- `claude-haiku-4-5-20251001`

Oracle／judge 規劃為 `claude-opus-4-8`。這是實驗設計，不是永遠固定的產品清單。每次 run 必須保存 model id、provider、日期與 harness commit；若模型版本或 judge 改變，不可把數字直接和前一列當同條件比較。

Keys 只能放在 gitignored、server-side 的 eval environment。不要把真實 key、request body 或 patient fixture 寫入 trajectory artifact。

## Eval set

建議每個 baseline 使用 30–50 題，並 version control：

- fixture id／hash；只使用 synthetic／合法去識別化資料。
- question、category、required resources。
- expected facts 與直接 evidence references。
- expected／forbidden tool calls（只在可確定時）。
- 是否需要 live literature；預設 clinical factual set 不依賴網路。

涵蓋：資料總覽、就診、單次 encounter detail、診斷、用藥／過敏、檢驗最新值與趨勢、報告、跨資源問題、缺資料、同名 analyte、單位／檢體歧義、tool failure、empty result 與 timeout。

Fuzz 應是受控 fixture variants，不在每次 run 隨機改資料；否則 before／after 無法比較。

## Trajectory

共用核心產生：

```ts
interface AgentTrajectoryStep {
  round: number
  kind: 'tool-call' | 'tool-result' | 'text'
  toolName?: string
  input?: unknown
  result?: unknown
  text?: string
}
```

Runner 另記錄：

```jsonc
{
  "runId": "...",
  "commit": "...",
  "fixtureHash": "...",
  "questionId": "q012",
  "model": "gpt-5.4-nano",
  "answer": "...",
  "toolCalls": ["searchObservationByName"],
  "trajectory": [],
  "citations": [],
  "usage": { "inputTokens": 0, "outputTokens": 0, "totalTokens": 0 },
  "latencyMs": 0,
  "error": null
}
```

任何可能含 PHI 的 tool result 必須在持久化前 scrub；最好讓 eval fixture 本身就完全 synthetic。

## Gold 與 judge

Oracle 不是事實來源。Gold 必須：

1. 引用 fixture 中存在的 resource id／path。
2. 由 deterministic checker 驗證提及的值、日期、code 與 evidence。
3. 對「資料不存在」問題驗證確實無符合 resource。
4. 對文獻題保存 URL、檢索日期與可接受 claim，而非只保存長篇 oracle prose。

Judge 評估 JSON：

```jsonc
{
  "questionId": "q012",
  "factMatch": true,
  "hallucination": false,
  "complete": true,
  "evidenceSupported": true,
  "failingLayer": null,
  "note": ""
}
```

Judge 比對結構化 facts／evidence，不比較文風。應抽樣做人類複核，並用 adversarial cases 驗 judge 不會把流暢錯答判過。

## 指標

主指標：

- Gold fact-match accuracy。
- Evidence-supported answer rate。

次指標：

- Tool precision／recall。
- Hallucination rate。
- Empty／incomplete rate。
- Per-layer error rate（ETCLOVG）。
- Average steps、p95 latency。
- Timeout／error-chunk rate。
- Tokens／question。
- Regressions：上一版通過、本版失敗的固定題數。

每個百分比必須同時報分母與 95% confidence interval 或至少 raw count；小樣本不要只看單一百分比。

## 建議 runner 介面

公開 repo 未提供以下 scripts；若未來加入，建議：

```text
scripts/eval/
  build-eval-set.mjs
  validate-gold.mjs
  run-students.mjs
  judge.mjs
  compute-metrics.mjs
```

要求：

- 冪等、可 resume、每題獨立 artifact。
- 支援 overall timeout、concurrency cap 與 rate-limit backoff。
- 保存 commit、fixture hash、prompt/tool schema hash、model id。
- Log 不含 key／token／真實 PHI。
- 只有 `compute-metrics` 產生 ledger row；不得人工抄估計值。

## Production promotion gate

候選 tool／prompt／lifecycle 修正進 production 前：

- 固定 eval set 的主指標改善。
- Regression 不超過事先定義門檻；醫療事實題預設 0。
- Unit／integration／E2E 與 loop gate 全綠。
- 延遲、tokens 與 provider 相容性可接受。
- 安全、PII 與 UX review 完成。
- 人類明確批准，不由 runner 自動部署。

## 相關文件

- [Agent implementation](AI_AGENT_IMPLEMENTATION.md)
- [Handoff](DEEP-MODE-HANDOFF.md)
- [Ledger](DEEP-MODE-HARNESS-LEDGER.md)
- [Loop verifier](../scripts/loop/README.md)
