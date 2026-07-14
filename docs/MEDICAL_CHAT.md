# Medical Chat 功能指南

> 現行規格｜基準版本：v0.40.0｜最後核對：2026-07-14

Medical Chat 是右側面板的臨床 Agent 對話。它沒有「普通模式／deep mode」切換：每一則訊息都走同一個 Agent loop，由模型自行決定直接回答、查 FHIR 或搜尋醫學文獻。

## 使用者功能

- 串流 Markdown 回覆，支援停止生成、複製與回覆特定訊息。
- OpenAI、Gemini、Claude model picker；chat 的模型偏好獨立保存。
- 16 個 FHIR tools 與 Perplexity 文獻搜尋。
- `/` slash menu、內建／自訂 chat templates、Prompt Gallery。
- 每次回答完成後產生可點選的下一步建議。
- 語音錄音與 Whisper 轉錄。
- 圖片上傳、預覽與送出前媒體同意。
- 可編輯／重設 system prompt。
- 可展開成全螢幕 overlay。
- 登入後的對話自動保存與跨裝置 history。
- 無痕對話不保存；訪客訊息只留在目前記憶體。

## 執行流程

```text
文字／語音／圖片
  -> MedicalChat local UI state
  -> useAgentChat
  -> scrub user-authored text
  -> runDeepModeAgent
       -> direct response OR FHIR tools OR literature tool
  -> throttled stream updates
  -> final message + follow-up suggestions
  -> Firestore autosave（登入且非無痕）
```

病人或本地 bundle 改變時，chat 會 abort 進行中的生成、清除訊息與目前 session pointer，避免上一位病人的內容留在下一個 context。

## Model 與 API 存取

模型清單以 `src/shared/constants/ai-models.constants.ts` 為準。Chat 在 feature header／expanded toolbar 內選 model，不在 Settings 選。

- 有該 provider 的 user key：瀏覽器直接呼叫 provider。
- 無 key：有可用 Firebase 匿名／登入 session 時走 owner-funded proxy。
- premium pick 沒有對應 key：執行時降級到免費 default，訊息保存實際 model id。
- 沒有 user key、Firebase session 或 proxy URL：顯示設定提示，不啟動串流。

Settings 只管理 OpenAI、Gemini、Claude、Perplexity keys 與保存方式。新使用者預設存於加密的 `sessionStorage`；明確開啟「記住此裝置」才改用 `localStorage`。

## Agent tools

FHIR tools 由 `useFhirTools()` 建立，讀取目前 React Query／local bundle 的 `ClinicalDataCollection`。工具包含病人總覽、就診、診斷、檢驗、報告、處置、用藥、過敏與疫苗等查詢。

文獻工具由 `useLiteratureTools()` 建立，使用 Perplexity 並回傳來源 URL。搜尋失敗會要求模型明確告知失敗，不能捏造 citation。

完整 loop 與 tool 清單見 [AI_AGENT_IMPLEMENTATION.md](AI_AGENT_IMPLEMENTATION.md)。

## Templates 與 slash menu

Chat templates 以 audience 分為 `medical` 與 `patient`，欄位為：

```ts
interface ChatTemplate {
  id: string
  label: string
  content: string
  shortcut?: string
  order: number
  audience: 'medical' | 'patient'
}
```

輸入 `/` 會依 shortcut 顯示 menu；選取後插入內容，不會自動送出。範本管理 drawer 可新增、編輯、排序、刪除與重設：

- 已登入：Firestore `users/{uid}/chatTemplates` 即時同步。
- 未登入：localStorage。
- 舊 localStorage 內容在登入後做一次 migration，成功後移除本機副本。

Prompt Gallery 的 `chat` prompt 可加入個人模板；同時支援 `summary` 的 prompt 會在使用時要求選擇用途。

## 語音與圖片

### 語音

`useVoiceRecording()` 經瀏覽器 MediaRecorder 錄音，`TranscriptionService` 使用 Whisper user key 或 proxy。完成後只把轉錄文字插入輸入框，由使用者確認後再送出。

### 圖片

圖片轉成 chat image payload，只在本次 AI 請求使用。Firestore repository 明確不保存完整圖片或縮圖。首次傳送媒體前顯示同意對話框；這是資料告知，不等同 provider 的法規或保留政策保證。

## 對話歷史

### 儲存條件

只有以下條件全部成立才自動保存：

- 使用者以非匿名帳號登入。
- 不在 temporary／incognito mode。
- 至少有一則訊息。

Auto-save 預設 debounce 5 秒，並等待 assistant 離開 thinking／tool 狀態。開始新對話前會先 best-effort force save。

### Firestore 路徑與資料

```text
users/{userId}/chats/{chatId}
```

```ts
interface ChatSessionEntity {
  id: string
  userId: string
  fhirServerUrl: string
  patientId: string
  title: string
  summary?: string
  messages: ChatMessage[]
  createdAt: Date
  updatedAt: Date
  messageCount: number
  tags?: string[]
}
```

Local bundle 對話使用 `local-bundle` 作為 server key，並相容舊版的 `no-fhir-server`。History query 同時以 user id、patient id、FHIR server key 隔離並按 `updatedAt` 排序。

保存的 message 欄位包含 id、role、content、timestamp、可選 modelId、agentStates 與 replyTo；影像不寫入 Firestore。

### Firestore 規則與 index

Rules 與 production index 不在本 repo，而在 `firebase-smart-on-fhir` 後端 repo。最低要求：

- 使用者只能讀寫 `users/{uid}` 下與自己 uid 相同的資料。
- `sharedPrompts` 的 create／update／delete 要驗證 author ownership 與必要欄位。
- History composite query 需要支援 patientId、fhirServerUrl 與 updatedAt。

不要把本文件的示意規則直接視為已部署狀態；以後端 repo 與 Firebase Console 為準。

## 標題

新 session 先以第一則 user message 產生截短標題（中文 20 字、英文 40 字）。第一輪回答後可由低成本 AI helper 產生更好的 title；只改 title 時不更新 `updatedAt`，避免對話排序因 cosmetic change 改變。

## 隱私行為

- UI 與 Firestore history 保留使用者輸入原文。
- 送給 AI 的 user message 副本會依目前病人的姓名／id literals 做自由文字遮罩。
- FHIR tool 回傳移除結構化 id、DOB、provider display，並 scrub report／document text。
- History 可能包含 PHI；登入與 Firestore 同步前應讓使用者了解組織政策。
- 無痕模式只避免 Firestore 保存，不會阻止訊息在當次請求傳到 AI provider。

## 主要檔案

| 檔案 | 責任 |
|---|---|
| `features/medical-chat/components/MedicalChat.tsx` | feature orchestration |
| `features/medical-chat/hooks/useAgentChat.ts` | provider、prompt、Agent events 與 UI mapping |
| `src/infrastructure/ai/agent/run-deep-mode-agent.ts` | headless multi-round loop |
| `src/infrastructure/ai/tools/fhir-tools.ts` | FHIR tools |
| `src/application/hooks/chat/use-auto-save-chat.hook.ts` | Firestore autosave |
| `src/infrastructure/firebase/repositories/chat-session.repository.ts` | chat persistence |
| `src/application/providers/chat-templates.provider.tsx` | template state／migration |
| `src/infrastructure/firebase/template-sync.ts` | template Firestore sync |

## 測試重點

- Agent 只有單一路徑，model gating 正確。
- SSE／provider stream 可逐步 render，idle timeout 會結束 spinner。
- Tool call 與 literature citations 不因 follow-up round 遺失。
- 切換病人／bundle 會 reset 並 abort。
- 無痕或訪客不寫 Firestore。
- History 依 patient/server 隔離，local legacy key 可讀。
- Slash template、gallery、圖片 consent、語音錯誤與 responsive toolbar。

```bash
npm test -- --runInBand
npm run test:e2e
```

## 疑難排解

### 一直停在思考中

確認 proxy URL、Firebase session／App Check、user key 與瀏覽器網路。正式預設 idle timeout 60 秒；若沒有出現逾時訊息，檢查 stream 是否有持續發 event 但無正文。

### History 是空的

確認使用者不是匿名／訪客、沒有開無痕、已載入同一 patientId 與 FHIR server key，並檢查後端 Rules／index。

### 文獻搜尋不可用

確認 Perplexity key 或可用的 proxy quota。一般 model 回答不代表即時搜尋成功；只有 tool 回傳的 URLs 才能當 live literature citation。

### 圖片或語音失敗

確認瀏覽器權限、媒體格式、HTTPS／localhost secure context，以及 whisper／model proxy 設定。

## 相關文件

- [AI Agent](AI_AGENT_IMPLEMENTATION.md)
- [Prompt Gallery](PROMPT_GALLERY.md)
- [Security](SECURITY.md)
- [Privacy policy](../PRIVACY_POLICY.md)
