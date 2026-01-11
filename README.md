# 醫析 MediPrisma · SMART on FHIR

> **語言選擇 / Language Selection:**  
> 📖 [**中文版**](#中文版) | 📖 [**English Version**](#english-version)

---

# 中文版

[🔝 返回頂部](#mediprisma--smart-on-fhir) | [🌐 切換到 English](#english-version)

基於 **Next.js 16**、**SMART on FHIR** 和 **AI 整合**（OpenAI GPT / Google Gemini）建構的智能臨床文件助理系統。本應用程式採用**整潔架構**和**可插拔設計**，協助醫療人員高效檢視病患資料、生成臨床摘要，並透過 **AI Agent** 自動查詢 FHIR 資料，提供智能化的臨床決策支援。

## 🌐 線上展示

**Demo 網站：** https://voho0000.github.io/medical-note-smart-on-fhir

**Launch URL（用於 SMART Launcher）：** https://voho0000.github.io/medical-note-smart-on-fhir/smart/launch

> 💡 **提示：** 請透過 SMART on FHIR Launcher（如 [SMART Health IT Launcher](https://launch.smarthealthit.org/)）輸入上述 Launch URL 來啟動應用程式。詳細說明請參閱[使用者指南](./USER_GUIDE.md)。

## 🎯 主要功能

### 臨床資料整合
- **SMART on FHIR OAuth 2.0** 身份驗證（使用 PKCE）
- 從 FHIR 伺服器即時擷取病患資料
- **可插拔架構**：透過 Registry 輕鬆新增、替換或移除功能
- 完整的臨床資料顯示：
  - 病患基本資料和生命徵象
  - 診斷和病況
  - 用藥和過敏史
  - 診斷報告和觀察記錄
  - 就診紀錄

### AI 驅動的智能功能
- **AI Agent（深入模式）**：🆕 AI 自動調用多種工具查詢資料
  - **FHIR Tools**：6 種 FHIR 資源查詢（診斷、用藥、過敏、檢驗、處置、就診）
  - **Literature Search**：整合 Perplexity API 搜尋醫學文獻、臨床指引、實證醫學資訊
    - 支援 PubMed、NIH、WHO 等權威來源
    - 提供引用連結和來源追溯
    - 基礎模式（sonar）和進階模式（sonar-pro）
  - 客戶端 Tool Calling 架構，安全且高效
  - 智能理解臨床問題並自動擷取相關資料
- **筆記對話（一般模式）**：互動式 AI 助理，用於臨床查詢和筆記生成
- **臨床洞察**：自動生成臨床摘要，可自訂提示和標籤
  - 安全警示（Safety Flag）
  - 變化摘要（What's Changed）
  - 臨床快照（Clinical Snapshot）
- **提示範本**：可重複使用的提示範本，加快筆記撰寫速度
- **語音錄製**：音訊錄製搭配 Whisper 轉錄，實現免手持文件記錄
- **資料選擇**：篩選和選擇特定臨床資料，提供情境感知的 AI 回應

### 多語言支援
- 英文和繁體中文介面
- 無縫語言切換

### 現代化 UI/UX
- 響應式設計（手機、平板、桌面）
- 可調整大小的分割面板佈局
- 深色模式支援
- 使用 shadcn/ui 元件和 Tailwind CSS 建構

---

## 🛠️ 技術堆疊

- **框架**：Next.js 16（App Router）
- **UI 元件**：shadcn/ui（Radix UI）
- **樣式**：Tailwind CSS 4
- **FHIR 客戶端**：fhirclient 2.6.3
- **AI 整合**：
  - Vercel AI SDK 6.0.6（支援 Tool Calling）
  - OpenAI API（GPT-4o, GPT-4o-mini 等）
  - Google Gemini API（Gemini 2.0 Flash, Pro 等）
- **狀態管理**：React Context API + Zustand
- **測試**：Jest 搭配 React Testing Library
- **TypeScript**：完整型別安全
- **架構模式**：Clean Architecture（整潔架構）

---

## 📋 前置需求

- **Node.js**：18.18+ 或 20.x LTS
- **套件管理器**：npm、pnpm 或 yarn
- **API 金鑰**（進階模型選用）：
  - OpenAI API 金鑰（用於進階 GPT 模型）
  - Google Gemini API 金鑰（用於進階 Gemini 模型）
  - Perplexity API 金鑰（用於 AI Agent 文獻搜尋功能）
  - 內建模型可透過 Firebase Functions 代理使用，無需個人金鑰
- **FHIR 伺服器**：存取 SMART on FHIR 沙盒或 EHR 系統

---

## 🚀 安裝與設定

### 1. 安裝相依套件

```bash
npm install
```

### 2. 開發伺服器

```bash
# 使用 webpack（開發環境建議）
npm run dev:webpack

# 使用 Turbopack（實驗性）
npm run dev
```

應用程式將在 `http://localhost:3000` 上運行

### 3. 正式環境建置

```bash
# 建置正式環境
npm run build

# 啟動正式環境伺服器
npm start
```

### 4. 測試

```bash
# 執行測試
npm test

# 監視模式執行測試
npm test:watch

# 生成覆蓋率報告
npm test:coverage
```

---

## 🔐 SMART on FHIR 配置

### 沙盒設定

1. 在 SMART on FHIR 沙盒中註冊您的應用程式（例如 SMART Health IT Launcher）

2. 配置以下設定：
   - **Launch URL**：`http://localhost:3000/smart/launch`
   - **Redirect URL**：`http://localhost:3000/smart/callback`
   - **Client Type**：Public（PKCE）
   - **Client ID**：`my_web_app`（或您註冊的 ID）
   - **Scopes**：`launch openid fhirUser patient/*.read online_access`

3. 透過 SMART launcher 啟動應用程式

### 重要注意事項
- 務必透過 `/smart/launch` 啟動應用程式
- 不要直接重新整理 `/smart/callback`
- 會話資料儲存在瀏覽器儲存空間中

---

## 🔑 API 金鑰配置

應用程式提供內建 AI 模型，無需個人 API 金鑰即可運作。若要使用進階模型，請在**設定**標籤中配置您的金鑰：

1. 導航至設定標籤 → **AI 偏好設定**子標籤
2. （選用）輸入您的 OpenAI API 金鑰和/或 Google Gemini API 金鑰
3. 金鑰僅安全地儲存在瀏覽器本機儲存空間
4. 選擇您偏好的 AI 模型進行筆記生成

### 可用模型

**內建模型**（透過 Firebase Functions 代理，無需個人金鑰）：
- GPT-5 Mini（經濟實惠的基礎模型）
- GPT-5.1（臨床摘要推薦模型）
- Gemini 2.5 Flash（快速 Gemini 模型）
- Gemini 3 Flash Preview（預覽版）

**進階模型**（需要個人 API 金鑰）：
- GPT-5.2（最新進階模型）
- GPT-5 Pro（專業級模型）
- Gemini 2.5 Pro（進階 Gemini 模型）
- Gemini 3 Pro Preview（高級預覽版）

### 設定組織

設定標籤分為三個子標籤：
1. **AI 偏好設定**：模型選擇、API 金鑰、外觀（亮色/深色模式）
2. **提示範本**：建立和管理可重複使用的提示範本
3. **臨床洞察標籤**：自訂自動生成和洞察標籤

---

## 📁 專案結構

```
medical-note-smart-on-fhir/
├── app/                          # Next.js App Router
│   ├── api/                      # API 路由
│   │   ├── agent/                # AI Agent API
│   │   ├── fhir-proxy/           # FHIR API 代理
│   │   ├── gemini-proxy/         # Gemini API 代理
│   │   └── llm/                  # LLM 整合
│   ├── smart/                    # SMART on FHIR 驗證
│   │   ├── launch/               # OAuth 啟動端點
│   │   └── callback/             # OAuth 回調端點
│   ├── globals.css               # 全域樣式
│   ├── layout.tsx                # 根佈局
│   └── page.tsx                  # 主應用程式頁面
├── components/                   # 可重複使用的 UI 元件
│   └── ui/                       # shadcn/ui 元件
├── features/                     # 功能模組（可插拔）
│   ├── clinical-insights/        # AI 生成的臨床洞察
│   ├── clinical-summary/         # 病患資料顯示
│   │   ├── allergies/            # 過敏史
│   │   ├── diagnosis/            # 診斷
│   │   ├── medications/          # 用藥
│   │   ├── patient-info/         # 病患基本資料
│   │   ├── reports/              # 診斷報告
│   │   ├── visit-history/        # 就診紀錄
│   │   └── vitals/               # 生命徵象
│   ├── data-selection/           # 臨床資料篩選
│   ├── medical-chat/             # AI 對話介面
│   │   ├── components/           # 對話元件
│   │   ├── hooks/                # 對話 Hooks
│   │   │   ├── useAgentChat.ts   # AI Agent Hook（深入模式）
│   │   │   └── useChat.ts        # 一般對話 Hook
│   │   ├── types/                # 對話類型定義
│   │   └── utils/                # 對話工具函數
│   └── settings/                 # 應用程式設定
├── src/
│   ├── application/              # 應用層
│   │   ├── adapters/             # 外部服務適配器
│   │   ├── dto/                  # 資料傳輸物件
│   │   ├── hooks/                # 自訂 React hooks
│   │   └── providers/            # Context providers
│   ├── core/                     # 領域層
│   │   ├── categories/           # 資料分類
│   │   ├── entities/             # 領域實體
│   │   ├── errors/               # 錯誤定義
│   │   ├── interfaces/           # 領域介面
│   │   ├── registry/             # 註冊表
│   │   ├── services/             # 領域服務
│   │   └── use-cases/            # 業務邏輯
│   │       ├── agent/            # AI Agent Use Cases
│   │       ├── ai/               # AI Use Cases
│   │       ├── chat/             # 對話 Use Cases
│   │       ├── clinical-context/ # 臨床上下文
│   │       ├── clinical-data/    # 臨床資料
│   │       ├── clinical-insights/# 臨床洞察
│   │       ├── patient/          # 病患
│   │       └── transcription/    # 語音轉錄
│   ├── infrastructure/           # 基礎設施層
│   │   ├── ai/                   # AI 服務實作
│   │   │   ├── services/         # AI 服務
│   │   │   ├── streaming/        # 串流處理
│   │   │   └── tools/            # FHIR Tools for AI Agent
│   │   └── fhir/                 # FHIR 客戶端實作
│   ├── layouts/                  # 佈局元件
│   │   ├── LeftPanelLayout.tsx   # 左側面板佈局
│   │   └── RightPanelLayout.tsx  # 右側面板佈局
│   └── shared/                   # 共用工具
│       ├── components/           # 共用元件
│       ├── config/               # 配置檔案
│       │   ├── feature-registry.ts      # 左側面板功能註冊
│       │   └── right-panel-registry.ts  # 右側面板功能註冊
│       ├── constants/            # 常數定義
│       ├── di/                   # 依賴注入
│       ├── hooks/                # 共用 Hooks
│       ├── i18n/                 # 國際化
│       ├── types/                # 類型定義
│       └── utils/                # 工具函數
└── __tests__/                    # 測試檔案
    ├── application/              # 應用層測試
    ├── core/                     # 領域層測試
    ├── fhir/                     # FHIR 測試
    └── infrastructure/           # 基礎設施層測試
```

---

## 🏗️ 架構

本應用程式遵循**整潔架構**（Clean Architecture）原則：

```
┌─────────────────────────────────────────────────────────────┐
│                      展示層 (Presentation)                    │
│              app/ • features/ • components/                  │
│                    UI 元件和頁面                              │
├─────────────────────────────────────────────────────────────┤
│                      應用層 (Application)                     │
│                     src/application/                         │
│           應用程式特定邏輯、hooks 和 providers                  │
├─────────────────────────────────────────────────────────────┤
│                      領域層 (Domain)                          │
│                        src/core/                             │
│                    業務實體和用例                              │
├─────────────────────────────────────────────────────────────┤
│                    基礎設施層 (Infrastructure)                 │
│                    src/infrastructure/                       │
│              外部服務整合（FHIR、AI）                          │
└─────────────────────────────────────────────────────────────┘
```

### 關鍵設計模式
- **Provider 模式**：基於 Context 的狀態管理
- **Repository 模式**：資料存取抽象
- **Adapter 模式**：外部 API 整合
- **Registry 模式**：可插拔功能架構
- **Use Case 模式**：封裝業務邏輯
- **基於功能的組織**：模組化功能結構

### 🔌 可插拔架構

應用程式採用可插拔架構，讓開發者輕鬆新增、替換或移除功能：

**左側 Panel（臨床摘要）**：
- 配置檔：`src/shared/config/feature-registry.ts`
- 支援動態 Tab 和功能管理
- 4 個預設 Tabs：病患、報告、用藥、就診紀錄
- 7 個可插拔功能模組
- 詳細指南：[CONTRIBUTING_LEFT_PANEL.md](./docs/CONTRIBUTING_LEFT_PANEL.md)

**右側 Panel（AI 功能）**：
- 配置檔：`src/shared/config/right-panel-registry.ts`
- 支援功能註冊和 Provider 管理
- 4 個預設功能：筆記對話、資料選擇、臨床洞察、設定
- 詳細指南：[CONTRIBUTING_RIGHT_PANEL.md](./docs/CONTRIBUTING_RIGHT_PANEL.md)

**新增功能範例**：
```typescript
// 在 feature-registry.ts 中註冊新功能
{
  id: 'my-feature',
  name: 'My Feature',
  component: MyFeatureCard,
  tab: 'patient',
  order: 3,
  enabled: true,
}
```

**適用場景**：
- Fork 專案並客製化功能
- 新增醫院專屬功能
- 實驗性功能測試
- 多團隊協作開發
- 保留臨床資料顯示，替換 AI 功能

### 🤖 AI Agent 架構

**客戶端 Tool Calling 設計**：

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (useAgentChat Hook)                                │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  1. streamText({ model, messages, tools })             │ │
│  │     ↓                                                   │ │
│  │  2. AI 決定要調用 queryConditions                       │ │
│  │     ↓                                                   │ │
│  │  3. 在瀏覽器執行 tool.execute()                         │ │
│  │     ↓                                                   │ │
│  │  4. FHIR.oauth2.ready() ✓ (有 sessionStorage)          │ │
│  │     ↓                                                   │ │
│  │  5. 獲取 FHIR 資料                                      │ │
│  │     ↓                                                   │ │
│  │  6. 回傳給 AI 繼續生成回答                              │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

**可用的 AI Agent Tools**：

**FHIR Tools**（病患資料查詢）：
1. `queryConditions` - 查詢診斷/病況
2. `queryMedications` - 查詢用藥
3. `queryAllergies` - 查詢過敏史
4. `queryObservations` - 查詢檢驗/生命徵象
5. `queryProcedures` - 查詢手術/處置
6. `queryEncounters` - 查詢就診紀錄

**Literature Tools**（醫學文獻搜尋）：
7. `searchMedicalLiterature` - 搜尋醫學文獻和臨床指引
   - 使用 Perplexity API（需要 API 金鑰）
   - 搜尋來源：PubMed、NIH、WHO、UpToDate
   - 支援基礎模式（sonar）和進階模式（sonar-pro）
   - 自動提供引用連結

詳細說明：[AI_AGENT_IMPLEMENTATION.md](./docs/AI_AGENT_IMPLEMENTATION.md)

---

## 🧪 測試

專案使用 Jest 和 React Testing Library 進行測試：

```bash
# 執行所有測試
npm test

# 開發環境監視模式
npm test:watch

# 生成覆蓋率報告
npm test:coverage
```

測試檔案位於 `__tests__/` 目錄中，反映原始碼結構。

---

## 🌐 部署

### GitHub Pages

```bash
# 建置並部署到 GitHub Pages
npm run deploy
```

這將使用靜態匯出建置應用程式並部署到 `gh-pages` 分支。

### 其他平台

應用程式可部署到任何支援 Next.js 的平台：
- Vercel
- Netlify
- AWS Amplify
- Docker 容器

---

## 📖 使用者文件

臨床使用者請參閱 [USER_GUIDE.md](./USER_GUIDE.md) 以取得詳細使用說明。

---

## 🔒 安全性

本專案實作了多層安全防護：

### 已實作的安全措施

1. **API Key 管理**
   - API keys 僅存於瀏覽器 localStorage 或 sessionStorage
   - 支援 AES-GCM 256-bit 加密儲存（可選）
   - 不傳送到後端伺服器
   - 提供清除功能

2. **SMART on FHIR 認證**
   - 使用標準 OAuth 2.0 with PKCE
   - 不儲存密碼
   - Token 管理由 fhirclient 處理
   - 符合 HIPAA 和 FHIR 安全標準

3. **XSS 防護**
   - React 預設 XSS 防護
   - 使用 DOMPurify 進行 HTML Sanitization
   - 避免使用 `dangerouslySetInnerHTML`

4. **Content Security Policy (CSP)**
   - 防止 XSS 和 injection 攻擊
   - 限制外部資源載入
   - 錯誤訊息過濾，避免洩漏敏感資訊

5. **AI Agent 安全性**
   - ✅ 僅限查詢當前病人的資料
   - ✅ 僅限讀取操作，無寫入權限
   - ✅ 使用 FHIR client 的權限控制
   - ✅ 客戶端執行，避免 Token 外洩

6. **API 代理**
   - 使用 Firebase Functions 代理
   - 避免暴露主 API key
   - 有 `x-proxy-key` 驗證機制
   - 限制 CORS 來源

### 安全性文件

詳細資訊請參閱：
- [SECURITY.md](./docs/SECURITY.md) - 安全性指南和最佳實踐
- [SECURITY_IMPLEMENTATION.md](./docs/SECURITY_IMPLEMENTATION.md) - 安全性實作細節

---

## 🤝 貢獻

### 開發者指南

- **新增左側功能**：參閱 [CONTRIBUTING_LEFT_PANEL.md](./docs/CONTRIBUTING_LEFT_PANEL.md)
- **新增右側功能**：參閱 [CONTRIBUTING_RIGHT_PANEL.md](./docs/CONTRIBUTING_RIGHT_PANEL.md)
- **架構說明**：參閱 [ARCHITECTURE_UPDATE.md](./docs/ARCHITECTURE_UPDATE.md)
- **AI Agent 實作**：參閱 [AI_AGENT_IMPLEMENTATION.md](./docs/AI_AGENT_IMPLEMENTATION.md)
- **後端架構**：參閱 [BACKEND_ARCHITECTURE.md](./docs/BACKEND_ARCHITECTURE.md)

### 貢獻準則

1. 遵循整潔架構原則
2. 透過 Registry 新增功能，避免直接修改 Layout
3. 為新功能撰寫測試
4. 提交前確保所有測試通過
5. 遵循 TypeScript 最佳實踐
6. 使用慣例式提交訊息
7. 新增 AI Tools 時確保安全性（僅讀取、僅當前病患）

### 快速開始範例

**新增左側臨床功能**：
```typescript
// 1. 建立功能元件
export function MyFeatureCard() {
  const { patient } = useFhirContext()
  return <Card>...</Card>
}

// 2. 在 feature-registry.ts 註冊
{
  id: 'my-feature',
  name: 'My Feature',
  component: MyFeatureCard,
  tab: 'patient',
  order: 3,
  enabled: true,
}
```

**新增 AI Tool**：
```typescript
// 在 fhir-tools.ts 中定義新 tool
export const myNewTool = tool({
  description: 'Query specific FHIR resource',
  parameters: z.object({
    param: z.string().describe('Parameter description'),
  }),
  execute: async ({ param }) => {
    const client = await FHIR.oauth2.ready()
    const result = await queryFhirData(client, 'Resource', { param })
    return result
  },
})
```

---

## 📚 相關文件

### 使用者文件
- [USER_GUIDE.md](./USER_GUIDE.md) - 完整使用者操作指南
- [完整應用說明文件.md](./完整應用說明文件.md) - 詳細的系統說明

### 開發者文件
- [ARCHITECTURE_UPDATE.md](./docs/ARCHITECTURE_UPDATE.md) - 架構更新說明
- [AI_AGENT_IMPLEMENTATION.md](./docs/AI_AGENT_IMPLEMENTATION.md) - AI Agent 實作指南
- [CONTRIBUTING_LEFT_PANEL.md](./docs/CONTRIBUTING_LEFT_PANEL.md) - 左側面板開發指南
- [CONTRIBUTING_RIGHT_PANEL.md](./docs/CONTRIBUTING_RIGHT_PANEL.md) - 右側面板開發指南
- [BACKEND_ARCHITECTURE.md](./docs/BACKEND_ARCHITECTURE.md) - 後端架構說明

### 重構文件
- [REFACTORING_GUIDE.md](./REFACTORING_GUIDE.md) - 重構指南
- [REFACTORING_SUMMARY.md](./REFACTORING_SUMMARY.md) - 重構總結
- [STREAMING_MIGRATION_SUMMARY.md](./STREAMING_MIGRATION_SUMMARY.md) - Streaming 遷移說明

### 安全性文件
- [SECURITY.md](./docs/SECURITY.md) - 安全性指南
- [SECURITY_IMPLEMENTATION.md](./docs/SECURITY_IMPLEMENTATION.md) - 安全性實作

---

## 📄 授權

本專案為私有和專有。

---

## 🆘 支援

如有技術問題或疑問，請聯絡開發團隊。

**開發團隊**：臺北榮民總醫院醫療人工智慧發展中心

---

[⬆️ 返回中文版頂部](#中文版) | [🌐 切換到 English](#english-version)

---

# English Version

[🔝 Back to Top](#mediprisma--smart-on-fhir) | [🌐 Switch to 中文](#中文版)

An intelligent clinical documentation assistant built with **Next.js 16**, **SMART on FHIR**, and **AI integration** (OpenAI GPT / Google Gemini). This application adopts **Clean Architecture** and **Pluggable Design**, helping healthcare providers efficiently review patient data, generate clinical summaries, and leverage **AI Agent** to automatically query FHIR data for intelligent clinical decision support.

## 🌐 Live Demo

**Demo Site:** https://voho0000.github.io/medical-note-smart-on-fhir

**Launch URL (for SMART Launcher):** https://voho0000.github.io/medical-note-smart-on-fhir/smart/launch

> 💡 **Note:** Please use a SMART on FHIR Launcher (such as [SMART Health IT Launcher](https://launch.smarthealthit.org/)) and enter the Launch URL above to start the application. For detailed instructions, please refer to the [User Guide](./USER_GUIDE.md).

## 🎯 Key Features

### Clinical Data Integration
- **SMART on FHIR OAuth 2.0** authentication with PKCE
- Real-time patient data retrieval from FHIR servers
- **Pluggable Architecture**: Easily add, replace, or remove features via Registry
- Comprehensive clinical data display:
  - Patient demographics and vital signs
  - Diagnoses and conditions
  - Medications and allergies
  - Diagnostic reports and observations
  - Visit history

### AI-Powered Intelligent Features
- **AI Agent (Deep Mode)**: 🆕 AI automatically invokes multiple tools to query data
  - **FHIR Tools**: 6 FHIR resource queries (Conditions, Medications, Allergies, Observations, Procedures, Encounters)
  - **Literature Search**: Integrated Perplexity API for medical literature, clinical guidelines, and evidence-based medicine
    - Searches authoritative sources: PubMed, NIH, WHO, etc.
    - Provides citations and source tracking
    - Basic mode (sonar) and advanced mode (sonar-pro)
  - Client-side Tool Calling architecture, secure and efficient
  - Intelligently understands clinical questions and automatically retrieves relevant data
- **Note Chat (Normal Mode)**: Interactive AI assistant for clinical queries and note generation
- **Clinical Insights**: Automated generation of clinical summaries with customizable prompts and tabs
  - Safety Flag
  - What's Changed
  - Clinical Snapshot
- **Prompt Templates**: Reusable prompt templates for faster note drafting
- **Voice Recording**: Audio recording with Whisper transcription for hands-free documentation
- **Data Selection**: Filter and select specific clinical data for context-aware AI responses

### Multi-Language Support
- English and Traditional Chinese (繁體中文) interface
- Seamless language switching

### Modern UI/UX
- Responsive design (mobile, tablet, desktop)
- Split-panel layout with resizable dividers
- Dark mode support
- Built with shadcn/ui components and Tailwind CSS

---

## 🛠️ Technology Stack

- **Framework**: Next.js 16 (App Router)
- **UI Components**: shadcn/ui (Radix UI)
- **Styling**: Tailwind CSS 4
- **FHIR Client**: fhirclient 2.6.3
- **AI Integration**:
  - Vercel AI SDK 6.0.6 (with Tool Calling support)
  - OpenAI API (GPT-4o, GPT-4o-mini, etc.)
  - Google Gemini API (Gemini 2.0 Flash, Pro, etc.)
- **State Management**: React Context API + Zustand
- **Testing**: Jest with React Testing Library
- **TypeScript**: Full type safety
- **Architecture Pattern**: Clean Architecture

---

## 📋 Prerequisites

- **Node.js**: 18.18+ or 20.x LTS
- **Package Manager**: npm, pnpm, or yarn
- **API Keys** (optional for premium models):
  - OpenAI API key (for premium GPT models)
  - Google Gemini API key (for premium Gemini models)
  - Perplexity API key (for AI Agent literature search feature)
  - Built-in models available via Firebase Functions proxy without personal keys
- **FHIR Server**: Access to a SMART on FHIR sandbox or EHR system

---

## 🚀 Installation & Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Development Server

```bash
# Using webpack (recommended for development)
npm run dev:webpack

# Using Turbopack (experimental)
npm run dev
```

The application will be available at `http://localhost:3000`

### 3. Production Build

```bash
# Build for production
npm run build

# Start production server
npm start
```

### 4. Testing

```bash
# Run tests
npm test

# Run tests in watch mode
npm test:watch

# Generate coverage report
npm test:coverage
```

---

## 🔐 SMART on FHIR Configuration

### Sandbox Setup

1. Register your application in a SMART on FHIR sandbox (e.g., SMART Health IT Launcher)

2. Configure the following settings:
   - **Launch URL**: `http://localhost:3000/smart/launch`
   - **Redirect URL**: `http://localhost:3000/smart/callback`
   - **Client Type**: Public (PKCE)
   - **Client ID**: `my_web_app` (or your registered ID)
   - **Scopes**: `launch openid fhirUser patient/*.read online_access`

3. Launch the app through the SMART launcher

### Important Notes
- Always initiate the app through `/smart/launch`
- Do not refresh `/smart/callback` directly
- Session data is stored in browser storage

---

## 🔑 API Key Configuration

The application provides built-in AI models that work without personal API keys. For premium models, configure your keys in the **Settings** tab:

1. Navigate to the Settings tab → **AI Preferences** sub-tab
2. (Optional) Enter your OpenAI API key and/or Google Gemini API key
3. Keys are stored securely in browser local storage only
4. Select your preferred AI model for note generation

### Available Models

**Built-in Models** (via Firebase Functions proxy, no personal key required):
- GPT-5 Mini (Cost-efficient base model)
- GPT-5.1 (Recommended for clinical summarization)
- Gemini 2.5 Flash (Fast Gemini model)
- Gemini 3 Flash Preview (Preview version)

**Premium Models** (requires personal API key):
- GPT-5.2 (Latest premium model)
- GPT-5 Pro (Professional grade model)
- Gemini 2.5 Pro (Advanced Gemini model)
- Gemini 3 Pro Preview (Premium preview version)

### Settings Organization

The Settings tab is organized into three sub-tabs:
1. **AI Preferences**: Model selection, API keys, appearance (light/dark mode)
2. **Prompt Templates**: Create and manage reusable prompt templates
3. **Clinical Insights Tabs**: Customize auto-generation and insight tabs

---

## 📁 Project Structure

```
medical-note-smart-on-fhir/
├── app/                          # Next.js App Router
│   ├── api/                      # API routes
│   │   ├── agent/                # AI Agent API
│   │   ├── fhir-proxy/           # FHIR API proxy
│   │   ├── gemini-proxy/         # Gemini API proxy
│   │   └── llm/                  # LLM integration
│   ├── smart/                    # SMART on FHIR auth
│   │   ├── launch/               # OAuth launch endpoint
│   │   └── callback/             # OAuth callback endpoint
│   ├── globals.css               # Global styles
│   ├── layout.tsx                # Root layout
│   └── page.tsx                  # Main application page
├── components/                   # Reusable UI components
│   └── ui/                       # shadcn/ui components
├── features/                     # Feature modules (Pluggable)
│   ├── clinical-insights/        # AI-generated clinical insights
│   ├── clinical-summary/         # Patient data display
│   │   ├── allergies/            # Allergies
│   │   ├── diagnosis/            # Diagnoses
│   │   ├── medications/          # Medications
│   │   ├── patient-info/         # Patient demographics
│   │   ├── reports/              # Diagnostic reports
│   │   ├── visit-history/        # Visit history
│   │   └── vitals/               # Vital signs
│   ├── data-selection/           # Clinical data filtering
│   ├── medical-chat/             # AI chat interface
│   │   ├── components/           # Chat components
│   │   ├── hooks/                # Chat hooks
│   │   │   ├── useAgentChat.ts   # AI Agent Hook (Deep Mode)
│   │   │   └── useChat.ts        # Normal Chat Hook
│   │   ├── types/                # Chat type definitions
│   │   └── utils/                # Chat utilities
│   └── settings/                 # Application settings
├── src/
│   ├── application/              # Application layer
│   │   ├── adapters/             # External service adapters
│   │   ├── dto/                  # Data transfer objects
│   │   ├── hooks/                # Custom React hooks
│   │   └── providers/            # Context providers
│   ├── core/                     # Domain layer
│   │   ├── categories/           # Data categories
│   │   ├── entities/             # Domain entities
│   │   ├── errors/               # Error definitions
│   │   ├── interfaces/           # Domain interfaces
│   │   ├── registry/             # Registries
│   │   ├── services/             # Domain services
│   │   └── use-cases/            # Business logic
│   │       ├── agent/            # AI Agent Use Cases
│   │       ├── ai/               # AI Use Cases
│   │       ├── chat/             # Chat Use Cases
│   │       ├── clinical-context/ # Clinical context
│   │       ├── clinical-data/    # Clinical data
│   │       ├── clinical-insights/# Clinical insights
│   │       ├── patient/          # Patient
│   │       └── transcription/    # Transcription
│   ├── infrastructure/           # Infrastructure layer
│   │   ├── ai/                   # AI service implementations
│   │   │   ├── services/         # AI services
│   │   │   ├── streaming/        # Streaming processing
│   │   │   └── tools/            # FHIR Tools for AI Agent
│   │   └── fhir/                 # FHIR client implementations
│   ├── layouts/                  # Layout components
│   │   ├── LeftPanelLayout.tsx   # Left panel layout
│   │   └── RightPanelLayout.tsx  # Right panel layout
│   └── shared/                   # Shared utilities
│       ├── components/           # Shared components
│       ├── config/               # Configuration files
│       │   ├── feature-registry.ts      # Left panel feature registry
│       │   └── right-panel-registry.ts  # Right panel feature registry
│       ├── constants/            # Constants
│       ├── di/                   # Dependency injection
│       ├── hooks/                # Shared hooks
│       ├── i18n/                 # Internationalization
│       ├── types/                # Type definitions
│       └── utils/                # Utility functions
└── __tests__/                    # Test files
    ├── application/              # Application layer tests
    ├── core/                     # Domain layer tests
    ├── fhir/                     # FHIR tests
    └── infrastructure/           # Infrastructure layer tests
```

---

## 🏗️ Architecture

This application follows **Clean Architecture** principles:

```
┌─────────────────────────────────────────────────────────────┐
│                   Presentation Layer                         │
│              app/ • features/ • components/                  │
│                   UI components and pages                    │
├─────────────────────────────────────────────────────────────┤
│                   Application Layer                          │
│                   src/application/                           │
│         Application-specific logic, hooks & providers        │
├─────────────────────────────────────────────────────────────┤
│                     Domain Layer                             │
│                      src/core/                               │
│                Business entities and use cases               │
├─────────────────────────────────────────────────────────────┤
│                  Infrastructure Layer                        │
│                  src/infrastructure/                         │
│            External service integrations (FHIR, AI)          │
└─────────────────────────────────────────────────────────────┘
```

### Key Design Patterns
- **Provider Pattern**: Context-based state management
- **Repository Pattern**: Data access abstraction
- **Adapter Pattern**: External API integration
- **Registry Pattern**: Pluggable feature architecture
- **Use Case Pattern**: Encapsulate business logic
- **Feature-based Organization**: Modular feature structure

### 🔌 Pluggable Architecture

The application uses a pluggable architecture that allows developers to easily add, replace, or remove features:

**Left Panel (Clinical Summary)**:
- Configuration: `src/shared/config/feature-registry.ts`
- Supports dynamic tabs and feature management
- 4 default tabs: Patient, Reports, Medications, Visits
- 7 pluggable feature modules
- Guide: [CONTRIBUTING_LEFT_PANEL.md](./docs/CONTRIBUTING_LEFT_PANEL.md)

**Right Panel (AI Features)**:
- Configuration: `src/shared/config/right-panel-registry.ts`
- Supports feature registration and provider management
- 4 default features: Note Chat, Data Selection, Clinical Insights, Settings
- Guide: [CONTRIBUTING_RIGHT_PANEL.md](./docs/CONTRIBUTING_RIGHT_PANEL.md)

**Adding New Feature Example**:
```typescript
// Register new feature in feature-registry.ts
{
  id: 'my-feature',
  name: 'My Feature',
  component: MyFeatureCard,
  tab: 'patient',
  order: 3,
  enabled: true,
}
```

**Use Cases**:
- Fork and customize features
- Add hospital-specific functionality
- Test experimental features
- Multi-team collaborative development
- Keep clinical data display, replace AI features

### 🤖 AI Agent Architecture

**Client-side Tool Calling Design**:

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (useAgentChat Hook)                                │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  1. streamText({ model, messages, tools })             │ │
│  │     ↓                                                   │ │
│  │  2. AI decides to call queryConditions                 │ │
│  │     ↓                                                   │ │
│  │  3. Execute tool.execute() in browser                  │ │
│  │     ↓                                                   │ │
│  │  4. FHIR.oauth2.ready() ✓ (has sessionStorage)         │ │
│  │     ↓                                                   │ │
│  │  5. Retrieve FHIR data                                 │ │
│  │     ↓                                                   │ │
│  │  6. Return to AI to continue generating response       │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

**Available AI Agent Tools**:

**FHIR Tools** (Patient Data Query):
1. `queryConditions` - Query diagnoses/conditions
2. `queryMedications` - Query medications
3. `queryAllergies` - Query allergies
4. `queryObservations` - Query observations/vital signs
5. `queryProcedures` - Query procedures
6. `queryEncounters` - Query encounters

**Literature Tools** (Medical Literature Search):
7. `searchMedicalLiterature` - Search medical literature and clinical guidelines
   - Uses Perplexity API (requires API key)
   - Search sources: PubMed, NIH, WHO, UpToDate
   - Supports basic mode (sonar) and advanced mode (sonar-pro)
   - Automatically provides citation links

Details: [AI_AGENT_IMPLEMENTATION.md](./docs/AI_AGENT_IMPLEMENTATION.md)

---

## 🧪 Testing

The project uses Jest and React Testing Library for testing:

```bash
# Run all tests
npm test

# Watch mode for development
npm test:watch

# Generate coverage report
npm test:coverage
```

Test files are located in `__tests__/` directory, mirroring the source structure.

---

## 🌐 Deployment

### GitHub Pages

```bash
# Build and deploy to GitHub Pages
npm run deploy
```

This will build the application with static export and deploy to the `gh-pages` branch.

### Other Platforms

The application can be deployed to any platform supporting Next.js:
- Vercel
- Netlify
- AWS Amplify
- Docker containers

---

## 📖 User Documentation

For clinical users, please refer to [USER_GUIDE.md](./USER_GUIDE.md) for detailed usage instructions.

---

## 🔒 Security

This project implements multiple layers of security protection:

### Implemented Security Measures

1. **API Key Management**
   - API keys stored only in browser localStorage or sessionStorage
   - Support for AES-GCM 256-bit encryption (optional)
   - Not sent to backend server
   - Provides clear functionality

2. **SMART on FHIR Authentication**
   - Uses standard OAuth 2.0 with PKCE
   - No password storage
   - Token management handled by fhirclient
   - Compliant with HIPAA and FHIR security standards

3. **XSS Protection**
   - React default XSS protection
   - HTML Sanitization using DOMPurify
   - Avoid using `dangerouslySetInnerHTML`

4. **Content Security Policy (CSP)**
   - Prevent XSS and injection attacks
   - Restrict external resource loading
   - Filter error messages to avoid leaking sensitive information

5. **AI Agent Security**
   - ✅ Query only current patient's data
   - ✅ Read-only operations, no write permissions
   - ✅ Use FHIR client's permission control
   - ✅ Client-side execution, avoid token leakage

6. **API Proxy**
   - Use Firebase Functions proxy
   - Avoid exposing main API key
   - `x-proxy-key` verification mechanism
   - Restrict CORS origins

### Security Documentation

For details, see:
- [SECURITY.md](./docs/SECURITY.md) - Security guide and best practices
- [SECURITY_IMPLEMENTATION.md](./docs/SECURITY_IMPLEMENTATION.md) - Security implementation details

---

## 🤝 Contributing

### Developer Guides

- **Adding Left Panel Features**: See [CONTRIBUTING_LEFT_PANEL.md](./docs/CONTRIBUTING_LEFT_PANEL.md)
- **Adding Right Panel Features**: See [CONTRIBUTING_RIGHT_PANEL.md](./docs/CONTRIBUTING_RIGHT_PANEL.md)
- **Architecture Overview**: See [ARCHITECTURE_UPDATE.md](./docs/ARCHITECTURE_UPDATE.md)
- **AI Agent Implementation**: See [AI_AGENT_IMPLEMENTATION.md](./docs/AI_AGENT_IMPLEMENTATION.md)
- **Backend Architecture**: See [BACKEND_ARCHITECTURE.md](./docs/BACKEND_ARCHITECTURE.md)

### Contribution Guidelines

1. Follow Clean Architecture principles
2. Add features via Registry, avoid directly modifying Layouts
3. Write tests for new features
4. Ensure all tests pass before submitting
5. Follow TypeScript best practices
6. Use conventional commit messages
7. Ensure security when adding AI Tools (read-only, current patient only)

### Quick Start Examples

**Adding Left Panel Clinical Feature**:
```typescript
// 1. Create feature component
export function MyFeatureCard() {
  const { patient } = useFhirContext()
  return <Card>...</Card>
}

// 2. Register in feature-registry.ts
{
  id: 'my-feature',
  name: 'My Feature',
  component: MyFeatureCard,
  tab: 'patient',
  order: 3,
  enabled: true,
}
```

**Adding AI Tool**:
```typescript
// Define new tool in fhir-tools.ts
export const myNewTool = tool({
  description: 'Query specific FHIR resource',
  parameters: z.object({
    param: z.string().describe('Parameter description'),
  }),
  execute: async ({ param }) => {
    const client = await FHIR.oauth2.ready()
    const result = await queryFhirData(client, 'Resource', { param })
    return result
  },
})
```

---

## 📚 Related Documentation

### User Documentation
- [USER_GUIDE.md](./USER_GUIDE.md) - Complete user operation guide
- [完整應用說明文件.md](./完整應用說明文件.md) - Detailed system documentation

### Developer Documentation
- [ARCHITECTURE_UPDATE.md](./docs/ARCHITECTURE_UPDATE.md) - Architecture update notes
- [AI_AGENT_IMPLEMENTATION.md](./docs/AI_AGENT_IMPLEMENTATION.md) - AI Agent implementation guide
- [CONTRIBUTING_LEFT_PANEL.md](./docs/CONTRIBUTING_LEFT_PANEL.md) - Left panel development guide
- [CONTRIBUTING_RIGHT_PANEL.md](./docs/CONTRIBUTING_RIGHT_PANEL.md) - Right panel development guide
- [BACKEND_ARCHITECTURE.md](./docs/BACKEND_ARCHITECTURE.md) - Backend architecture documentation

### Refactoring Documentation
- [REFACTORING_GUIDE.md](./REFACTORING_GUIDE.md) - Refactoring guide
- [REFACTORING_SUMMARY.md](./REFACTORING_SUMMARY.md) - Refactoring summary
- [STREAMING_MIGRATION_SUMMARY.md](./STREAMING_MIGRATION_SUMMARY.md) - Streaming migration notes

### Security Documentation
- [SECURITY.md](./docs/SECURITY.md) - Security guide
- [SECURITY_IMPLEMENTATION.md](./docs/SECURITY_IMPLEMENTATION.md) - Security implementation

---

## 📄 License

This project is private and proprietary.

---

## 🆘 Support

For technical issues or questions, please contact the development team.

**Development Team**: Taipei Veterans General Hospital AI Medical Development Center

---

[⬆️ Back to English Version](#english-version) | [🔝 返回頂部](#mediprisma--smart-on-fhir)