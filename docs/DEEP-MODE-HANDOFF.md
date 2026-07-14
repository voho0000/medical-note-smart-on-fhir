# Deep-mode Agent harness 交接

> 工作線狀態｜基準版本：v0.40.0｜更新：2026-07-14

## 一句話目標

用可重現、可量化的 eval 改善 Medical Chat Agent harness；不改模型權重，也不接受沒有 regression 數據的「感覺變好」。

## 已完成

- [評估規格](DEEP-MODE-EVAL-LOOP.md) 與 [ledger](DEEP-MODE-HARNESS-LEDGER.md)。
- 真實 Agent loop 已抽成 `src/infrastructure/ai/agent/run-deep-mode-agent.ts`。
- UI `useAgentChat` 呼叫同一 headless 核心；不再需要先做 React 解耦。
- 核心輸出 trajectory、citations、tool names 與 token usage。
- Production 16 個 FHIR tools 已共用畫面使用的 `ClinicalDataCollection`。
- `clinical-skill-tools.ts` 有 eGFR／NLM terminology 候選，只供私有 runner A/B。

## 尚未完成

- 本公開 repo 沒有 versioned eval set、oracle／judge／metrics scripts。
- Ledger v0 baseline 仍為 TBD。
- 沒有可引用的 before／after 指標，因此不能宣稱 harness 已因這條工作線改善多少。

## 接手順序

1. 讀 `run-deep-mode-agent.ts`、`useAgentChat.ts`、`fhir-tools.ts` 與 eval spec。
2. 在 private runner 固定 synthetic fixture、question set、gold evidence 與 model cohort。
3. 先跑「不改 production」的 v0 baseline，保存 commit、fixture hash、model ids、usage、latency 與 trajectory。
4. 驗證 judge：抽樣手動看通過／失敗，確認不是比文風。
5. 依最大 failing layer 選一個 scoped repair；一次只改一個變因。
6. 跑全量 regression、unit、E2E 與 loop gate。
7. 只有數據合格且人工批准才把候選 tool 或 prompt 接入 production。
8. 用實際 artifact 產生 ledger row；不要手填估計數字。

## 模型與 secrets

原始規格的 student cohort 是 GPT-5.4 Nano／Mini、Gemini 3.1 Flash-Lite／3 Flash Preview、Claude Haiku 4.5，Oracle／Judge 是 Claude Opus 4.8。每次執行仍須以當時 model registry 與 provider availability 明確記錄版本。

Keys 僅放 private runner 的 secret environment。不要依賴 app 的 `NEXT_PUBLIC_*` user-key storage 跑 headless eval，也不要把 `.env.local`、raw output 或真實病人資料提交到本 repo。

## 關鍵限制

- Private `medical-agent-harness` 的內部不是本 repo 的依賴；公開 app 只保留可 review 的共用核心與候選 tools。
- Live literature 題會隨時間變動，應和固定 clinical factual set 分開計分。
- Provider model 名稱相同也可能被後端更新；跨日期比較必須標註這個不確定性。
- Eval runner 能建議 patch，不能自動部署醫療行為變更。

## 完成定義

這條工作線只有在以下條件同時成立時才算完成一輪：固定 dataset、可重現 command、原始 trajectories、validated gold、judge QA、metrics、regression count、成本／延遲與人工決策都已保存，ledger 不再是 TBD。
