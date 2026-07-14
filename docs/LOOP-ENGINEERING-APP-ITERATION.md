# Loop engineering：app 自我迭代工作線

> 工作線現況｜基準版本：v0.40.0｜更新：2026-07-14

## 目標

讓 app 開發採用可驗證的 `goal -> act -> observe -> verify -> decide` 迴圈。Loop 必須有具體 acceptance criteria、真正的 verifier、預算、no-progress 偵測與人工決策；不能把「agent 持續修改」本身當成完成。

## A. 開發期迭代

目前已實作本 repo 的 verifier scaffold：

- `scripts/loop/gate.mjs`：依序執行 typecheck、lint、Jest 與選用 GitHub Pages build。
- `scripts/loop/goal.example.md`：小範圍、可驗證的 goal contract。
- `scripts/loop/log.mjs`：goal／start／done／note／stop journal。
- `scripts/loop/dashboard.mjs`：只綁 localhost 的進度與 gate dashboard。
- `.loop/last-gate.json`、`history.jsonl`、`journal.jsonl`：gitignored structured state。
- `LOOP_EXTERNAL_GATE_CMD`：接 out-of-repo verifier，只消費 exit code 與 output tail。

Gate 本身不會 spawn agent，也不會強制 max iterations／time／token；外部 loop driver 需要讀 verdict、比較 `failureSignature` 並執行停止條件。

詳見 [scripts/loop/README.md](../scripts/loop/README.md)。

## B. Runtime 自我改善

目前沒有讓 production app 自動修改 prompt、tools、model 或 clinical behavior。這是刻意的：醫療情境的低流量訊號容易誤導，且線上自我修改缺少可審核性。

未來若要做，最小前提：

- 只收必要、去識別化的 product telemetry。
- 不收 raw note、FHIR payload、AI prompt／answer 或 patient identifiers。
- 使用者／組織有 notice、合法基礎、退出與 retention policy。
- 任何行為變更先在固定 eval／staging 驗證，再由人類批准。
- Production 不從單一 thumbs-up 或少數 session 自動更新 clinical prompt。

可能的非 PHI event schema：feature invoked、success／timeout／cancel、result copied／dismissed、anonymous session id、app version、timestamp。實際導入前仍需 privacy／security review；目前 codebase 未 emit 這組 telemetry。

## 外部醫療品質閘門

Deep-mode Agent eval 是獨立工作線。它可透過 `LOOP_EXTERNAL_GATE_CMD` 回傳 pass/fail，但 dataset、oracle、judge 與私有 harness 不複製進 app loop。公開 repo 只保留可共同 review 的 `runDeepModeAgent()`、tools、測試與評估規格。

## 下一步

1. 為每個 loop run 保存 goal、commit、verdict 與 stop reason。
2. 在 loop driver 實作 max iterations、time/token budget 與連續相同 failure signature 的硬停止。
3. 對會改變臨床行為的目標，要求 external eval 與人工 approval。
4. 先用低風險工程目標驗證 loop protocol，再擴到 prompt／tool 變更。
5. 若加入 telemetry，先更新 Security、Privacy 與 retention 文件。

## Guardrails

- Loop 的終止條件不會擴大原任務授權。
- 不自動 push、release、改 secrets、改 production data 或部署醫療行為。
- 失敗 signature 相同時停止並報告，不反覆用相同方法燒預算。
- 遇到 test 無法代表臨床正確性的目標，不能只靠 `npm test` 宣告完成。
