# 協作者加入前的 repo 清理審核單

日期：2026-09-08。基準：`master` / `14997e13`，package 版本 `0.51.0`。
狀態：**擁有者已逐群核准 A–C、D1–D19，共 22 群完成；後續問題修正與安全卡重複重試移除也已核准、實測完成。2026-09-09 獲准分批提交、推送並發版。** 以下審核內容保留提案時點，執行結果見文末。

## 建議審核方式

可逐批核准，例如「同意 A、B；C 先處理文件；D 暫留」。只核准指定範圍，不連帶授權刪除依賴、測試、臨床入口或其他工作線。實作時若引用關係改變，停止該項刪除並重新提報。

| 批次 | 建議處置 | 範圍與影響 | 建議 |
|---|---|---|---|
| A | 刪除預設素材與空殼測試產生器 | 下列 6 檔；5 個 public URL 將不再存在 | 可先核准 |
| B | 刪除 4 個空殼測試 | 不含真正有驗證的測試；測試數量會下降 | 可先核准 |
| C | 文件分層、補協作入口、WIP 隔離 | 以下明列的歸檔與隔離方案；保留內容 | 建議核准後執行 |
| D | 分群移除死碼候選 | 附錄逐檔名單；需完成逐項確認與回歸 | 逐項／逐群審核，不建議整批盲刪 |

## A：6 個優先刪除候選

- `public/next.svg`
- `public/vercel.svg`
- `public/globe.svg`
- `public/file.svg`
- `public/window.svg`
- `scripts/generate-tests.ts`

證據：對全部 Git 追蹤且可解碼的文字檔搜尋上述 5 個素材檔名，排除素材本身，均無命中。這代表 repo 內無引用，不能排除 repo 外直接引用 public URL；刪除會讓這些 URL 失效。保留 `icon.svg`、`favicon.svg`、臨床指引 PDF、demo bundle。

`generate-tests.ts` 的範本只產生 `expect(true).toBe(true)`，不載入被測實作；未列入 package scripts。建議刪除以免協作者誤用它製造看似有覆蓋率的測試。此次未執行產生器。

## B：4 個沒有實際驗證的測試

- `__tests__/application/hooks/use-data-categories.hook.test.tsx`
- `__tests__/application/hooks/patient/use-patient-query.hook.test.tsx`
- `__tests__/application/hooks/use-reports-row-count.hook.test.tsx`
- `__tests__/core/entities/clinical-data.entity.test.ts`

已讀取全文：每檔只有一個無條件 `expect(true).toBe(true)`，沒有載入被測程式。刪除空殼不代表對應功能不需要測試；既有功能的行為覆蓋應另查。`__tests__/shared/utils/id.utils.test.ts` 雖也出現相同字串，但不能據此整檔刪除，不在本批範圍。

## C：文件整理與協作／WIP 方案

### 現行文件入口

`docs/README.md` 仍標示 v0.43.0、2026-07-22，落後目前版本。建議更新索引，分為現行規格、決策／稽核紀錄、實驗、待議規劃；保留根目錄 README、DESIGN、AGENTS、LICENSE、PRIVACY_POLICY 與完整應用說明。

發現兩個可核實的文件漂移：

- `features/feedback/README.md` 說 `FeedbackButton` 掛於 `HeaderOverflowMenu`；實際 `DisplaySettings` 直接使用 `FeedbackDialog`。先修正說明，不能因此刪除整個 feedback 功能。
- `docs/MEDICAL_CHAT.md` 說語音經 `TranscriptionService`；正式 `MedicalChat` 使用 `useVoiceRecording`，後者未引用該 service。更新為實際呼叫路徑。

新增 `CONTRIBUTING.md` 的具體內容：Node 24（與 CI 一致）、私有套件存取方式連到 `docs/personalization-private-packages.md`、本機設定連到 `.env.example`、依賴更新與 lockfile 規則、測試／lint／建置指令、一條工作線一個 branch/worktree、PR 說明與臨床 visibility gate 要求。不得將真實金鑰或病人資料納入範例。

### 文件歸檔範圍（保留原文，不刪除）

以下既有文件建議搬到 `docs/history/`，原檔名不變，同步修正 repo 內連結；搬移前重新確認相對連結與外部公開連結是否需保留轉址說明：

- `docs/AI-MODEL-ATTRIBUTION-AUDIT-2026-09-03.md`
- `docs/AUDIT-2026-08-15.md`
- `docs/BRIDGE-LOINC-REQUEST-CALCULATOR-2026-07-03.md`
- `docs/BRIEFING-PANEL-DESIGN-2026-07-04.md`
- `docs/LAB-FORMAT-EXPERIMENT-2026-07-12.md`
- `docs/LOOP-ENGINEERING-PROCESS-REVIEW-2026-07-12.md`
- `docs/MEDICAL-SUMMARY-AUDIT-2026-07-12.md`
- `docs/MEDICATION-HISTORY-SCOPE-EXPERIMENT-2026-07-15.md`
- `docs/PROMPT-GALLERY-AUDIT-2026-09-03.md`
- `docs/REPORT-FORMATTING-AUDIT-2026-09-07.md`

歷史紀錄只標示日期與適用版本，不把當年結論改寫成現在的結果。`USAGE-ANALYTICS-PLAN-2026-09-03.md`、`DEEP-MODE-*` 先保留位置並標註狀態；PLAN / HANDOFF 命名不足以證明未實作或過期。

### WIP 工作線

1. **範本分享與 demo 範例輸出**：目前已有 prompt-gallery 元件、services、types、tests、right-feature-tour 與兩個語系檔的未提交變更，以及新的 demo-example-context service / test。視為同一組待確認的功能工作；不在清理中順手提交、還原、stash 或搬走。正式隔離前逐段核對共用語系與導覽變更的歸屬，再搬到專用 branch/worktree；原工作目錄的清除屬另外需確認的動作。
2. **門診流程規劃**：以下 7 個未追蹤文件建議搬到 `docs/plans/outpatient/`，原檔名保留，新增短索引註明「規劃文件，非已上線功能」：

- `docs/AGENTIC-OUTPATIENT-INFRASTRUCTURE-2026-09-07.md`
- `docs/CONVERSATIONAL-INTAKE-PLAN-ZH-TW-TAIGI-2026-09-06.md`
- `docs/CONVERSATIONAL-INTAKE-SURVEY-2026-09-06.md`
- `docs/DEPT-PREVISIT-SUMMARY-REQUIREMENTS-DRAFT-2026-09-06.md`
- `docs/OUTPATIENT-REENGINEERING-TASKFORCE-AGENDA-DRAFT-2026-09-07.md`
- `docs/PREVISIT-QUESTIONNAIRE-REQUIREMENTS-DRAFT-2026-09-06.md`
- `docs/PREVISIT-WORKFLOW-INTEGRATION-REQUIREMENTS-V1-2026-09-06.md`

3. **本機產物**：`output/` 目前有 4 個未追蹤檔（3 JSON、1 DOCX），但 `.gitignore` 只列 `/outputs/` 等目錄，沒有 `/output/`。建議新增精確的 `/output/` 忽略規則，保留本機檔案；本次只統計檔名／副檔名，沒有檢視或判定資料內容。`scripts/align-reconstructed-fhir-bundle.mjs` 是未追蹤腳本，保留並待擁有者決定工作線。
4. **既有實驗**：`scripts/experiments/` 已有 results 忽略規則。保留實驗入口並新增說明索引，列用途、輸入、輸出及執行方式；不因不在 npm scripts 就刪除。`tsconfig.json` 使用廣泛 include，搬到 experiments 並不自動排除型別檢查；本次不建議透過排除檢查掩蓋 WIP 問題。
5. **外部評測使用的候選工具**：`src/infrastructure/ai/tools/clinical-skill-tools.ts` 註明供私有 medical-agent-harness A/B 使用，正式 app 不註冊屬刻意設計。先保留原路徑、加實驗索引；若未核對外部 runner 就搬移，可能破壞跨 repo 引用。

### 不能當成重複垃圾的內容

- `docs/architecture-diagram.html` 與 `public/architecture-diagram.html`：文件說兩者相同，但實際一份寫 58 個計算機、一份寫 57。保留發布 URL；後續核對正確內容，再以 build 複製與一致性檢查維護，不直接刪其中一份。這項涉及渲染文件，實作時先依 repo 規則讀 DESIGN 與 UI skill。
- `vendor/`：包含實際被使用的 SDK 與藥品詞彙資料，不能以大檔為由移除；NOTICE 與整合文件保留。
- `public/clinical-guidelines/`、demo bundle：具有產品用途，排除清理。
- Beta、試辦 care packs、diagnosis / allergies registry entries：不能因目前部分路徑不顯示就視為 WIP 刪除。任何改變須依 `docs/LAUNCH-ROUTE-GATES.md` 逐路徑審核。

## D：死碼候選與保留例外

方法：使用本機 TypeScript parser 解析 import、re-export、字串 dynamic import／require、`new URL()` worker 引用，以 5 個 Next page/layout/route 為入口，透過 tsconfig alias 解析依賴。涵蓋追蹤程式及未追蹤的程式變更，避免漏掉當前 WIP 消費端。另記錄 tests/scripts 引用；排除 3 個本來就不會從 app 入口到達的測試檔。

**下表是檔案層級候選，不是已證明可以全部刪除。** 未做全 repo 外部 consumer 核對，也不把檔案可到達等同於所有 exports 都有使用。手動腳本有非字串 require，不能單靠靜態圖證明死碼。

建議次序：獨立且零引用的舊 hook／DTO → 舊聊天與轉錄完整鏈 → 有實質測試的 utility/use-case → barrel 對外介面。含臨床 UI 的候選需先檢查正式入口仍存在且行為不變；若會隱藏任何 surface，須另列 surface 與 route 取得核准。

| 檔案 | 已解析的直接引用者 | 處置建議 |
|---|---|---|
| `components/ui/separator.tsx` | repo 內未解析到 | 候選；逐項確認後刪除 |
| `features/clinical-summary/index.ts` | repo 內未解析到 | barrel；先確認公開／外部使用，再決定 |
| `features/clinical-summary/patient-info/components/LoadingSkeleton.tsx` | repo 內未解析到 | 候選；逐項確認後刪除 |
| `features/clinical-summary/reports/hooks/useReports.ts` | repo 內未解析到 | 候選；逐項確認後刪除 |
| `features/clinical-summary/reports/utils/fhir-translations.ts` | repo 內未解析到 | 候選；逐項確認後刪除 |
| `features/clinical-summary/visit-history/components/NoteItem.tsx` | repo 內未解析到 | 候選；逐項確認後刪除 |
| `features/feedback/components/FeedbackButton.tsx` | `features/feedback/index.ts` | 候選；逐項確認後刪除 |
| `features/feedback/index.ts` | repo 內未解析到 | barrel；先確認公開／外部使用，再決定 |
| `features/medical-calculator/index.ts` | repo 內未解析到 | barrel；先確認公開／外部使用，再決定 |
| `features/medical-chat/components/ChatExpandedOverlay.tsx` | repo 內未解析到 | 候選；逐項確認後刪除 |
| `features/medical-chat/components/ChatInput.tsx` | repo 內未解析到 | 候選；逐項確認後刪除 |
| `features/medical-chat/hooks/useChatMessages.ts` | repo 內未解析到 | 候選；逐項確認後刪除 |
| `features/medical-chat/index.ts` | repo 內未解析到 | barrel；先確認公開／外部使用，再決定 |
| `features/medical-summary/components/SummaryNarrativeCard.tsx` | repo 內未解析到 | 候選；逐項確認後刪除 |
| `features/settings/index.ts` | repo 內未解析到 | barrel；先確認公開／外部使用，再決定 |
| `src/application/dto/clinical-context.dto.ts` | repo 內未解析到 | 候選；逐項確認後刪除 |
| `src/application/hooks/chat/use-send-message.hook.ts` | `features/medical-chat/hooks/useChatMessages.ts` | 候選；逐項確認後刪除 |
| `src/application/hooks/clinical-context/useReportsContext.ts` | repo 內未解析到 | 候選；逐項確認後刪除 |
| `src/application/hooks/index.ts` | repo 內未解析到 | barrel；先確認公開／外部使用，再決定 |
| `src/application/hooks/use-data-categories.hook.ts` | repo 內未解析到 | 候選；逐項確認後刪除 |
| `src/application/hooks/use-reports-row-count.hook.ts` | repo 內未解析到 | 候選；逐項確認後刪除 |
| `src/application/hooks/use-transcription.hook.ts` | `src/application/hooks/index.ts` | 候選；逐項確認後刪除 |
| `src/application/providers/index.ts` | repo 內未解析到 | barrel；先確認公開／外部使用，再決定 |
| `src/application/services/local-bundle-scope.service.ts` | `features/medical-chat/hooks/useChatMessages.ts` | 候選；逐項確認後刪除 |
| `src/core/categories/observations.category.ts` | `__tests__/core/categories/lab-reports.category.test.ts`<br>`__tests__/core/categories/observations.category.test.ts` | 有實質測試引用；先判定保留價值，不連帶刪測試 |
| `src/core/interfaces/services/transcription.service.interface.ts` | `__tests__/core/use-cases/transcription/transcribe-audio.use-case.test.ts`<br>`src/core/use-cases/transcription/transcribe-audio.use-case.ts`<br>`src/infrastructure/ai/services/transcription.service.ts` | 有實質測試引用；先判定保留價值，不連帶刪測試 |
| `src/core/use-cases/chat/generate-chat-title.use-case.ts` | `__tests__/core/use-cases/chat/generate-chat-title.use-case.test.ts` | 有實質測試引用；先判定保留價值，不連帶刪測試 |
| `src/core/use-cases/chat/send-message.use-case.ts` | `__tests__/core/use-cases/chat/send-message.use-case.test.ts`<br>`src/application/hooks/chat/use-send-message.hook.ts` | 有實質測試引用；先判定保留價值，不連帶刪測試 |
| `src/core/use-cases/clinical-data/fetch-clinical-data.use-case.ts` | repo 內未解析到 | 候選；逐項確認後刪除 |
| `src/core/use-cases/transcription/transcribe-audio.use-case.ts` | `__tests__/core/use-cases/transcription/transcribe-audio.use-case.test.ts`<br>`src/application/hooks/use-transcription.hook.ts` | 有實質測試引用；先判定保留價值，不連帶刪測試 |
| `src/core/utils/encounter-link.utils.ts` | `__tests__/core/encounter-link.utils.test.ts` | 有實質測試引用；先判定保留價值，不連帶刪測試 |
| `src/infrastructure/ai/services/transcription.service.ts` | `src/application/hooks/use-transcription.hook.ts` | 候選；逐項確認後刪除 |
| `src/infrastructure/ai/tools/clinical-skill-tools.ts` | repo 內未解析到 | 保留；已知外部評測候選 |
| `src/infrastructure/ai/tools/fhir-tool-definitions.ts` | repo 內未解析到 | 先核對 server／跨 repo 消費端 |
| `src/infrastructure/image/image-processor.service.ts` | repo 內未解析到 | 候選；逐項確認後刪除 |
| `src/shared/components/ConnectionInfo.tsx` | repo 內未解析到 | 候選；逐項確認後刪除 |
| `src/shared/components/ThemeToggle.tsx` | repo 內未解析到 | 候選；逐項確認後刪除 |
| `src/shared/components/VersionLink.tsx` | repo 內未解析到 | 候選；逐項確認後刪除 |
| `src/shared/config/env-validator.ts` | `__tests__/shared/config/env-validator.test.ts` | 有實質測試引用；先判定保留價值，不連帶刪測試 |
| `src/shared/errors/app-error.ts` | `__tests__/shared/errors/app-error.test.ts` | 有實質測試引用；先判定保留價值，不連帶刪測試 |
| `src/shared/hooks/ui/use-expanded-overlay.hook.ts` | `__tests__/shared/hooks/use-expanded-overlay.test.tsx` | 有實質測試引用；先判定保留價值，不連帶刪測試 |
| `src/shared/utils/reports-count.utils.ts` | `__tests__/shared/utils/reports-count.imaging.test.ts`<br>`src/application/hooks/use-reports-row-count.hook.ts` | 有實質測試引用；先判定保留價值，不連帶刪測試 |
| `src/shared/utils/string.utils.ts` | `__tests__/shared/utils/string.utils.test.ts` | 有實質測試引用；先判定保留價值，不連帶刪測試 |

正式聊天入口為 `MedicalChat → useAgentChat`；舊 `useChatMessagesHandler → useSendMessage → sendMessageUseCase` 鏈未被上述入口引用。正式語音使用 `useVoiceRecording`，舊 `useTranscription → TranscribeAudioUseCase → TranscriptionService` 鏈同樣未被正式入口引用。這些適合整鏈審核，避免只刪外層留下下一批孤兒。

另有檔內候選：`src/shared/config/ui-theme.config.ts` 的 `getActiveTabClasses` 與 `getBorderClass` 標記 deprecated，全文符號搜尋僅找到定義；可在個別核准後移除，保留 `getTabClasses` / `getCardClasses` 等現行介面。

## 核准後驗證與提交

- 執行前重新檢查 working tree，保護既有變更；逐批列出 diff，不使用全目錄清理或整批 stage。
- 素材／文件：再查引用、Markdown 相對連結、發布 URL；文件搬移同時修正索引。
- 程式刪除：重新計算引用、執行相關真實測試、typecheck、lint、production build；涉及 UI 時遵循 repo skill 並做實際瀏覽器檢查。
- 測試刪除：確認僅刪空殼；不移除有意義的測試來讓檢查通過。
- 不主動調整套件或 lockfile；若後續核准移除套件，遵循 `packages:install` 和 lockfile guard。
- 每批提出驗證結果與剩餘限制。清理目標為 `Visible behaviour changes: none`（A 的預設素材 URL 移除另明列）；若實際改變臨床入口，停止並重新審核。

## 審核前盤點範圍

- 盤點 1,423 個 Git 追蹤檔；讀取目前未提交狀態、配置、CI、文件索引與相關實作。
- TypeScript 依賴圖產生 46 個未由正式入口到達的項目；排除 3 個測試後，上表為 43 個候選／例外。
- 沒有執行刪除、搬移、套件安裝、提交、推送、部署或 WIP 還原。
- 沒有變更 runtime，因此未執行 build、全套單元測試或瀏覽器回歸；這些是核准後實作的驗證項。

- 本次另執行 src/features/components/lib 範圍 ESLint（未自動修正）：0 errors、0 warnings，其中 0 個 unused-vars 警告。這是目前工作目錄基線，不代表全 repo lint 或全部警告均屬死碼。

## A／B／C 執行紀錄（2026-09-08）

- A：刪除 5 個未引用預設圖示與空殼測試產生器。
- B：刪除 4 個無行為驗證的空殼測試；有實質內容的測試保留。
- C：10 份歷史文件移至 [history](history/README.md)，7 份門診規劃移至 [plans/outpatient](plans/outpatient/README.md)；修正搬移連結，保留歷史結論。
- 新增 [CONTRIBUTING](../CONTRIBUTING.md)、[實驗索引](../scripts/experiments/README.md)、[WIP](WIP.md)，更新文件入口、feedback 入口與語音路徑說明。既有規劃與評測文件加上狀態註記。
- `.gitignore` 新增 `/output/`，保留現有本機檔案。未搬移／還原範本分享功能 WIP；未執行未追蹤 FHIR 對齊腳本。
- D、臨床可見性 gates、依賴與 lockfile 不變；兩份架構圖保留，內容核對與 build 同步機制列為後續。
- 未提交、推送或部署。

Visible behaviour changes: 臨床介面 none；A 的 5 個預設 SVG URL 在部署後將不再存在。

### 執行後驗證

- 精確刪除清單 10 檔、搬移對照 17 檔均核對通過。
- 原功能 WIP、輸出、依賴與其餘受保護程式／測試逐檔雜湊確認保留；`lab-reports.category.ts` 僅更新指向歷史實驗文件的註解路徑。
- 本次新增／修改／搬移文件的 repo 內相對連結檢查通過；外部網址與歷史本機證據未連網驗證。歷史文件有一處方括號誤成連結，已改為文字括號，結論不變。
- Jest 可列出 441 個測試檔；核准刪除的 4 個空殼已不在清單，保留的 id utils 測試 14 項通過。
- `git diff --check` 通過；`output/` 現有檔案已確認被忽略且仍保留。
- 本次僅文件、未引用素材與空殼測試清理，未改執行邏輯；未跑全套測試、全 repo lint、build 或瀏覽器回歸。

## D 逐群審核：第一群（2026-09-08）

狀態：擁有者已核准 D1 三檔刪除；其餘 D 群仍待逐群審核。後續依序審查：D1 獨立舊資料／影像封裝 → D2 舊資料分類與報告 hook → D3 舊聊天鏈 → D4 舊轉錄鏈 → D5 未使用 UI 與樣式 helper → D6 有測試的工具、錯誤與驗證層 → D7 barrel 與外部評測／server 契約。每群重新確認直接引用與保留入口，不連帶授權其他群。

### D1：建議刪除的完整範圍（3 檔）

| 檔案 | 原用途 | 本次證據與現行路徑 |
|---|---|---|
| `src/application/dto/clinical-context.dto.ts` | 包裝 sections 與 formattedText 的 DTO／factory | `ClinicalContextDTO`、`createClinicalContextDTO` 只有本檔定義；現行 `use-clinical-context.hook.ts` 與 `clinical-context/formatters.ts` 直接處理 sections／格式化 |
| `src/core/use-cases/clinical-data/fetch-clinical-data.use-case.ts` | 把 execute 轉送至 repository.fetchAllClinicalData | `FetchClinicalDataUseCase` 只有本檔定義；現行 clinical-data query 使用 fetch plan，plan 自行處理 repository fallback |
| `src/infrastructure/image/image-processor.service.ts` | 圖片壓縮、縮圖、尺寸讀取及 singleton | 所有 exports（class、singleton、options、result type）只在本檔出現；`MedicalChat` 實際 import `useImageUpload`，使用 File／Object URL，不引用此 service |

重新跑 TypeScript 檔案依賴圖：這三檔均無已解析的直接引用，正式 Next 入口無法到達。另搜尋 app、src、features、components、lib、scripts、tests、e2e、docs 的檔名與全部公開符號，未見其他程式使用。沒有同檔測試需要刪除，也沒有需修改的 barrel re-export；不動它們依賴的 entity、repository、formatter 或圖片功能。

限制：無法證明 repo 外沒有直接引用這些原始檔。package 為 private app；目前未找到像 clinical-skill-tools 那樣已知的外部使用契約，因此列為可刪除候選，而非全面相容保證。

核准後：僅刪上述三檔，重新搜尋引用，執行 typecheck、lint、production build 與現行 clinical-data query、clinical-context formatter 的相關測試。若驗證失敗，區分現有 WIP 基線與刪除造成的回歸，不順手修其他功能。

預期 Visible behaviour changes: none。這三檔沒有 UI／route 註冊，不會移除臨床 surface。

### D1 執行紀錄

擁有者於本對話回覆「同意」，核准 D1。已刪除該群明列的三檔；其餘 runtime 程式、測試、依賴與先前 WIP 均未修改。正式資料載入、病歷文字格式化與圖片上傳入口保留。

Visible behaviour changes: none。

- 刪除前重新搜尋 exports，無外部程式引用；刪除後差異核對僅包含三個核准檔案（另更新審核／WIP 狀態文件）。
- 現行資料查詢與 context formatter 測試：2 suites、32 tests 通過。
- 型別檢查（不使用增量快取）與全 repo lint 通過。
- `npm run build` 正式建置通過；首次在受限環境因 Turbopack 無法綁定連接埠失敗，在允許啟動本機處理程序的環境重跑成功。
- `git diff --check` 通過；逐檔雜湊確認本輪只有三個核准刪除與兩份狀態文件改動。
- 未提交、推送或部署。

## D2 逐群審核：舊資料分類／報告 hooks 與翻譯表

狀態：擁有者已核准本群五檔刪除，已執行。2026-09-08 重新執行 TypeScript 依賴圖並搜尋檔名／export 符號；下列五檔均無 repo 內直接程式或測試引用，也不在正式 Next 入口依賴鏈。

| 完整刪除範圍 | 原用途 | 正式流程與保留界線 |
|---|---|---|
| `src/application/hooks/use-data-categories.hook.ts` | 從 registry 產生分類、數量與 context | 保留 `features/data-selection/hooks/useDataCategories.ts`；`DataSelectionPanel` 實際使用後者。兩者有同名函式，刪除僅限 src/application 這一檔 |
| `src/application/hooks/use-reports-row-count.hook.ts` | 用 useMemo 包裝報告數量計算 | `ReportsCard` 現用 `useReportTabCounts`。底層 `reports-count.utils.ts` 及其真實測試留給 D6 審核，不連帶刪除 |
| `src/application/hooks/clinical-context/useReportsContext.ts` | 舊 DiagnosticReport context 組裝、時間篩選及成員去重 | `use-clinical-context.hook.ts` 現用 `useRegistryContextCache` 取 labReports／imagingReports；保留 registry、category 與共用 selectors |
| `features/clinical-summary/reports/hooks/useReports.ts` | 取報告、Observation、Procedure 與載入狀態 | `ReportsCard` 直接用 `useClinicalData`，且其載入判定另涵蓋 imagingStudies；保留該畫面及 `useReportsData` |
| `features/clinical-summary/reports/utils/fhir-translations.ts` | 未引用的 FHIR 狀態／分類中文對照 | 兩個常數與三個翻譯函式皆只出現在本檔；不改語系檔、TranslationService 或正式報告元件 |

本群建議：僅刪除以上五檔；不刪任何測試、共用 utility、registry、報告元件或資料分類 UI。A／B 中刪掉的兩個同名空殼測試並不是本群刪除依據，依據是重新核對的正式流程與引用。

預期 Visible behaviour changes: none。報告分頁、AI 資料範圍、報告數量、報告生成 context 與翻譯顯示均保留現行入口；若實作驗證顯示需改 surface／route，停止並重新審核。

核准後驗證：重新查引用、typecheck、全 repo lint、production build；執行報告 tab counts、ReportsCard 篩選、registry context cache、lab／imaging categories 及保留的 reports-count utility 測試。未聲稱 repo 外無直接原始碼引用；本次未找到外部使用契約。

### D2 執行紀錄

擁有者於本對話回覆「同意」。已刪除 D2 明列五檔；刪除前重新核對依賴圖，刪除後搜尋程式引用未發現殘留。保留 feature 內同名 useDataCategories、ReportsCard、useReportsData、useReportTabCounts、registry cache、共用工具與所有真實測試。

- 6 suites、40 tests 通過：報告 tab counts、ReportsCard 篩選、registry context cache、lab／imaging categories、reports-count utility。
- 型別檢查（不使用增量快取）、全 repo lint、`npm run build` 正式建置皆通過。
- 逐檔雜湊確認本輪只有五個核准刪除（另更新審核與 WIP 狀態文件），先前 WIP 保留。
- `git diff --check` 通過。未提交、推送或部署。

Visible behaviour changes: none。

## D3 逐群審核：舊聊天與舊標題流程

狀態：擁有者已核准 D3a＋D3b，5 個實作與 2 個專屬測試檔已刪除。以下保留審核時的範圍與理由。

### D3a：舊送訊息鏈（4 個實作 + 1 個專屬測試）

完整刪除範圍：

- `features/medical-chat/hooks/useChatMessages.ts`
- `src/application/hooks/chat/use-send-message.hook.ts`
- `src/application/services/local-bundle-scope.service.ts`
- `src/core/use-cases/chat/send-message.use-case.ts`
- `__tests__/core/use-cases/chat/send-message.use-case.test.ts`

引用證據：`useChatMessagesHandler` 無消費端；useSendMessage 與 getActiveLocalBundleImportId 僅被該舊 hook 使用；SendMessageUseCase 只被上述 wrapper 與其專屬測試使用。整鏈無法由正式 app 入口到達。刪除的是 `useChatMessages.ts` 舊 hook，**不是**現行 chat.store 中同名的訊息 selector。

正式聊天由 `MedicalChat → useAgentChat` 處理。保留整條 Agent 流程、chat.store、LocalBundleService、實際 local-bundle-scope，以及相關 context／串流與病人隔離機制。此群不刪聊天 UI、對話歷史、雲端同步或用於它們的共用 service。

### D3b：舊標題產生器（1 個實作 + 1 個專屬測試）

完整刪除範圍：

- `src/core/use-cases/chat/generate-chat-title.use-case.ts`
- `__tests__/core/use-cases/chat/generate-chat-title.use-case.test.ts`

引用證據：GenerateChatTitleUseCase 只被其專屬測試使用。正式流程為 `MedicalChat → useSmartTitleGeneration → createSmartTitleUseCase → GenerateSmartTitleUseCase`，上述現行程式與其測試都保留；repository 的預設標題流程也不動。

### 專屬測試的刪除理由與驗證

這兩份是**有實際驗證的測試**，不是 A／B 的空殼：send-message 檔宣告 15 項，generate-chat-title 檔宣告 10 項。建議隨正式退出的舊實作一併刪除，理由是測試的對象不再保留，並非為了讓失敗測試通過。刪除後測試數會減少 25 項；核准必須包含這兩份測試，不能從只核准實作自行延伸。

D3a + D3b 共 5 個實作、2 個測試。核准後先確認既有專屬測試基線，再刪指定檔案；重新查引用，跑現行 useAgentChat custom endpoint、smart-title hook/use-case、chat-history store 等回歸，加 typecheck、lint、production build。不將舊功能邏輯移植進現行流程，也不刪其他共用依賴或 barrel。

預期 Visible behaviour changes: none。外部 repo 的直接原始碼使用仍非本次靜態圖能證明；目前未找到外部使用契約。

### D3 執行紀錄

擁有者於本對話回覆「同意」，核准 D3a＋D3b。刪除前兩份舊流程測試 2 suites、25 tests 全部通過；隨退出的舊實作刪除其專屬測試，並非移除失敗測試。

- 精確刪除核准的 5 個實作與 2 個測試檔；引用圖與符號搜尋確認無其他程式消費端、刪後無殘留引用。
- 正式 MedicalChat / useAgentChat、smart-title hook / use-case、chat store、對話歷史及本機匯入服務均保留。
- 現行流程測試 4 suites、29 tests 全部通過；不使用增量快取的型別檢查、全 repo lint、`npm run build` 正式建置均通過。
- 逐檔雜湊確認本輪只涉及七個核准刪除與兩份狀態文件；未提交、推送或部署。

Visible behaviour changes: none。

## Localhost 實機補驗（D1–D3，2026-09-08）

依擁有者新要求，今後每群刪除後先實際操作 localhost，再繼續下一群；本次補驗前三群。以 Codex 瀏覽器操作 `http://localhost:3001/`，並唯讀確認監聽程序 cwd 就是本 repo。原服務已啟動，未重啟或取代。未新增刪除或修改 runtime。

| 範圍 | 實際操作與結果 |
|---|---|
| 病人資料載入 | 從 Welcome 點「使用試用資料」，病人資訊、生命徵象及預產生摘要可見 |
| 報告與分類 | 打開報告，累積檢驗表與分類筆數可見；切換全部報告成功 |
| 搜尋 | 輸入 zzzznomatchxyz 顯示 0／120 與沒有符合搜尋的報告；改為 Chest 顯示 3／120 與三筆 Chest X-ray |
| AI 資料範圍 | 摘要設定 → 資料範圍，分類與選取狀態可見；切到預覽，組裝文字包含 Lab Reports 與 Imaging Reports |
| 圖片附件 | 用不含個人資料的合成 PNG，經實際檔案選擇器加入，確認檔名／縮圖與 1 image，再按 Remove image；未將圖片送至 AI |
| 真實聊天 | 開啟「不使用病人資料」，送出純測試文字，看到停止按鈕與回覆「測試成功」，完成後恢復傳送狀態 |
| 切頁保留 | 聊天 → 醫療摘要 → 聊天，測試訊息與回覆仍存在；檢視實際畫面未見錯誤覆蓋 |
| 對話歷史 | 點「登入保留對話」，drawer 正常開啟並顯示「需要登入」。本次為訪客，**未驗證登入後的雲端儲存、跨裝置歷史與自動標題** |

本次沒有使用真實病歷測試傳送；AI 測試啟用不讀病歷。瀏覽器驗證範圍為桌面，未宣稱完成手機、登入或全功能 E2E。

D4 及後續群未刪除。登入後的對話儲存與標題仍待補驗，或由擁有者明確接受此限制後再往下。

## 登入後實機補驗（2026-09-08）

擁有者明確同意使用 Chrome 已登入帳號完成驗證。測試在 localhost 進行，使用試用工作區並開啟「不使用病人資料」，送出不含病人內容的 D3-0908 測試文字。

- 真實 AI 回覆「雲端對話測試成功」。
- 雲端歷史清單出現本次對話與 2 msgs。
- 重新載入頁面後，重新開啟對話紀錄並選取該筆，成功還原測試問題與回覆。雲端儲存／還原實機通過。
- **自動 AI 標題未通過**：清單在回覆完成及重新載入後仍為首句截斷「這是 MediPrisma localh...」，未觀察到 AI 產生的新標題。這不是把預設截斷標題當成自動標題通過。
- `use-smart-title-generation.hook.ts` 與 HEAD 無差異；本次未修改它。靜態檢查發現只接受 prevMessageCount=0 且 messages.length=2，隨後先更新 count 再檢查 assistant content；若初次 assistant 是串流空殼，後續文字填入仍為 2 則便不符合觸發條件。新 session 設定時的 count 重設也可能造成漏觸發。這是待回歸測試確認的原因，尚未修復。
- 現有 hook 測試以一次給入完整 firstExchange 模擬，未涵蓋此次真實串流過程；單元測試通過不能代表實機標題正常。

未刪除本次測試對話，未更動登入帳號。後續刪除暫停，先處理自動標題的實機驗證問題；D4 尚未核准或刪除。

## 智慧標題修復與實機驗證（2026-09-08）

擁有者回覆「好，照你建議」，核准先修復智慧標題再繼續清理。

- 新對話以第一則訊息 ID 追蹤，等串流完成且 auto-save 建立文件、回填 session ID 後生成標題；不再以訊息數 0→2 推測完成。
- MedicalChat 傳入實際 isLoading，無痕模式關閉標題流程；保留自訂端點隱私門檻、PII 清理與過期 session 防護。
- 移除猜測存檔時間的一秒等待，使用已存在的 session 文件；無病人情境的快取 key 與 auto-save 一致。
- 回歸測試涵蓋先存檔／先完成串流、空 assistant、分段文字、載入舊對話、切換 session、隱私門檻、PII 清理。相關 3 suites、17 tests 通過；型別檢查、修改檔 lint、正式建置通過。
- Chrome localhost 使用已授權登入帳號，開啟「不使用病人資料」，送出 D3-TITLE-0908 合成彩虹問題；AI 回覆後清單生成「雨後彩虹形成原理」。重新整理，再從歷史選取，標題及兩則完整訊息均保留。前一筆測試的截斷標題維持原樣，未替舊對話改名。

本輪智慧標題阻塞已解除；未刪除測試對話，未提交、推送或部署。D4 仍未核准或刪除。

Visible behaviour changes: 新對話第一個完整回覆存檔後會產生 AI 標題；既有臨床畫面與入口不變。

## D4 審核提案：兩個未使用的舊聊天元件

狀態：待擁有者逐群核准，尚未刪除。此群僅包含以下兩檔，不含測試或其他候選。

| 擬刪檔案 | 核對結果 | 現行功能實作（保留） |
|---|---|---|
| `features/medical-chat/components/ChatInput.tsx` | ChatInput、useInputController 全 repo 符號搜尋僅有本檔定義；依賴圖無引用者 | MedicalChat → ChatInputArea，搭配 useChatInput |
| `features/medical-chat/components/ChatExpandedOverlay.tsx` | 符號搜尋僅有本檔定義；依賴圖無引用者 | MedicalChat → shared ExpandedOverlay，搭配 useExpandable 與快捷鍵 |

本輪重新解析追蹤及未追蹤程式，涵蓋 import、re-export、字串 dynamic import/require；兩檔無 app、test、script 引用。medical-chat 公開 index 僅 export Feature，不匯出這兩個元件。未宣稱驗證外部 repo 直接引用。

預期 Visible behaviour changes: none。localhost `/` 的「臨床對話」輸入、傳送、放大與縮小入口保留。

核准後：刪除前記錄其他 WIP 雜湊，精確刪除兩檔；執行相關測試、型別、lint、正式建置。接著在 localhost 實際操作輸入、換行、傳送純測試訊息、放大／縮小與 Escape 返回，確認訊息保留、智慧標題與歷史還原正常，才提出下一群。任何失敗先處理，不繼續刪除。

### D4 執行結果

擁有者回覆「同意」，核准刪除兩個舊聊天元件。已精確刪除 ChatInput.tsx 與 ChatExpandedOverlay.tsx，無其他 runtime 改動；刪後重建依賴圖，無殘留消費端。

- 三個相關測試套件（現行輸入框行動視窗、MedicalChat 隱私門檻、智慧標題）17 tests 通過。
- 非增量型別檢查、全 repo lint、正式建置均 exit 0。
- localhost Chrome 已登入帳號：載入試用資料並開啟不使用病人資料，輸入 D4 合成文字，Shift+Enter 換行正常；放大、縮小按鈕及 Escape 返回均保留完整草稿。
- 實際傳送後 AI 回覆「D4 聊天驗證成功」；放大後截圖確認訊息及輸入框可見，Escape 返回仍保留訊息。
- 歷史清單生成「D4 聊天驗證成功」智慧標題；重新整理頁面、開啟歷史並選取，兩則完整訊息還原成功。
- 逐檔雜湊確認記錄文件更新前只有核准兩檔被刪除，其他原有 WIP 未變動。未刪測試對話，未提交、推送或部署。

Visible behaviour changes: none。實機範圍為桌面；未宣稱完成所有行動裝置測試。

## D5 審核提案：未使用的舊主題與版本元件

狀態：待核准，尚未刪除。

- `src/shared/components/ThemeToggle.tsx`：依賴圖無引用者，現行主題選擇由 Settings → DisplaySettings 的亮色／暗色控制項負責。
- `src/shared/components/VersionLink.tsx`：依賴圖無引用者，檔案註解明示頁首已停止掛載，原為預留可重用元件；現行版本顯示由 DisplaySettings 使用 useAppVersion 提供。

符號搜尋僅有定義及 next.config.ts 的過時說明註解（提案包含將該註解的 VersionLink 名稱改為 useAppVersion，不變更設定值）。不刪共用 theme provider、版本 hook、顯示設定或其測試。

預期 Visible behaviour changes: none；localhost `/` 的設定 → 顯示，亮暗主題切換與版本資訊均保留。核准後完成相關檢查，實機切換亮／暗色、確認版本資訊與頁面重載，再繼續下一群。

### D5 執行結果

擁有者明確核准刪除，並要求實測主題切換與顯示。已刪除 ThemeToggle.tsx、VersionLink.tsx；next.config.ts 僅更正過時註解為 useAppVersion，無設定值變更。

- DisplaySettings 與 dark-theme-tokens 兩套測試、6 tests 全數通過；非增量型別檢查、全 repo lint、正式建置均 exit 0。
- localhost Chrome 使用試用工作區：設定 → 顯示與關於，確認主題按鈕、字體大小、連線資訊及 MediPrisma v0.51.0 可見。
- 實際由亮色切暗色，截圖確認設定頁、病人資訊、文字與控制項正常顯示；重新整理仍為暗色，醫療摘要與病人資訊正常顯示。
- 再切回原本亮色，截圖確認設定及版本資訊；再次重新整理仍保留亮色，摘要頁正常顯示。測試結束恢復原本亮色偏好。
- 逐檔雜湊確認記錄文件更新前，僅核准兩檔刪除及 next.config.ts 註解變更；無其他 WIP 改動。程式符號搜尋無殘留引用。

Visible behaviour changes: none。本次實機驗證為桌面亮／暗色及重新整理，不宣稱全裝置完整視覺回歸。未提交、推送或部署；其餘刪除候選仍待逐群審核。

## D6 審核提案：兩個未使用的病人資訊／就診紀錄元件

狀態：待核准，尚未刪除。

| 擬刪檔案 | 核對證據與保留功能 |
|---|---|
| `features/clinical-summary/patient-info/components/LoadingSkeleton.tsx` | 重新解析依賴圖無引用者；PatientInfoCard 將 loading 傳入 FeatureCard，由 `src/shared/components/LoadingSkeleton.tsx` 顯示載入狀態。共用同名元件保留。 |
| `features/clinical-summary/visit-history/components/NoteItem.tsx` | 重新解析依賴圖無引用者，NoteItem 符號僅有本檔定義；現行就診文件由 VisitDetailContent / VisitLinkedDocumentRow / DocumentDetailDialog 呈現。useClinicalNotes 仍有正式消費端，保留。 |

僅刪這兩檔，不含 hook、資料型別、共用元件及測試。圖涵蓋追蹤與未追蹤程式，未宣稱驗證外部 repo 原始碼直接引用。

預期 Visible behaviour changes: none；localhost `/` 病人資訊、就診紀錄及文件閱讀入口保留。核准後完成相關測試、型別、lint、建置，再實機重新載入試用資料、切換病人資訊／就診紀錄／文件、展開有文件的就診並閱讀內容，確認後才繼續下一群。載入狀態另以現行測試核對，不將快速載入未看到骨架宣稱為實機通過。

### D6 執行結果

擁有者回覆「好」，核准本群兩檔刪除。已精確移除病人資訊目錄的 LoadingSkeleton.tsx 與就診紀錄 NoteItem.tsx；共用載入元件、useClinicalNotes 及正式文件閱讀元件保留。

- 相關 13 suites、90 tests 通過（FeatureCard、PatientInfoCard、visit-history、文件來源展開）。非增量型別檢查、全 repo lint、正式建置均 exit 0。
- localhost Chrome 重新載入試用工作區，病人資訊、生命徵象正常顯示。
- 就診紀錄勾選「含出院病摘」，顯示 2 / 46 筆；展開 2025-05-18 住院紀錄，出現病摘與全文閱讀按鈕。
- 點「彈出全文檢視」，確認文件表格、診斷、主訴、病史等內容可讀，截圖無錯誤覆蓋；Escape 正常關閉。
- 切到「文件」頁籤，文件清單與病摘存在，展開「文件內容」成功。
- 載入骨架未因快速載入而做實機斷言；靜態核對 PatientInfoCard → FeatureCard 的 isLoading 分支仍引用共用 LoadingSkeleton，且檔案雜湊不變。現有 FeatureCard 測試未專門斷言骨架，故不宣稱有該項測試覆蓋。
- 文件更新前逐檔雜湊確認僅核准兩檔刪除，其他 WIP 未變動。未提交、推送或部署。

Visible behaviour changes: none。實機範圍為桌面試用資料，不代表所有醫院資料格式的完整回歸。其餘群仍待審核。

## D7 審核提案：未使用的連線資訊與分隔線元件

狀態：待核准，尚未刪除。

| 擬刪檔案 | 核對結果與現行功能 |
|---|---|
| `src/shared/components/ConnectionInfo.tsx` | 依賴圖無引用者；正式連線資訊由 DisplaySettings 直接顯示伺服器／本地匯入來源、患者 ID、姓名，不依賴此舊 tooltip 元件。 |
| `components/ui/separator.tsx` | 依賴圖無引用者；無程式、測試、腳本消費端。select 與 dropdown-menu 使用各自 Radix primitive 的 Separator，不是本檔。 |

本輪重新解析追蹤與未追蹤程式；全文搜尋交叉確認。提案另包含將 use-fhir-context.hook.ts 一處註解的 ConnectionInfo 範例名稱更新為 DisplaySettings，不變動 hook 邏輯。保留連線 hook、語系鍵、現行分隔線、套件與 lockfile；依賴套件是否可移除另群審核，不連帶刪除。未驗證外部 repo 直接原始碼引用。

預期 Visible behaviour changes: none。localhost `/` → 設定 → 顯示與關於 的連線資訊保留；現行頁籤與下拉選單分隔線保留。核准後完成相關測試、型別、lint、建置，實機核對試用資料的來源／患者資訊，操作顯示設定及下拉選單並檢查畫面，通過才繼續下一群。

### D7 執行結果

擁有者回覆「同意」，核准本群兩檔與註解修正。已刪除 ConnectionInfo.tsx、components/ui/separator.tsx，use-fhir-context.hook.ts 僅將註解範例名稱改為 DisplaySettings。

- DisplaySettings、use-fhir-context、InstitutionFilterSelect：3 suites、5 tests 通過；非增量型別檢查、全 repo lint、正式建置均 exit 0。
- localhost Chrome 重新載入試用工作區 → 設定 → 顯示與關於：來源「本地匯入 FHIR Bundle」、demo-patient-1、示範患者姓名均正確顯示；主題／字體控制項及 v0.51.0 可見。
- 實際開啟身份下拉選單並 Escape 關閉；另開啟帳號選單，截圖確認登入資訊、用量區與登出區間的分隔線正常，Escape 關閉；未變更身份或登出。
- 逐檔雜湊確認文件更新前僅核准兩檔刪除與一處註解變更，其他 WIP 保留。套件與 lockfile 未更動。

Visible behaviour changes: none。桌面試用工作區實機驗證通過，未宣稱遠端醫院 SMART 登入流程已測。未提交、推送或部署；下一群仍待審核。

## D8 審核提案：移除主題設定內兩個 deprecated helper

狀態：待核准，尚未刪除。本群只修改 `src/shared/config/ui-theme.config.ts`，不刪整份檔案。

- `getActiveTabClasses`：已標記 deprecated，註解指向 getTabClasses。
- `getBorderClass`：已標記 deprecated，註解指向 getCardClasses。

全 repo 精確符號搜尋（含隱藏／未追蹤程式，排除依賴、建置與輸出）只找到兩個定義，無 app、tests、scripts 消費端。提案包含移除這兩函式及其專屬舊相容性註解；保留 getTabClasses、getCardClasses、getBadgeClasses、所有色彩／樣式對照表與型別。未宣稱驗證外部 repo 直接引用，屬移除未用的舊原始碼 API。

預期 Visible behaviour changes: none。核准後完成相關頁籤／主題測試、型別、lint、建置，再於 localhost 切換病人資訊／報告／聊天／設定，確認頁籤選取樣式、卡片顯示及亮暗主題正常，恢復原本主題後才繼續下一群。

### D8 執行結果

擁有者回覆「好」，核准移除兩個 deprecated helper。已只移除 getActiveTabClasses、getBorderClass 及專屬註解，現行函式、色彩／樣式表與型別保留。

- 四套相關測試（主題 token、工作區頁籤、工作區、顯示設定）、15 tests 通過；非增量型別檢查、全 repo lint、正式建置均 exit 0。
- localhost Chrome 載入試用資料，從病人資訊切到報告、從摘要切到聊天，截圖確認選取線、卡片邊框、報告表格與聊天面板正常。
- 切到設定 → 顯示與關於，亮→暗實際切換成功，暗色報告及設定面板正常顯示；切回亮色、返回病人資訊，截圖確認卡片與選取樣式正常。已恢復原本亮色。
- 文件更新前逐檔雜湊確認僅 ui-theme.config.ts 變更，其他 WIP 未變動。未提交、推送或部署。

Visible behaviour changes: none。實機範圍為桌面試用工作區，未宣稱全裝置視覺回歸；下一群仍待核准。

## D9 審核提案：未使用的舊摘要卡片

狀態：待核准，尚未刪除。

僅提案刪除 `features/medical-summary/components/SummaryNarrativeCard.tsx`。全 repo 精確符號搜尋僅有定義，重新解析依賴圖無 app、test、script 引用者。現行摘要重點由 Feature → CurrentPrioritiesCard 呈現 headline、summary 與 SourceSup；保留該現行卡片、來源元件、resolveClaimSources、摘要資料型別及生成流程。不刪任何測試。

預期 Visible behaviour changes: none；localhost `/` 的醫療摘要、摘要重點、引用來源與其他摘要卡片保留。未宣稱核對外部 repo 直接引用。

核准後完成相關摘要與來源測試、型別、lint、建置；localhost 載入試用摘要、展開摘要重點、打開來源引用並確認可讀／導航、切換其他摘要卡片，通過後才繼續下一群。

### D9 執行結果

擁有者回覆「同意」，已精確刪除 SummaryNarrativeCard.tsx。現行 CurrentPrioritiesCard、來源元件及生成流程均保留。

- medical-summary 相關 14 suites、67 tests 全通過；非增量型別檢查、全 repo lint、正式建置均 exit 0。
- localhost Chrome 載入試用摘要，點「展開摘要」後完整內容正常顯示，可見「收合摘要」。
- 點摘要引用 1,2，來源選單顯示兩筆 Estimated GFR 與日期；選第一筆，左側自動切到報告並展開 Creatinine / eGFR，顯示對應 2026-06-02 的 eGFR 32。
- 點「時間軸」及「檢查趨勢」導航，截圖確認對應卡片滾入畫面，來源、數值及其他摘要卡片正常顯示。
- 文件更新前逐檔雜湊確認僅核准一檔刪除，其他 WIP 未變動。未提交、推送或部署。

Visible behaviour changes: none。實機使用桌面試用摘要，本輪未重新呼叫 AI 生成；下一群仍待審核。

## D10 審核提案：未掛載的舊問題回報按鈕

狀態：待核准，尚未刪除。

- 刪除 `features/feedback/components/FeedbackButton.tsx`。
- 從 `features/feedback/index.ts` 移除 FeedbackButton 的 export，保留 FeedbackDialog export 及 index 檔案。
- 同步更新 `features/feedback/README.md` 的目錄與舊按鈕說明。

重新解析依賴圖：FeedbackButton 僅由該 index 匯出，而 index 沒有 repo 消費端。正式入口是 DisplaySettings 直接匯入 FeedbackDialog，回報表單及送出服務保留。這會移除舊原始碼 API FeedbackButton；未驗證外部 repo 是否直接匯入，不宣稱全域無使用者。

預期 Visible behaviour changes: none。localhost `/` → 設定 → 顯示與關於 → 開啟回報表單 保留。核准後完成相關檢查，實機打開回報視窗、核對欄位與關閉／重新開啟；不提交回報或寄出訊息，送出流程僅核對程式保留與既有測試，不宣稱實際寄送已測。

### D10 執行結果

擁有者回覆「同意」，已刪除 FeedbackButton.tsx、移除專屬 export、更新 README；FeedbackDialog export、現行入口與回報服務保留。

- DisplaySettings 3 tests 通過；非增量型別檢查、全 repo lint、正式建置均 exit 0。現有設定測試 mock 了 FeedbackDialog，不將其視為表單端到端測試。
- localhost Chrome → 試用工作區 → 設定 → 顯示與關於 → 開啟回報表單成功。截圖確認電子郵件、問題類型、嚴重程度、描述、重現步驟及取消／傳送按鈕顯示完整。
- 點取消回到設定頁，再次開啟表單仍正常，最後 Escape 關閉。未輸入或提交回報，未寄送訊息；實際傳送流程未測。
- 逐檔雜湊確認文件紀錄更新前只涉及核准的刪除、export 與 README，FeedbackDialog 及其他 WIP 未變動；程式搜尋無 FeedbackButton 殘留。

Visible behaviour changes: none。桌面實機驗證完成；未提交、推送或部署，下一群仍待核准。

## D11 審核提案：重複的放大視窗 hook，測試轉到正式流程（2026-09-09）

狀態：待核准，尚未刪除或搬移。

- 刪除 `src/shared/hooks/ui/use-expanded-overlay.hook.ts`。重新解析依賴圖僅有專屬測試引用，正式 app 無引用。
- 將 `__tests__/shared/hooks/use-expanded-overlay.test.tsx` 搬到 `__tests__/features/medical-chat/useKeyboardShortcuts.test.tsx`，改測現行 useKeyboardShortcuts 的位置參數介面；保留 6 項行為斷言，不減少覆蓋。
- 正式 MedicalChat → useKeyboardShortcuts 的 Escape、捲動鎖定與清理邏輯和舊 hook 相同，保留正式實作不變。原測試於提案前 6 tests 全通過，並非移除失敗測試。

預期 Visible behaviour changes: none；localhost `/` 臨床對話放大、縮小、Escape 返回與捲動保留。核准後跑搬移後測試及相關檢查、型別、lint、建置，再實機輸入純草稿、放大／縮小、Escape、返回後捲動與草稿保留，確認後才繼續下一群。未驗證外部 repo 的直接原始碼引用。

### D11 執行結果（2026-09-09）

擁有者回覆「同意」。已刪除舊 use-expanded-overlay hook，原測試搬至 features/medical-chat/useKeyboardShortcuts.test.tsx，改用正式 hook 的位置參數；原 6 項斷言保留。

- 搬移後 6 tests 與現行輸入框 2 tests，共 8 tests 通過。非增量型別檢查、全 repo lint、正式建置均 exit 0。
- localhost 試用工作區輸入 D11 純草稿，未傳送。放大、縮小按鈕、再次放大與 Escape 返回均正常且草稿完整保留。
- 唯讀 DOM 核對放大時 body overflow=hidden，縮小及 Escape 返回後均恢復空值；返回後實際捲動左側病人資訊，照護計畫正常捲入畫面。
- 截圖確認一般聊天面板及草稿正常。逐檔雜湊確認既有檔案僅核准的舊實作與原測試移除；新增目的測試，正式 useKeyboardShortcuts 與其他 WIP 未變動。

Visible behaviour changes: none。桌面實機驗證完成，未提交、推送或部署；後續群仍待審核。

## D12 審核提案：未使用的字串工具與專屬測試（2026-09-09）

狀態：待核准，尚未刪除。

- `src/shared/utils/string.utils.ts`：truncateText、capitalizeFirst、formatList、sanitizeHtml 四個匯出，依賴圖僅有專屬測試引用。
- `__tests__/shared/utils/string.utils.test.ts`：22 項只測上述舊工具的測試；提案前全部通過。提案包含隨實作退出而刪除此測試，不是搬移，也不是移除失敗測試。

重新解析追蹤／未追蹤程式與符號搜尋，未找到正式消費端。現行文件渲染使用 document-summary/utils/sanitize-narrative.ts 的 DOMPurify 流程，臨床 insight 也使用獨立 DOMPurify 流程；均保留。現行 sanitize-narrative 測試保留。未驗證外部 repo 直接引用。

預期 Visible behaviour changes: none。核准後刪除兩檔、確認引用及安全清理實作保留，跑現行文件清理／渲染測試、型別、lint、建置，再 localhost 實際開啟與展開試用文件、閱讀全文及切回摘要確認顯示。實機閱讀不視為 XSS 全面驗證，安全清理依既有測試驗證；通過後才繼續下一群。

### D12 執行結果（2026-09-09）

擁有者回覆「同意」。已精確刪除 string.utils.ts 及其專屬 22 項測試；原測試於提案前全數通過。現行文件與 insight 的 DOMPurify 流程、安全測試保留。

- 現行 document-summary 5 suites、34 tests 通過（含 sanitize-narrative 與文件渲染）；非增量型別檢查、全 repo lint、正式建置均 exit 0。
- localhost Chrome 試用工作區 → 文件，展開病摘成功；彈出全文視窗，表格、主訴、病史等內容正常顯示。Escape 關閉後返回病人資訊，右側摘要仍可展開／收合。
- 逐檔雜湊確認文件紀錄更新前僅核准兩檔刪除，現行 DOMPurify 實作、測試及其他 WIP 未變動。搜尋無舊路徑引用；generate-medical-summary.use-case.ts 的檔內同名 truncateText 是獨立現行函式，保留。

Visible behaviour changes: none。實機閱讀不代表全面 XSS 驗證；安全清理依既有測試驗證。未提交、推送或部署，下一群仍待核准。

## D13 審核提案：舊報告計數工具，影像案例轉測正式流程（2026-09-09）

狀態：待核准，尚未刪除或搬移。

- 刪除 `src/shared/utils/reports-count.utils.ts`（含 calculateReportsRowCounts、ReportsRowCounts、ReportFilters）。D2 刪除舊 hook 後，現僅專屬測試引用，正式程式無消費端。
- 將 `__tests__/shared/utils/reports-count.imaging.test.ts` 的四個案例搬至 `__tests__/features/reports/report-tab-counts.imaging.test.ts`，改測正式 calculateReportTabCounts；涵蓋缺 category 影像、純圖片報告、空報告、文字＋圖片不重複計數。原四項測試在提案前全通過。
- ReportsCard → useReportTabCounts → calculateReportTabCounts 正式鏈與其既有測試保留；保留 report-grouping-helpers。

預期 Visible behaviour changes: none。不將舊工具與新工具假定為完全等價：搬移時若案例與正式邏輯存在差異，先釐清並回報，不刪斷言來湊通過。核准後完成相關報告計數／影像測試、型別、lint、建置；localhost 實際切換全部／影像報告，核對筆數與清單、搜尋及報告展開後才繼續。未驗證外部 repo 直接引用。

### D13 轉測發現差異，刪除暫停（2026-09-09）

擁有者核准原提案。先轉測四個案例：三項通過，空報告預期 0、現行計數回傳 1。進一步以相同 fixture 呼叫正式 buildReportsData，實際清單亦產生 1 列：這筆有名稱、日期、分類但沒有內容，現行清單仍保留。不是單純計數與清單不一致。

未刪舊工具或原測試、未修改現行邏輯。轉測草稿保留於 /tmp/d13-report-tab-counts.imaging.review.ts 供調查，不放在 repo 測試目錄造成失敗。原說明「空報告不算」只描述舊工具，不能代表現行產品。

建議修訂：保留現行「有報告紀錄即顯示一列」行為，第四案例改為同時驗證清單與計數均為 1，其他三案例保持；再執行已提案的舊工具刪除與 localhost 驗證。此修訂待擁有者確認，不以刪除斷言消除差異。若改為隱藏空內容紀錄，則屬另外的可見行為改動，需另行審核。

### D13 執行結果（2026-09-09）

擁有者回覆「照你建議做」，核准保留現行 metadata-only 報告列。已刪除 reports-count.utils.ts，四案例搬至 features/reports/report-tab-counts.imaging.test.ts，第四案例確認實際清單產生一列、名稱保留且 all 計數一致。原三案例保留，正式計數及清單實作未改動。

- 兩套現行計數測試共 11 tests 通過；非增量型別檢查、全 repo lint、正式建置均 exit 0。
- localhost 試用資料報告頁：初始全部標示 120、影像 8；影像頁搜尋 Chest 顯示 3 筆且三筆 Chest X-ray 可見；第一份報告可展開全文。
- 清空搜尋切全部頁後顯示 97、影像 8。記錄初始計數與全部頁載入後值不同，不將初始 120 宣稱為最終顯示列數；本輪未修改現行計數／清單邏輯，也未修正這項既有計數呈現差異。
- metadata-only、純圖片等邊界案例以單元測試驗證；實機使用現有試用資料，不宣稱每個邊界 fixture 都經 UI 匯入測試。
- 對照本群前雜湊，正式程式未變動，僅核准舊工具／原測試刪除、新測試與審核紀錄；其他 WIP 保留。未提交、推送或部署。

Visible behaviour changes: none。後續群仍待審核。

## D13 後續：120→97 計數差異調查（2026-09-09）

擁有者同意先調查，暫停後續刪除。找到原因：初始 useReportTabCounts → calculateReportTabCounts 沒有套用全部頁的成人健檢合併規則；正式全部頁使用 groupAdultPreventiveRows。

以 public/demo/demo-bundle.json，補上 DiagnosticReport result 參照的 observations，透過正式 buildReportsData + useOrphanObservations + groupAdultPreventiveRows 重現：未含處置的 118 列合併為 95 列，成人健檢來源 25 列合成 2 列，差額正好 23。加上獨立 2 筆處置，即 120→97。調查測試通過，草稿保存在 /tmp/count-investigation.test.tsx，未納入 repo 測試或修改正式實作。

結論：資料未消失，是初始與載入後的標籤採不同計數單位。建議讓初始輕量計數同樣套用成人健檢來源／日期／機構分組，保持列內容、展開及臨床可見性不變，補前後計數一致的回歸測試。此修正尚未實作。

### 報告初始筆數修正與實機驗證（2026-09-09）

擁有者回覆「好，按照你的建議」，核准修正初始筆數。輕量計數現在辨識成人健檢來源，依與清單相同的日期／機構單位合併計數；初始 hook 納入 Composition 來源並在其變更時更新快取。成人健檢 Observation 參照收集抽為共用工具，清單與初始計數共用，未改動清單可見性或內容。

- 新增試用資料回歸：25 個成人健檢列合為 2 組，初始計數與正式清單皆 97。另涵蓋 Composition 巢狀參照、不同日期／機構分開、一般結果不被合併。
- 報告相關 66 suites、453 tests 通過；非增量型別檢查、全 repo lint 與正式建置皆通過（exit 0）。
- localhost Chrome：仍在累積報告時初始「全部 (97)」，打開全部後仍為 97，影像維持 8。搜尋 2018 顯示成人健檢群組與 21 項內容，收合及重新展開正常；清空搜尋回到 97。
- 本輪不刪除下一群，不提交、推送或部署。

Visible behaviour changes: 報告「全部」初始標籤與清單一致，試用資料由初始 120 修正為 97；未隱藏任何資料或臨床入口。搜尋提示仍使用原始項目數，與群組列數是不同單位，本輪未改該提示。


## D14 待審核：未接入正式流程的錯誤分類工具（2026-09-09）

狀態：僅盤點與執行原測試，尚未刪除；等待擁有者逐群核准。

建議刪除：
- `src/shared/errors/app-error.ts`：AppError、六個子類別、ErrorCode、getErrorCode。全 repo 引用搜尋僅找到專屬測試；兩個語系檔另有 AppError 註解，沒有呼叫。
- `__tests__/shared/errors/app-error.test.ts`：16 項測試只驗證上述工具的建構、錯誤碼、序列化及繼承；刪前原測試 16/16 通過。這些不是正式登入或 AI 流程測試，提案為隨工具刪除，不假稱已搬移或保留其覆蓋。

保留：正式 `src/core/errors/`、Firebase SDK 的 FirebaseError、登入用 getAuthErrorMessage、useAuthDialog 的 AuthError 型別及全部語系文字。同名類別已依 import 來源區分；useAgentChat 使用的是 core/errors 的 getUserErrorMessage。

核准後驗證：執行現行 error-message、openai-compatible.service、ai-outcome 測試，型別檢查、lint、正式建置；接著在 localhost 以現有登入狀態開啟試用資料、報告與聊天介面，切換明暗主題確認顯示正常。錯誤分支以現行測試驗證，不刻意破壞帳號或伺服器來製造失敗。完成本群驗證後才進入下一群。

Visible behaviour changes: none（預期；待執行驗證）。未提交、推送或部署。


### D14 執行結果（2026-09-09）

擁有者回覆「同意」，已刪除核准的 app-error.ts 與專屬 16 項測試。正式錯誤處理、同名但不同來源的型別與語系文字均保留。

- 現行錯誤訊息、OpenAI-compatible 服務、AI outcome 共 3 suites、20 tests 通過；非增量型別檢查、全 repo lint、正式建置均 exit 0。
- localhost Chrome 以既有 beneproto123 登入狀態載入試用資料，病人資訊與摘要正常；報告全部 97、影像 8，胸部 X 光可展開顯示全文。
- 臨床對話輸入測試草稿，放大、Escape 還原後文字保留，最後清除草稿；本輪未送出 AI 問題，不宣稱完成真實 AI 回覆測試。錯誤分支以現行自動測試覆蓋。
- 設定切換亮色→暗色→亮色，檢視切換完成後截圖，報告全文、分頁、顯示設定正常，恢復原亮色。
- 更新本紀錄前，比對本群開始時檔案雜湊，僅上述兩檔刪除，其餘既有檔案沒有異動；其他 WIP 保留。

Visible behaviour changes: none。未提交、推送或部署。下一群仍須先審核。


## D15 待審核：未接入啟動流程的設定檢查工具（2026-09-09）

狀態：尚未刪除，等待擁有者逐群核准。

建議刪除：
- `src/shared/config/env-validator.ts`：檢查必填／選填環境變數與輸出警告的工具。全 repo（含隱藏設定、排除產物與依賴）符號與路徑搜尋只有專屬測試引用；validateAppEnvironment 沒有呼叫者，檔案本身也未在頂層呼叫它。
- `__tests__/shared/config/env-validator.test.ts`：13 項測試只驗證上述通用工具，未測 validateAppEnvironment 或正式啟動流程。刪前 13/13 通過；提案隨工具刪除，沒有聲稱移轉覆蓋。

保留：`.env.example`、所有實際環境設定、`src/shared/config/env.config.ts`、`src/shared/config/firebase.config.ts`、正式登入與 AI 連線流程及其測試。Firebase 初始化直接讀取設定，不經上述舊工具。移除未呼叫工具不代表新增或強化正式設定驗證。

核准後驗證：現行 env.config、ai-config.store、openai-compatible.service 測試，型別、lint、正式建置；localhost 重新載入並確認既有登入狀態、試用資料、報告與聊天介面、明暗主題切換。完成實機驗證才進下一群。不變更實際金鑰或服務設定。

Visible behaviour changes: none（預期，待執行驗證）。本輪只寫提案，未提交、推送或部署。


### D15 執行結果（2026-09-09）

擁有者回覆「好」，已刪除核准的 env-validator.ts 與其 13 項專屬測試。實際環境設定、Firebase 初始化、登入與 AI 連線實作保留。

- env.config、ai-config.store、openai-compatible.service 共 3 suites、67 tests 通過；非增量型別檢查、全 repo lint、正式建置均 exit 0。
- localhost Chrome 新開頁載入完成後恢復 beneproto123 登入狀態；試用資料可載入，報告全部 97、影像 8，胸部 X 光可展開全文。
- 聊天可輸入草稿、放大並以 Escape 還原，草稿保留後清除；本輪未發送 AI 問題，不宣稱測過真實 AI 回覆。
- 顯示設定亮色→暗色→亮色，檢視切換完成截圖確認報告與設定呈現正常，恢復原亮色。
- 更新紀錄前雜湊比對僅上述兩檔刪除，其餘既有檔案未變動；其他 WIP 保留。

Visible behaviour changes: none。未提交、推送或部署。下一群仍待審核。


## D16 待審核：未使用的就診關聯分類工具（2026-09-09）

狀態：只完成盤點與原測試，尚未刪除，等待擁有者核准。

建議刪除：
- `src/core/utils/encounter-link.utils.ts`：將項目分成「有對應就診紀錄」與「沒有對應就診紀錄」的工具。搜尋路徑及 encounterIdSet、isEncounterLinked、partitionByEncounterLink，正式程式無引用，僅專屬測試使用。
- `__tests__/core/encounter-link.utils.test.ts`：4 項測試，驗證 ID 集合、相對參照／裸 ID、無參照／失效參照分類、無就診資料。原測試 4/4 通過。提案為隨工具刪除，沒有將此分類規則新增到現行產品，也不聲稱已移轉測試。

保留：現行 useEncounterDetails、就診紀錄與用藥頁、medicationsCategory、proceduresCategory、encountersCategory 及相關測試。此提案只移除未呼叫的工具，不移動或隱藏任何病人紀錄；正式就診明細使用自己的參照處理與資料組裝。

核准後驗證：useEncounterDetails、useEncounterDetails-multiday、useVisitHistory、VisitItem-inpatient-medication-periods 測試，型別、lint、正式建置。localhost 以既有帳號載入試用資料，操作就診紀錄展開及篩選、用藥頁、明暗主題並確認顯示正常，完成後才進下一群。

Visible behaviour changes: none（預期，待執行驗證）。未提交、推送或部署。


### D16 執行結果（2026-09-09）

擁有者回覆「好」，已刪除 encounter-link.utils.ts 與專屬 4 項測試。正式就診與用藥關聯邏輯保留。

- useEncounterDetails、useEncounterDetails-multiday、useVisitHistory、VisitItem-inpatient-medication-periods 共 4 suites、57 tests 通過；非增量型別、全 repo lint、正式建置皆 exit 0。
- localhost Chrome 既有 beneproto123 登入狀態載入試用資料，全部就診 46 筆；選住院後 11 / 46 筆，展開 2025/05/18–05/22 住院可見出院病摘入口，展開用藥顯示 15 筆及給藥期間／總量。
- 獨立用藥頁顯示用藥 148、使用中 10 與用藥歷史；亮色→暗色→亮色切換後檢視截圖，頁面與設定正常，恢復原亮色。
- 更新紀錄前雜湊比對僅核准兩檔刪除，其他既有檔案沒有異動；其他 WIP 保留。

Visible behaviour changes: none。未提交、推送或部署。A、B、C 與 D1–D16 共 19 群已完成；尚未判定的候選不算已核准群，最終清理群數未定。下一群仍待審核。


## 剩餘候選收斂盤點（2026-09-09，D16 後）

重新執行引用圖，排除已刪除檔案與測試入口。現有候選分四個範圍，並非四群全部核准刪除：
1. 舊 observationsCategory：本次 D17 提案。
2. 舊 transcription hook／use case／service／interface：仍待確認現行錄音路徑及實機驗證方法。
3. 七個 index 入口：clinical-summary、feedback、medical-calculator、medical-chat、settings、application/hooks、application/providers。屬公開入口或轉匯出，沒有 app 引用不等於應刪，需判定協作價值。
4. AI 工具定義：clinical-skill-tools 已知外部評測使用，保留；fhir-tool-definitions 需核對外部／server 消費端，暫不刪。

本盤點限制為目前引用圖與候選範圍，不能推定整个 repo 已無其他死碼。既有 WIP 與上述暫留項不為湊清理數量而刪。

## D17 待審核：未使用的舊「其他觀察資料」分類（2026-09-09）

尚未刪除，等待核准。

- 刪除 `src/core/categories/observations.category.ts` 與 `__tests__/core/categories/observations.category.test.ts`。該分類未被正式程式引用，initializeCategories 已明確 unregister('observations')，此次不改分類註冊或可見性。專屬 5 項測試驗證舊分類的最新／全部／時間範圍及文字輸出，提案隨分類刪除，不聲稱移轉這 5 項覆蓋。
- 修改 `__tests__/core/categories/lab-reports.category.test.ts` 的一項跨分類案例：改成直接使用仍在正式流程使用的 selectOtherObservations；保持原 fixture、labs 為空與 others 僅 other-1 的斷言不變。這是舊 extractData 原本直接委派的同一函式。
- 保留 observation-selectors.ts、ai-clinical-scope.utils.ts、clinical-context-coverage.utils.ts、所有現行資料／篩選設定與相關測試，不移除任何病人觀察資料。

刪前原分類、lab reports、selector 共 35 tests 通過。核准後跑 lab reports、selector、AI scope、coverage 測試及型別、lint、正式建置；localhost 操作報告分類／搜尋／展開、累積檢驗、明暗主題，確認功能正常後才往下。若行為有差異，先釐清，不刪断言湊通過。

Visible behaviour changes: none（預期，待執行驗證）。未提交、推送或部署。


### D17 執行結果（2026-09-09）

擁有者回覆「好」，已刪除 observations.category.ts 與專屬 5 項測試。lab-reports.category.test.ts 的跨分類案例改直接呼叫 selectOtherObservations，原 fixture 與兩個斷言不變。正式註冊、篩選、coverage 與病人資料均未改動。

- lab reports、selector、AI scope、coverage 共 4 suites、41 tests 通過；非增量型別、全 repo lint、正式建置皆 exit 0。
- localhost Chrome 既有帳號載入試用資料，報告全部 97、影像 8；累積檢驗由血液切生化，BUN、CREA、eGFR 可見。
- 影像搜尋 Chest 顯示 3 筆，可展開胸部 X 光全文；搜尋提示原有「3 / 120」採原始項目數，為已記錄的計數單位差異，本輪未改。清空搜尋恢復原筆數。
- 亮色→暗色→亮色切換檢視截圖，報告、搜尋結果與設定呈現正常，恢復原亮色。
- 更新紀錄前雜湊比對僅核准兩檔刪除與一測試修改，其他既有檔案沒有異動，其他 WIP 保留。

Visible behaviour changes: none。未提交、推送或部署。A–C、D1–D17 共 20 群完成；後續仍待逐群審核。


## D18 待審核：未使用的舊語音轉文字流程（2026-09-09）

尚未刪除，等待擁有者核准。

建議刪除五檔：
- `src/application/hooks/use-transcription.hook.ts`
- `src/core/use-cases/transcription/transcribe-audio.use-case.ts`
- `src/infrastructure/ai/services/transcription.service.ts`
- `src/core/interfaces/services/transcription.service.interface.ts`
- `__tests__/core/use-cases/transcription/transcribe-audio.use-case.test.ts`（10 項舊流程測試）

另從 `src/application/hooks/index.ts` 移除 useTranscription 轉匯出一行，保留其他匯出與入口。引用搜尋確認這組程式互相引用，外部入口僅上述未使用的轉匯出，正式 MedicalChat 使用的是 features/medical-chat/hooks/useVoiceRecording.ts。

保留現行 useVoiceRecording、AsrProvider、錄音按鈕、ReactMediaRecorder 串接、共用 TranscriptionRequest／Response 型別、設定及 proxy auth。原舊流程 10 tests 與現行錄音 12 tests 共 22 tests 通過。舊測試涵蓋轉送參數、空音檔、服務不可用與錯誤傳遞，不假稱全部搬移到現行測試；現行測試覆蓋錄音模型綁定、設定變更取消、病人資料切換丟棄、重複停止與 StrictMode。

核准後：執行現行錄音測試、型別、lint、正式建置；localhost 操作聊天錄音啟動／停止與狀態恢復、聊天輸入及明暗主題。若麥克風權限、裝置或轉錄服務阻擋，明確記錄阻擋並停在本群，不以按鈕存在取代錄音成功，也不宣稱靜音測試驗證了辨識準確度。

Visible behaviour changes: none（預期，待執行驗證）。未提交、推送或部署。


### D18 執行結果（2026-09-09）

擁有者回覆「好」，已刪除核准四個舊錄音流程程式與專屬測試，移除 hooks/index.ts 的 useTranscription 轉匯出一行。現行 useVoiceRecording 與共用型別保留，正式程式／測試無舊流程引用。

- 現行錄音 12 tests 通過；非增量型別、全 repo lint、正式建置均 exit 0。
- localhost Chrome 使用既有帳號及試用資料。第一次點錄音等待 Chrome 麥克風權限，切到該分頁確認提示後選「這次允許」，使用既有 Microsoft Teams Audio Device (Virtual)，沒有更改裝置。
- 實機狀態由錄音→停止錄音→處理中→錄音，轉錄完成，輸入框收到文字 you。因為是虛擬音訊裝置且未使用已知語句，僅證明錄音／轉錄／回填流程可完成，不代表辨識準確度測試。
- 替換為測試草稿後放大、Escape 還原文字仍在，最後清除草稿，未送出聊天。
- 明暗主題來回切換，檢視截圖確認病人資訊、設定顯示正常，恢復原亮色。
- 更新紀錄前雜湊比對只包含核准五檔刪除與一行轉匯出修改，其他既有檔案未動，WIP 保留。

Visible behaviour changes: none。未提交、推送或部署。A–C、D1–D18 共 21 群完成；後續仍待審核。


## 最後兩範圍的保留決策與 D19 提案（2026-09-09）

七個 index 入口保留：features/clinical-summary、feedback、medical-calculator、medical-chat、settings 及 src/application/hooks、providers。它們提供轉匯出／公開介面；docs/FEATURES.md 明列 index.ts 作為 public API。引用圖無 app 消費者不足以否定協作價值，不為增加刪除數量而移除。

clinical-skill-tools.ts 保留：已讀取相鄰 medical-agent-harness/scripts/eval/skills.ts，確認其實際 import createEgfrTool、createTerminologyTool。維持原路徑。

### D19 待審核：未使用的舊 FHIR 工具定義

只建議刪除 `src/infrastructure/ai/tools/fhir-tool-definitions.ts`。檔案提供 createFhirToolDefinitions，含六個僅有 schema／description、沒有 execute 的工具。正式聊天 useAgentChat → useFhirTools → createFhirTools 使用另一個 fhir-tools.ts，保持不變。

引用證據：本 repo 未找到 createFhirToolDefinitions 或檔案引用；另外搜尋相鄰 medical-agent-harness、firebase-smart-on-fhir、mediprisma-gateway、tvgh-mediprisma-gateway 亦無引用。這只涵蓋目前本機可查範圍，不保證其他未取得 repo 或遠端版本沒有使用。該檔沒有專屬測試需刪。

核准後：執行 fhir-tools 與 fhir-observation-components 現行測試、型別、lint、正式建置；localhost 載入試用資料，在臨床對話提出需要查詢病歷的簡短問題，確認實際工具查詢及回覆，再確認明暗主題顯示。若 AI 服務阻擋，停留本群回報，不宣稱驗證完成。

Visible behaviour changes: none（預期，待執行驗證）。本群尚未刪除，等待核准。若本群完成，本輪已列出的死碼候選可收尾；保留的公開入口與外部評測工具不算待刪群。其他 WIP 仍獨立保留，不代表其功能已完成。


### D19 執行進度：刪除完成，實際 AI 查詢待授權（2026-09-09）

擁有者回覆「繼續」，已刪除核准的 fhir-tool-definitions.ts。113 項現行工具測試、非增量型別、lint、正式建置全部 exit 0。紀錄更新前雜湊比對僅核准單檔刪除，其他 WIP 未變。

localhost 既有帳號載入試用資料，明暗主題切換與還原亮色正常。臨床對話已開無痕模式，模型顯示 GPT-5.6 Luna；準備問題「請使用病歷查詢工具，查出這位試用病人最近一次 eGFR 的日期與數值，簡短回答並附來源。」。

自動審核拒絕點擊傳送：理由是查詢及可能檢索的病歷資料將送至雲端 AI，要求針對此資料與目的地的更明確授權。未重試或繞過，查詢未送出。實際工具呼叫及回覆尚未驗證，因此 D19 未標示完成，本輪仍為 21 群完成加 1 群待驗證。待擁有者授權後繼續此項。

未提交、推送或部署。Visible behaviour changes: none（刪除未改正式流程，完整實機驗證仍待完成）。


### D19 三供應商實機結果（2026-09-09）

擁有者明確同意試用資料外傳並要求三供應商驗證。localhost Chrome 既有帳號、同一份試用 Bundle、各自新的無痕對話；問題皆為「請使用病歷查詢工具，查出這位試用病人最近一次 eGFR 的日期與數值，簡短回答並附來源。」。沒有變更金鑰或端點。

- OpenAI / GPT-5.6 Luna：兩次皆顯示「依名稱搜尋檢驗」步驟，隨後顯示「AI 服務暫時無法回應，請稍後重試；若持續發生，請改用其他模型。」。未取得完成回覆，不算通過。首次 UI 診斷預覽亦只有相同錯誤，API 未回報實際模型；尚未取得可判定根因的底層錯誤，不推定是刪除導致或特定供應商故障。
- Google / Gemini 3.1 Flash-Lite：成功，步驟顯示依名稱搜尋檢驗，回覆日期 2026-06-02、32 mL/min/1.73m2，說明來源為 Observation 資源。
- Anthropic / Claude Haiku 4.5：成功，步驟顯示依名稱搜尋檢驗，回覆 2026年6月2日、32 mL/min/1.73m²，來源為 Estimated GFR 觀察紀錄。

數值已對照 public/demo/demo-bundle.json 的 demo-observation-7（Estimated GFR、2026-06-02、value 32）。此為產品功能測試，不是臨床建議。Gemini／Claude 的來源說明為文字，未宣稱已驗證可點擊引用。測試後模型恢復 GPT-5.6 Luna；無痕測試未保存到聊天歷史。

D19 仍待 OpenAI 路徑排查／驗證，不能宣稱三家全過或本輪 22 群全數完成。既有 113 tests、型別、lint、建置與明暗主題已通過，未重跑無異動的檢查。此輪只補驗證紀錄，未改正式實作、提交、推送或部署。


### D19 OpenAI 失敗原因調查（2026-09-09）

本輪只讀取程式與瀏覽器網路紀錄，未修改正式實作。重現同一試用 eGFR 問題，擷取結構／狀態而不輸出請求憑證。

已確認證據：
1. 開發 proxy 的第一輪 HTTP 200，response.completed.model 為 gpt-5.6-luna、store 為 false；output 有 reasoning（包含 encrypted_content）與 function_call。
2. 前端請求沒有明確指定 store。已安裝 @ai-sdk/openai 的 responses model 將缺省 store 當 true（openai-responses-language-model.ts），converter 因而在第二輪用 item_reference 代替完整 reasoning 項目。
3. 第二輪 input 有 item_reference、function_call、function_call_output；item_reference 的 id 確認對應第一輪 reasoning 項目。第二輪與 SDK 重試 HTTP 502，回應 upstream_error / Upstream request failed。
4. 相鄰 firebase-smart-on-fhir/functions/src/services/openai/responses.ts 的 sanitizeResponsesPayload 強制 store:false；與實際第一輪回應一致。

判斷：前後端對 OpenAI 回覆是否儲存的認知不一致。SDK 在未儲存模式下仍送出 reasoning 項目參照，是工具後續請求的具體相容性問題，與刪掉未引用的 fhir-tool-definitions.ts 無程式依賴關係。proxy 隱藏上游詳細錯誤，目前未取得 OpenAI 原始 4xx 訊息，因此不杜撰上游錯誤碼；因果最終確認應透過修正後相同案例 A/B 驗證。

建議修正：在 proxy 的 OpenAI Responses model 上統一套用 providerOptions.openai.store=false（於 SDK 轉換 messages 前生效）。不可只在 fetch 階段塞 store:false，那時 item_reference 已產生；也不應改後端為 store:true。SDK 會按無儲存模式傳送 reasoning 的加密內容及工具結果。需補兩輪工具往返的回歸測試，再 localhost 重跑 OpenAI，確認第二輪不再 item_reference 且回覆 2026-06-02／32。此修正尚未實作，D19 仍待修正驗證。


### OpenAI 修正與 D19 完成（2026-09-09）

擁有者要求「請修正」。新增 openai-stateless.middleware.ts，於 proxy OpenAI Responses model 的 SDK transformParams 階段強制 providerOptions.openai.store=false，同時保留呼叫端其他選項。僅套用 factory 的 proxy Responses 分支；直接金鑰、Chat Completions、Gemini、Claude 不受影響。後端不儲存政策維持不變。

- 新增使用已安裝真實 OpenAI SDK 的兩輪 generateText 工具回歸測試，mock 僅在 HTTP 邊界：確認工具執行、兩輪 store:false、加密 reasoning 回送、call/output 配對、無 item_reference，且 reasoningEffort 保留；另更新 factory 路由測試。
- 相關 4 suites、19 tests 通過；非增量型別、全 repo lint、正式建置皆 exit 0。
- localhost 新分頁、既有帳號、同一試用資料與無痕問題，GPT-5.6 Luna 回覆「2026-06-02，32 mL/min/1.73m2」，附來源文字，與 demo 一致；截圖確認顯示正常。
- CDP 僅輸出請求結構及狀態：第一輪與第二輪都是 HTTP 200、store:false、include reasoning.encrypted_content；第二輪 input 包含 reasoning、function_call、function_call_output，不再 item_reference。原失敗由 200→502 變為 200→200，確認修正解決本案例。
- 先前 Gemini 3.1 Flash-Lite、Claude Haiku 4.5 已用同一問題成功；此修正只作用於 OpenAI proxy Responses，未重新宣稱其他路徑本輪重測。
- 官方依據：https://developers.openai.com/api/reference/cli/resources/responses/methods/create 說明 reasoning.encrypted_content 支援 store:false 的多輪無狀態使用。

Visible behaviour changes: OpenAI proxy 工具查詢後可正常產生回覆；沒有移除臨床入口或開啟伺服器回覆儲存。D19 現已完成，本輪已列候選 A–C、D1–D19 共 22 群完成，保留公开入口與已確認的外部評測工具。其他 WIP 仍保留，不宣稱整個 repo 的所有 WIP 已完成。未提交、推送或部署。


### 2026-09-09 摘要模型缺金鑰與錯誤顯示修正

標準醫療摘要保留選定模型；需要自備金鑰的模型若缺少憑證，手動與自動生成均不再靜默改用預設模型。共享串流入口也拒絕缺金鑰的付費模型，避免預檢後憑證消失時改送其他模型。其他功能既有的模型偏好讀取策略本次未全面改寫。

生成失敗時，摘要上方顯示該次模型的錯誤，提供重新設定模型、改用預設模型、重試；所有卡片同一錯誤只列一次。錯誤與保留摘要分開判斷，避免舊摘要遮住新錯誤，也避免新錯誤隱藏舊摘要。切換模型後不沿用前一模型的錯誤。窄面板依容器寬度排列按鈕，手機操作區放大。

localhost 實測：目前 Gemma / OpenRouter 設定的金鑰欄位為空（僅檢查是否為空，未讀取或輸出任何憑證），重新產生回報 API Key 錯誤；尚不能確認憑證何時或為何消失。設定入口及改用預設模型可操作，返回 Gemma 後保留原有六類摘要及來源。亮暗主題、320/390/430/768/1024/1440 寬度檢視完成；768 窄分欄擠壓文字的問題已修正。實作過程曾誤用生成錯誤判斷舊摘要卡片可見性、造成只剩安全卡，已修正並實機確認六類卡片恢復。

9 suites / 96 tests、型別、lint、正式建置通過。使用者的金鑰及自訂連線未修改；Gemma 真實成功生成仍需重新設定有效金鑰。本次無刪檔、無提交／推送／部署。


### 2026-09-09 安全提醒重複重試入口收尾

使用者明確核准移除標準醫療摘要安全提醒卡內的重試按鈕。移除該卡的 retry props 接線；共享 SafetyAlertsPanel 的可選重試能力保留。錯誤訊息、安全內容、摘要上方統一重試均保留。可見性紀錄同步至 LAUNCH-ROUTE-GATES.md。

localhost 以試用病人重現 Gemma 金鑰錯誤並操作上方重試，確認頁面只有一個重試按鈕，安全卡內仍顯示錯誤及兩項既有提醒。測試後恢復原先 Qwen 模型選擇，未修改任何金鑰。13 tests、型別、lint、正式建置通過。

Visible behaviour changes:
- 標準醫療摘要（`/` 與共用此元件的啟動查詢路徑）：安全提醒卡不再提供獨立重試；使用摘要上方統一重試。其他臨床內容及操作保留。

未提交、推送或部署。
