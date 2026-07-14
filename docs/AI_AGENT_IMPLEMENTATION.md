# AI Agent 實作指南

> 現行規格｜基準版本：v0.40.0｜最後核對：2026-07-14

Medical Chat 只有一條 Agent 路徑。模型依使用者問題決定直接回答、查詢目前病人的 FHIR 資料，或搜尋即時醫學文獻。工具在瀏覽器端執行，讀取與畫面相同的 `ClinicalDataCollection`；FHIR access token、完整 Bundle 與 provider key 不交給模型。

## 元件關係

```text
MedicalChat
  -> useAgentChat
       -> buildAgentSystemPromptUseCase
       -> aiProviderFactory
       -> runDeepModeAgent
            -> Vercel AI SDK streamText
            -> FHIR tools (local/shared clinical snapshot)
            -> literature tool (Perplexity)
       -> UI events / chat store / Firestore autosave
```

| 層 | 位置 | 責任 |
|---|---|---|
| UI | `features/medical-chat/` | 輸入、串流訊息、停止、範本、追問、history |
| Application | `src/application/hooks/ai/` | 將 clinical collection 與 auth 組成 tools |
| Core | `src/core/use-cases/agent/` | system prompt 與 tool result 後處理 |
| Infrastructure | `src/infrastructure/ai/agent/run-deep-mode-agent.ts` | headless agent loop、streaming、trajectory |
| Infrastructure | `src/infrastructure/ai/tools/` | tool schema、filter、execute、PII scrub |
| Infrastructure | `src/infrastructure/ai/factories/ai-provider.factory.ts` | model 到 OpenAI／Gemini／Claude provider 的選擇 |

## 為什麼在 client 執行 tools

- SMART access token 留在 `fhirclient` 的瀏覽器 session。
- Local Bundle 只存在使用者裝置，沒有 server 可查。
- UI 與 Agent 共用同一份 React Query／local collection，答案不會因重查時點不同而漂移。
- Tool 回傳可以在送往模型前統一刪除 PII。

這不代表資料不會離開裝置：tool 的去識別化結果與使用者問題仍會傳到所選 AI provider 或 MediPrisma proxy。UI 必須讓使用者知道這個邊界。

## Agent loop

`runDeepModeAgent()` 是 React UI 與 headless eval 共用的核心函式。每次執行最多三個 round：

1. Main：`streamText()` 設定 `stopWhen: stepCountIs(10)`，AI SDK 自動把 tool result 回送模型，可連續呼叫多個工具。
2. Follow-up：若有 tool result 但模型沒有輸出文字，將結果整理成摘要後要求回答；此 round 仍可呼叫更多工具。
3. Synthesis：若 follow-up 又只有 tool result，最後用無 tools 的純文字 round 合成答案。

每個 round 都經 `withIdleTimeout()`；預設 60 秒沒有新 token／event 便 abort。UI 的停止按鈕與病人／bundle 切換共用同一個 `AbortController`。

核心回傳：

```ts
interface RunDeepModeAgentResult {
  answer: string
  toolCalls: string[]
  citations: string[]
  trajectory: AgentTrajectoryStep[]
  usage: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
  }
}
```

UI 另外接收 `status`、`content`、`tool-call`、`tool-result` 與 `final` events，將高頻文字更新節流到 100ms。

## 正式 tools

### FHIR tools（16 個）

| 群組 | Tools |
|---|---|
| 病人／總覽 | `queryPatientInfo`, `getDataOverview` |
| 就診 | `queryEncounters`, `getRecentVisits`, `getEncounterDetails`, `listEncounterDepartments` |
| 診斷 | `queryConditions` |
| 報告與處置 | `queryObservations`, `queryDiagnosticReports`, `searchObservationByName`, `listAvailableObservationCodes`, `queryProcedures` |
| 用藥與免疫 | `queryMedications`, `getActiveMedicationList`, `queryAllergies`, `queryImmunizations` |

工具定義在 `src/infrastructure/ai/tools/fhir-tools.ts`，schema 在 `fhir-tool-schemas.ts`。它們支援日期、狀態、類別、部門、院所、異常值與 limit 等 filter；回傳結構化的 `{ success, summary, count, data }`。

`queryPatientInfo` 只回傳性別與年齡，不回傳姓名、id 或完整生日。其他 tools 會在回傳前經 `scrubPii()` 與 `scrubFreeText()`。

### 文獻 tool（1 個）

`searchMedicalLiterature` 使用 Perplexity：

- 支援 `basic`／`advanced` 搜尋深度。
- 回傳內容與 citation URLs。
- 搜尋失敗時明確要求模型不要用訓練記憶假裝成即時搜尋。
- 可使用自備 Perplexity key，或在可用的 Firebase session 下走 proxy／quota。

### 尚未上線的 eval 候選 tools

`clinical-skill-tools.ts` 目前包含 CKD-EPI 2021 eGFR 與 NLM terminology resolver。這兩個工具只供 private eval harness A/B，未加入正式 `createFhirTools()`；文件與 UI 不應宣稱已提供。

## Provider 與存取路徑

模型清單由 `src/shared/constants/ai-models.constants.ts` 管理。流程：

1. 使用者在 chat 內選 model；偏好存入 chat slot。
2. `gateModelForKeys()` 檢查該 provider 的 user key。
3. premium model 缺 key 時降級至 `DEFAULT_MODEL_ID`。
4. 有 user key：瀏覽器直接呼叫 provider。
5. 無 user key：`aiProviderFactory` 走對應 Firebase proxy；請求加入 Firebase ID token 與可用的 App Check token。

Agent mode 與一般 summary 共用 provider factory，但 Agent 自己掌控 multi-step stream，因此 model gating 也在 `useAgentChat` 額外執行。

## 隱私與安全邊界

送出前依序處理：

- 使用者訊息：保留畫面與 history 原文；送往 AI 的副本以載入病人的姓名／id literals 遮罩。
- Tool payload：移除 id、birthDate、provider display 等結構欄位，再清理 report／document 內的自由文字識別內容。
- Proxy：移除 upstream provider Authorization／API key header，改用 Firebase token；自備 key 模式不經 owner-funded proxy。
- Firestore history：不儲存圖片 data，只保存文字訊息、model id、agent states 與 reply reference。

剩餘限制：自由文字去識別化是 best-effort，不能保證找出所有 PHI；使用者不得把不必要的識別資料輸入 AI。

## 新增或修改 tool

1. 在 `fhir-tool-schemas.ts` 建立嚴格且有描述的 Zod input schema。
2. 在 `createFhirTools()` 新增 tool，盡量使用 `ClinicalDataCollection` 而非重新打 FHIR server。
3. 回傳前必須經 `scrub()`。
4. 更新 `AGENT_TOOL_NAMES` 與中英文 i18n display name。
5. 在 system prompt 說明何時使用、何時不要使用。
6. 補純函式 filter／tool execute 測試；日期、limit、無資料與錯誤都要覆蓋。
7. 執行 Agent regression／eval，確認 tool precision、hallucination 與 latency 沒有退步。

## 測試

- Unit：`__tests__/infrastructure/ai/tools/`、`__tests__/core/use-cases/agent/`。
- Hook／UI：medical-chat、chat store、autosave 與 model gating tests。
- E2E：`ai-chat-agent-only.spec.ts`、`ai-chat-stream.spec.ts` 使用攔截的 deterministic stream，不打真實模型。
- Headless eval：規格見 [DEEP-MODE-EVAL-LOOP.md](DEEP-MODE-EVAL-LOOP.md)，ledger 不得填未實測數字。

常用驗證：

```bash
npx tsc --noEmit
npm run lint
npm test -- --runInBand
npm run test:e2e
```

## 已知限制

- Tool 結果來自已載入 collection；資料本來缺漏時，Agent 不能補出不存在的紀錄。
- Local 與 SMART 都受 mapper／FHIR server 資料品質影響。
- 文獻工具是搜尋與摘要服務，不等同系統性文獻回顧。
- 目前最多 10 AI SDK steps，另有 follow-up／synthesis round；複雜問題可能需拆問。
- Tool-level PII scrub 是降低風險，不是正式匿名化認證。

## 相關文件

- [Medical Chat](MEDICAL_CHAT.md)
- [Architecture](ARCHITECTURE.md)
- [Security](SECURITY.md)
- [Deep-mode eval](DEEP-MODE-EVAL-LOOP.md)
