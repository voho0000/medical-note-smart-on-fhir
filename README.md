# MediPrisma · SMART on FHIR

> **語言選擇 / Language Selection:**  
> 📖 [**中文版**](#中文版) | 📖 [**English Version**](#english-version)

---

# 中文版

[🔝 返回頂部](#mediprisma--smart-on-fhir) | [🌐 切換到 English](#english-version)

基於 **Next.js 16**、**SMART on FHIR** 和 **AI 整合**（OpenAI GPT / Google Gemini）建構的臨床文件助理。本應用程式協助醫療人員高效檢視病患資料、生成臨床摘要，並透過語音錄製和 AI 輔助建立醫療筆記。

## 🎯 主要功能

### 臨床資料整合
- **SMART on FHIR OAuth 2.0** 身份驗證（使用 PKCE）
- 從 FHIR 伺服器即時擷取病患資料
- 完整的臨床資料顯示：
  - 病患基本資料和生命徵象
  - 診斷和病況
  - 用藥和過敏史
  - 診斷報告和觀察記錄
  - 就診紀錄

### AI 驅動的文件功能
- **筆記對話**：互動式 AI 助理，用於臨床查詢和筆記生成
- **臨床洞察**：自動生成臨床摘要，可自訂提示和標籤
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
- **AI 整合**：OpenAI API、Google Gemini API
- **狀態管理**：React Context API
- **測試**：Jest 搭配 React Testing Library
- **TypeScript**：完整型別安全

---

## 📋 前置需求

- **Node.js**：18.18+ 或 20.x LTS
- **套件管理器**：npm、pnpm 或 yarn
- **API 金鑰**（進階模型選用）：
  - OpenAI API 金鑰（用於進階 GPT 模型）
  - Google Gemini API 金鑰（用於進階 Gemini 模型）
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
│   │   ├── gemini-proxy/         # Gemini API 代理
│   │   └── llm/                  # LLM 整合
│   ├── smart/                    # SMART on FHIR 驗證
│   │   ├── launch/               # OAuth 啟動端點
│   │   └── callback/             # OAuth 回調端點
│   └── page.tsx                  # 主應用程式頁面
├── components/                   # 可重複使用的 UI 元件
│   └── ui/                       # shadcn/ui 元件
├── features/                     # 功能模組
│   ├── clinical-insights/        # AI 生成的臨床洞察
│   ├── clinical-summary/         # 病患資料顯示
│   ├── data-selection/           # 臨床資料篩選
│   ├── medical-chat/             # AI 對話介面
│   └── settings/                 # 應用程式設定
├── src/
│   ├── application/              # 應用層
│   │   ├── adapters/             # 外部服務適配器
│   │   ├── dto/                  # 資料傳輸物件
│   │   ├── hooks/                # 自訂 React hooks
│   │   └── providers/            # Context providers
│   ├── core/                     # 領域層
│   │   ├── entities/             # 領域實體
│   │   ├── interfaces/           # 領域介面
│   │   └── use-cases/            # 業務邏輯
│   ├── infrastructure/           # 基礎設施層
│   │   ├── ai/                   # AI 服務實作
│   │   └── fhir/                 # FHIR 客戶端實作
│   ├── layouts/                  # 佈局元件
│   └── shared/                   # 共用工具
└── __tests__/                    # 測試檔案
```

---

## 🏗️ 架構

本應用程式遵循**整潔架構**（Clean Architecture）原則：

- **領域層**（`src/core`）：業務實體和用例
- **應用層**（`src/application`）：應用程式特定邏輯、hooks 和 providers
- **基礎設施層**（`src/infrastructure`）：外部服務整合（FHIR、AI）
- **展示層**（`app`、`features`、`components`）：UI 元件和頁面

### 關鍵設計模式
- **Provider 模式**：基於 Context 的狀態管理
- **Repository 模式**：資料存取抽象
- **Adapter 模式**：外部 API 整合
- **基於功能的組織**：模組化功能結構

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

## 🤝 貢獻

1. 遵循現有的程式碼結構和模式
2. 為新功能撰寫測試
3. 提交前確保所有測試通過
4. 遵循 TypeScript 最佳實踐
5. 使用慣例式提交訊息

---

## 📄 授權

本專案為私有和專有。

---

## 🆘 支援

如有技術問題或疑問，請聯絡開發團隊。

---

[⬆️ 返回中文版頂部](#中文版) | [🌐 切換到 English](#english-version)

---

# English Version

[🔝 Back to Top](#mediprisma--smart-on-fhir) | [🌐 Switch to 中文](#中文版)

A clinical documentation assistant built with **Next.js 16**, **SMART on FHIR**, and **AI integration** (OpenAI GPT / Google Gemini). This application helps healthcare providers efficiently review patient data, generate clinical summaries, and create medical notes through voice recording and AI assistance.

## 🎯 Key Features

### Clinical Data Integration
- **SMART on FHIR OAuth 2.0** authentication with PKCE
- Real-time patient data retrieval from FHIR servers
- Comprehensive clinical data display:
  - Patient demographics and vital signs
  - Diagnoses and conditions
  - Medications and allergies
  - Diagnostic reports and observations
  - Visit history

### AI-Powered Documentation
- **Note Chat**: Interactive AI assistant for clinical queries and note generation
- **Clinical Insights**: Automated generation of clinical summaries with customizable prompts and tabs
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
- **AI Integration**: OpenAI API, Google Gemini API
- **State Management**: React Context API
- **Testing**: Jest with React Testing Library
- **TypeScript**: Full type safety

---

## 📋 Prerequisites

- **Node.js**: 18.18+ or 20.x LTS
- **Package Manager**: npm, pnpm, or yarn
- **API Keys** (optional for premium models):
  - OpenAI API key (for premium GPT models)
  - Google Gemini API key (for premium Gemini models)
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
│   │   ├── gemini-proxy/         # Gemini API proxy
│   │   └── llm/                  # LLM integration
│   ├── smart/                    # SMART on FHIR auth
│   │   ├── launch/               # OAuth launch endpoint
│   │   └── callback/             # OAuth callback endpoint
│   └── page.tsx                  # Main application page
├── components/                   # Reusable UI components
│   └── ui/                       # shadcn/ui components
├── features/                     # Feature modules
│   ├── clinical-insights/        # AI-generated clinical insights
│   ├── clinical-summary/         # Patient data display
│   ├── data-selection/           # Clinical data filtering
│   ├── medical-chat/             # AI chat interface
│   └── settings/                 # Application settings
├── src/
│   ├── application/              # Application layer
│   │   ├── adapters/             # External service adapters
│   │   ├── dto/                  # Data transfer objects
│   │   ├── hooks/                # Custom React hooks
│   │   └── providers/            # Context providers
│   ├── core/                     # Domain layer
│   │   ├── entities/             # Domain entities
│   │   ├── interfaces/           # Domain interfaces
│   │   └── use-cases/            # Business logic
│   ├── infrastructure/           # Infrastructure layer
│   │   ├── ai/                   # AI service implementations
│   │   └── fhir/                 # FHIR client implementations
│   ├── layouts/                  # Layout components
│   └── shared/                   # Shared utilities
└── __tests__/                    # Test files
```

---

## 🏗️ Architecture

This application follows **Clean Architecture** principles:

- **Domain Layer** (`src/core`): Business entities and use cases
- **Application Layer** (`src/application`): Application-specific logic, hooks, and providers
- **Infrastructure Layer** (`src/infrastructure`): External service integrations (FHIR, AI)
- **Presentation Layer** (`app`, `features`, `components`): UI components and pages

### Key Design Patterns
- **Provider Pattern**: Context-based state management
- **Repository Pattern**: Data access abstraction
- **Adapter Pattern**: External API integration
- **Feature-based Organization**: Modular feature structure

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

## 🤝 Contributing

1. Follow the existing code structure and patterns
2. Write tests for new features
3. Ensure all tests pass before submitting
4. Follow TypeScript best practices
5. Use conventional commit messages

---

## 📄 License

This project is private and proprietary.

---

## 🆘 Support

For technical issues or questions, please contact the development team.

---

[⬆️ Back to English Version](#english-version) | [🔝 返回頂部](#mediprisma--smart-on-fhir)