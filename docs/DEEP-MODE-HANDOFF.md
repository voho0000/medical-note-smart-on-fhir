# 交接報告 — deep-mode harness 改善(換機接手用)

寫於 2026-06-28,筆電 session。下一個 session 會在**家裡 server** 接手執行。本檔讓你冷啟動。

## 一句話目標
用 loop / harness engineering 降低 deep-mode AI agent 的錯誤率,**全程用量化指標證明改善**。不是模型訓練(不改權重),改的是 harness。

## 背景概念(已查證)
- **Loop engineering**:設計「會自動 prompt / 檢查 / 記憶 / 重跑」agent 的系統;循環 = reason→act→observe→decide,要有可驗證的 /goal 與停止條件。
- **Harness engineering**:模型外那層 runtime(工具派發/context/驗證/生命週期);ETCLOVG 七層(Execution, Tooling, Context, Lifecycle, Observability, Verification, Governance)。研究共識:決定生產表現的是 harness 不是模型(LangChain 只改 harness:52.8%→66.5%)。

## 已完成(這個 session 產出的檔案)
1. [docs/DEEP-MODE-EVAL-LOOP.md](DEEP-MODE-EVAL-LOOP.md) — eval 迴圈完整規格(架構、trajectory schema、judge rubric、腳本佈局)。**接手請先讀這份。**
2. [docs/DEEP-MODE-HARNESS-LEDGER.md](DEEP-MODE-HARNESS-LEDGER.md) — 量化成績單,10 指標 + 逐圈迭代表(目前 v0 = TBD)。
3. 記憶 `memory/project_deep_mode_harness.md` — 跨 session 約定。

## 已拍板的決定
- **Student = 全部 5 個跑排行榜**:`gpt-5.4-nano`、`gpt-5.4-mini`、`gemini-3.1-flash-lite`、`gemini-3-flash-preview`、`claude-haiku-4-5-20251001`。
- **Oracle + Judge = `claude-opus-4-8`**。
- **執行分工**:Claude 寫腳本,**使用者自己在 server 跑**,把結果貼回給 Claude 解讀填 ledger。
- **Key**:放 gitignored `.env.local` —— `OPENAI_API_KEY`、`GOOGLE_AI_API_KEY`、`ANTHROPIC_API_KEY`。三把。

## ⚠️ 最重要的技術前提
agent loop 目前綁在 React hook `features/medical-chat/hooks/useAgentChat.ts`,node 跑不動。
**階段 0 第一步 = 把它抽成 headless 核心函式**(`run-deep-mode-agent.use-case.ts`),讓 UI 與 eval 腳本共用同一套工具/prompt——否則 eval 的是假 harness。細節見 EVAL-LOOP 規格 §3。

## 接手後的下一步(順序)
1. 在 server `npm install`、確認 node 能跑專案腳本(參考既有 `scripts/*.mjs`、`scripts/seed-prompts.ts`)。
2. 建 `.env.local` 放三把 key(別 commit;確認在 `.gitignore`)。
3. 與 Claude 一起做**階段 0**:抽 headless agent 核心 → 建 `scripts/eval/` 五支腳本(規格 §9)。
4. 跑首輪 baseline:gen-eval-set → run-oracle → run-students(×5)→ judge → compute-metrics。
5. 把 metrics 貼回,Claude 填 ledger v0 baseline。
6. 看 per-layer 錯誤分布,挑最大宗那層做第一個 scoped repair(階段 2),重跑量 Δ,填 v1。

## 開新 session 怎麼喚起脈絡
記憶會自動載入 `project_deep_mode_harness`。開場可直接說:
> 「接手 deep-mode harness 計畫,讀 docs/DEEP-MODE-HANDOFF.md 和 DEEP-MODE-EVAL-LOOP.md,從階段 0 開始。」

## 注意事項 / 待確認
- demo bundle 來源:`scripts/build-demo-bundle.mjs`(合成、去識別)。確認 server 上能產出。
- 成本:5 student × ~40 題 + oracle + judge,cheap 模型,單輪約數美元;留意 Nano 大 context 會慢([streaming-freeze 記憶](../README.md))。
- 本計畫的檔案改動屬獨立工作線;依使用者慣例,push/commit 前要先列 `origin/master..HEAD` 並徵得同意(勿與其他工作線一起推)。
- 目前工作樹另有未提交變更:`scripts/seed-prompts.ts`(M)——與本計畫無關,接手時別誤帶。
