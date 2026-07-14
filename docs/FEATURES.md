# Feature 模組指南

> 現行規格｜基準版本：v0.40.0｜最後核對：2026-07-14

本專案以 `features/<feature-name>/` 封裝使用者可見能力。Feature 可以使用 core 與 application 提供的 interface、use case、hook 與 provider；具體 FHIR、AI、Firebase 存取通常由 application facade 或 composition root 提供。

## 依賴規則

建議依賴方向：

```text
core <- shared <- infrastructure <- application <- features <- app
```

Feature 可以：

- 匯入 `src/core` 的 entity、type、interface 與純 use case。
- 匯入 `src/application` 的 hooks、providers、stores 與 composition facade。
- 匯入 `src/shared` 的 constants、utils 與共用元件。
- 匯入 `components/ui` 的 shadcn primitives。
- 經 feature 的 `index.ts` 公開 API 供 app 或其他 composition 點使用。

Feature 不應：

- 直接匯入另一個 feature 的內部檔案形成循環依賴。
- 在 core 或 shared 反向匯入 feature UI。
- 新增直接連到 `src/infrastructure` 的依賴；目前例外已逐檔列於 `eslint.config.mjs`。
- 在 module import 時建立會初始化 Firebase 或瀏覽器 API 的副作用。

跨 feature 共用能力應下移到 core/shared/application；若只是組合 UI，放在 `app/` 或 layout composition。

## 目前功能模組

| 目錄 | 使用者能力 | 主要入口／狀態 |
|---|---|---|
| `auth` | Email/Password、Google 登入、驗證提示 | `AuthDialog`、`HeaderAuthButton`、auth provider |
| `chat-history` | 依病人與 FHIR server 瀏覽／載入／刪除對話 | Firestore `users/{uid}/chats` |
| `clinical-insights` | 自訂摘要模組、提示詞、排序、auto-generate | `ClinicalInsightsRuntimeProvider`；嵌入 Medical Summary |
| `clinical-summary` | 左側病人、就診、報告、用藥、文件資料卡 | `feature-registry.ts` |
| `data-selection` | 選擇 AI 摘要資料範圍與預覽 | `DataSelectionDrawer`、provider |
| `feedback` | 回報問題／建議 | Header overflow；外部 URL 或 `/api/feedback` |
| `import-bundle` | 匯入 JSON、載入 demo、清除本地資料 | `LocalBundleService` |
| `ips-export` | 產生 IPS Bundle／Markdown、推論待確認問題 | `Feature.tsx`；人工逐項確認 |
| `medical-calculator` | 57 個臨床公式／評分、病人數值帶入 | 10 類 calculator definitions |
| `medical-chat` | 單一路徑 Agent 對話、語音、圖片、範本、追問 | `Feature.tsx`、`useAgentChat` |
| `medical-summary` | 固定 schema AI 簡報、source navigation、卡片版面 | 右側預設 feature |
| `proactive-safety-alerts` | 結構化用藥／檢驗安全提醒卡 | 由 Medical Summary orchestrator 使用 |
| `prompt-gallery` | 共享 chat／summary prompt 的瀏覽、篩選與分享 | Firestore `sharedPrompts` |
| `report-interpretation` | 報告忠實翻譯與白話解讀 | Reports 內隨選生成 |
| `settings` | API key、顯示與 chat template 設定 | 右側固定 gear tab |

`features/clinical-summary` 再依資料域分成：

- `patient-info`
- `vitals`
- `problem-list`
- `advance-directives`
- `devices`
- `care-plans`
- `visit-history`
- `reports`
- `medications`（含過敏與疫苗子分頁）
- `document-summary`

## 左側 registry

`src/shared/config/feature-registry.ts` 是左側面板的唯一清單。

```ts
export interface FeatureConfig {
  id: string
  name: string
  component: ComponentType
  tab: string
  order: number
  enabled: boolean
}
```

目前 tabs：`patient`、`visits`、`reports`、`meds`、`documents`。新增左側 feature：

1. 在 `features/clinical-summary/<name>/` 建立元件與必要測試。
2. 在 registry import 元件。
3. 新增 `FeatureConfig`，指定 tab 與 order。
4. 若是新 tab，再新增 `TabConfig` 與中英文 i18n key。
5. 驗證 phone、tablet、desktop 與 empty state。

`registerFeature()`／`disableFeature()` 仍存在，但 runtime 改動 module-level array 不會自動觸發 React re-render；正式功能開關應在 build-time 編輯 registry。

## 右側 registry

`src/shared/config/right-panel-registry.ts` 定義右側 tabs，但元件映射與 lazy import 位於 `src/layouts/RightPanelLayout.tsx`。

```ts
export interface RightPanelFeatureConfig {
  id: string
  name: string
  tabLabel: string
  order: number
  enabled: boolean
  pinned?: boolean
  pinLocked?: boolean
  iconOnly?: boolean
  forceMount?: boolean
  contentClassName?: string
  scrollMode?: 'panel' | 'feature'
}
```

新增右側 feature：

1. 建立 `features/<name>/Feature.tsx`。
2. 在 registry 新增設定。
3. 在 `RightPanelLayout.tsx` 的 component map 註冊 lazy component。
4. 新增 `tabLabel` i18n。
5. 決定是否需要 `forceMount`、pin 與捲動所有權。
6. 補 registry／layout 測試及 E2E happy path。

目前順序為 Medical Summary、Medical Chat、Medical Calculator、IPS Export、Settings；實際 order number 不要求連續。Settings 使用 `pinLocked` 與 `iconOnly`，永遠保有入口。

## 建議目錄形狀

```text
features/example/
├── Feature.tsx              # registry-facing entry（若需要）
├── index.ts                 # public API
├── components/
├── hooks/
├── utils/
└── types.ts                 # 只在 feature 內使用的 UI type
```

只有真正需要公開的 symbol 才從 `index.ts` 匯出。其他 feature 不應 deep import `features/example/components/...`。

## 資料與狀態放置

- 純醫療規則、schema、mapper interface：`src/core`。
- React Query data access 與跨 feature orchestration：`src/application/hooks`。
- 跨功能 UI state：`src/application/stores` 或 provider。
- API／FHIR／Firebase 實作：`src/infrastructure`。
- 只屬於單一畫面的展開、drawer、輸入狀態：feature component／hook。
- 受 PHI 影響的持久化：先經 security review，不直接寫 localStorage。

## Feature 完成檢查

- [ ] 有 loading、error、empty、content 四種狀態。
- [ ] 中英文與 medical/patient audience 的文字已處理。
- [ ] icon-only control 有可讀的 `aria-label`。
- [ ] 觸控操作與 768px 雙面板不會溢出。
- [ ] 病人或 bundle 切換後，不殘留上一個 context。
- [ ] AI 生成可取消、有 timeout、顯示實際模型與錯誤。
- [ ] 引用與數值可回查來源；不能回查時明確標示。
- [ ] `npx tsc --noEmit`、`npm run lint`、相關 Jest／Playwright 通過。

## 相關文件

- [系統架構](ARCHITECTURE.md)
- [AI Agent](AI_AGENT_IMPLEMENTATION.md)
- [Medical Chat](MEDICAL_CHAT.md)
- [文件索引](README.md)
