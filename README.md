# 醫析 MediPrisma · SMART on FHIR

> **語言選擇 / Language Selection:**  
> 📖 [**中文版**](#中文版) | 📖 [**English Version**](#english-version)

---

# 中文版

基於 **Next.js 16**、**SMART on FHIR** 和 **AI 整合**的智能臨床文件助理系統。

**核心亮點**：
- 🤖 **AI Agent 深入模式**：自動調用 8 種工具查詢 FHIR 資料和醫學文獻
- 📚 **提示範本庫**：社群共享的提示範本
- 💬 **對話歷史**：依病人分類儲存，支援跨裝置同步
- 🔌 **可插拔架構**：透過 Registry 輕鬆新增或替換功能

## 🌐 線上展示

- **Launch URL**：https://voho0000.github.io/medical-note-smart-on-fhir/smart/launch

> 💡 透過 [SMART Health IT Launcher](https://launch.smarthealthit.org/) 輸入 Launch URL 啟動應用程式

## 🎯 主要功能

### 臨床資料整合
- SMART on FHIR OAuth 2.0 認證（PKCE）
- 即時擷取 FHIR 資料
- 完整臨床資料顯示：病患資料、診斷、用藥、過敏史、報告、就診紀錄

### AI 功能
- **AI Agent（深入模式）**：
  - 7 種 FHIR 資源查詢工具
  - 醫學文獻搜尋（Perplexity API）
  - 客戶端 Tool Calling 架構
- **筆記對話（一般模式）**：互動式 AI 助理
- **臨床洞察**：自動生成臨床摘要
- **提示範本庫**：瀏覽、搜尋、分享提示範本
- **語音錄製**：Whisper 轉錄
- **對話歷史**：依病人儲存，Firestore 雲端同步

### 使用者體驗
- 多語言支援（中英文）
- Firebase Authentication（Google 登入、Email/密碼）
- 響應式設計、深色模式
- shadcn/ui + Tailwind CSS

---

## 🛠️ 技術堆疊

- **框架**：Next.js 16（App Router + Turbopack）
- **UI**：shadcn/ui、Tailwind CSS 4
- **FHIR**：fhirclient 2.6.3
- **AI**：Vercel AI SDK、OpenAI、Gemini、Perplexity
- **後端**：Firebase（Auth、Firestore、Functions）
  - Firebase Functions Repo: [firebase-smart-on-fhir](https://github.com/voho0000/firebase-smart-on-fhir)
- **狀態**：React Context + Zustand
- **測試**：Jest 30 + React Testing Library
- **架構**：Clean Architecture + Feature-based Organization

---

## 📋 前置需求

- Node.js 18.18+ 或 20.x LTS
- API 金鑰（選用）：OpenAI、Gemini、Perplexity
- Firebase 專案（選用，用於認證和對話歷史，設定請參考 [Firebase Functions Repo](https://github.com/voho0000/firebase-smart-on-fhir)）
- FHIR 伺服器存取權限

---

## 🚀 快速開始

### 安裝
```bash
npm install
```

### 開發
```bash
npm run dev:webpack  # 推薦
npm run dev          # Turbopack（實驗性）
```

應用程式將在 `http://localhost:3000` 運行

### 建置
```bash
npm run build
npm start
```

### 測試
```bash
npm test
npm test:watch
npm test:coverage
```

---

## 🔐 SMART on FHIR 配置

### 公開客戶端模式（Public Client）

1. 在 SMART 沙盒註冊應用程式
2. 配置：
   - Launch URL: `http://localhost:3000/smart/launch`
   - Redirect URL: `http://localhost:3000/smart/callback`
   - Client Type: Public（PKCE）
   - Scopes: `launch openid fhirUser patient/*.read online_access`
3. 透過 SMART launcher 啟動

### 機密客戶端模式（Confidential Client）

如需使用 `clientSecret`（例如比賽測試要求）：

1. 設定環境變數：
   ```bash
   NEXT_PUBLIC_SMART_CLIENT_ID=your_client_id
   NEXT_PUBLIC_SMART_CLIENT_SECRET=your_client_secret
   ```

2. 部署到支援環境變數的平台（如 Vercel）

3. 應用程式會自動偵測環境變數並使用機密客戶端模式

> ⚠️ **安全提醒**：`clientSecret` 會暴露在前端，僅在受信任的測試環境使用

---

## 🚀 部署

### GitHub Pages（公開客戶端模式）

**自動部署**：
- Push 到 `master` 分支會自動觸發 GitHub Actions
- 部署到：`https://voho0000.github.io/medical-note-smart-on-fhir/`

**手動部署**：
```bash
npm run deploy
```

### Vercel（支援機密客戶端模式）

**步驟**：

1. **連接 GitHub Repo**
   - 前往 [Vercel Dashboard](https://vercel.com/new)
   - 選擇此 repository
   - 點擊 "Import"

2. **配置環境變數**
   
   在 Vercel 專案設定中添加：
   
   **必要（機密客戶端模式）**：
   ```
   NEXT_PUBLIC_SMART_CLIENT_ID=your_client_id
   NEXT_PUBLIC_SMART_CLIENT_SECRET=your_client_secret
   ```
   
   **選用（API 服務）**：
   ```
   NEXT_PUBLIC_CHAT_URL=your_chat_url
   NEXT_PUBLIC_WHISPER_URL=your_whisper_url
   NEXT_PUBLIC_GEMINI_URL=your_gemini_url
   NEXT_PUBLIC_PROXY_KEY=your_proxy_key
   ```
   
   **選用（Firebase）**：
   ```
   NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_auth_domain
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_storage_bucket
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
   NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=your_measurement_id
   ```

3. **部署**
   - Vercel 會自動偵測 Next.js 並部署
   - 部署完成後會提供 URL（例如：`https://your-app.vercel.app`）

4. **更新 SMART 配置**
   
   在 FHIR 伺服器註冊應用程式時使用：
   - Launch URL: `https://your-app.vercel.app/smart/launch`
   - Redirect URL: `https://your-app.vercel.app/smart/callback`

**比較**：

| 功能 | GitHub Pages | Vercel |
|------|-------------|---------|
| 部署方式 | 靜態網站 | Full-stack |
| 客戶端模式 | ✅ 公開模式 | ✅ 公開 + 機密模式 |
| 環境變數 | ❌ 不支援私密變數 | ✅ 完整支援 |
| 自動部署 | ✅ GitHub Actions | ✅ Git push |
| 費用 | 免費 | 免費（Hobby 方案） |

---

## 🔑 API 金鑰配置

在**設定**標籤配置 API 金鑰（選用）：

**內建模型**（無需金鑰）：
- GPT-5 Mini
- Gemini 3 Flash Preview（預設）

**進階模型**（需要金鑰）：
- GPT-5.1、GPT-5.2
- Gemini 2.5 Pro、Gemini 3 Pro Preview

---

## 📁 專案結構

```
medical-note-smart-on-fhir/
├── app/                    # Next.js App Router
├── components/             # UI 元件
├── features/               # 功能模組（可插拔）
│   ├── auth/              # 認證
│   ├── chat-history/      # 對話歷史
│   ├── clinical-insights/ # 臨床洞察
│   ├── clinical-summary/  # 臨床摘要
│   ├── data-selection/    # 資料選擇
│   ├── medical-chat/      # AI 對話
│   ├── prompt-gallery/    # 提示範本庫
│   └── settings/          # 設定
├── src/
│   ├── application/       # 應用層
│   ├── core/              # 領域層
│   ├── infrastructure/    # 基礎設施層
│   └── shared/            # 共用工具
├── docs/                  # 📚 文件庫（6 個核心文件）
│   ├── AI_AGENT_IMPLEMENTATION.md
│   ├── ARCHITECTURE.md
│   ├── FEATURES.md
│   ├── MEDICAL_CHAT.md
│   ├── PROMPT_GALLERY.md
│   ├── SECURITY.md
└── __tests__/             # 測試
```

---

## 🏗️ 架構

### Clean Architecture

```
展示層 (Presentation) → app/ • features/ • components/
應用層 (Application)   → src/application/
領域層 (Domain)        → src/core/
基礎設施層 (Infrastructure) → src/infrastructure/
```

### 可插拔架構

**左側 Panel**：`src/shared/config/feature-registry.ts`
- 4 個 Tabs、7 個功能模組

**右側 Panel**：`src/shared/config/right-panel-registry.ts`
- 4 個功能：筆記對話、資料選擇、臨床洞察、設定

**新增功能範例**：
```typescript
{
  id: 'my-feature',
  name: 'My Feature',
  component: MyFeatureCard,
  tab: 'patient',
  order: 3,
  enabled: true,
}
```

### AI Agent 架構

**客戶端 Tool Calling**：
- 在瀏覽器執行 tool calling
- 7 個 FHIR Tools + 1 個 Literature Tool
- 安全且高效

詳見：[AI_AGENT_IMPLEMENTATION.md](./docs/AI_AGENT_IMPLEMENTATION.md)

---

## 🧪 測試

```bash
npm test              # 執行測試
npm test:watch        # 監視模式
npm test:coverage     # 覆蓋率報告
```

---

## 📚 文件

### 使用者文件
- [USER_GUIDE.md](./USER_GUIDE.md) - 使用者操作指南

### 開發者文件

**架構與設計**：
- [ARCHITECTURE.md](./docs/ARCHITECTURE.md) - 完整系統架構

**功能實作指南**：
- [AI_AGENT_IMPLEMENTATION.md](./docs/AI_AGENT_IMPLEMENTATION.md) - AI Agent 實作
- [MEDICAL_CHAT.md](./docs/MEDICAL_CHAT.md) - Medical Chat 功能
- [PROMPT_GALLERY.md](./docs/PROMPT_GALLERY.md) - 提示範本庫
- [FEATURES.md](./docs/FEATURES.md) - Feature 模組架構

**部署與設定**：
- [Firebase Functions Repo](https://github.com/voho0000/firebase-smart-on-fhir) - Firebase 設定與部署指南

**安全性**：
- [SECURITY.md](./docs/SECURITY.md) - 安全性指南

---

## 📄 授權

本專案為私有和專有。

---

## 🆘 支援

如有問題，請透過 GitHub Issues 回報。

---

# English Version

[🔝 Back to Top](#mediprisma--smart-on-fhir) | [🌐 Switch to 中文](#中文版)

An intelligent clinical documentation assistant built with **Next.js 16**, **SMART on FHIR**, and **AI Integration** (OpenAI GPT / Google Gemini / Perplexity).

**Core Highlights**:
- 🤖 **AI Agent Deep Mode**: Auto-invokes 8 tools to query FHIR data and medical literature
- 📚 **Prompt Gallery**: Community-shared prompt templates
- 💬 **Chat History**: Patient-categorized storage with cross-device sync
- 🔌 **Pluggable Architecture**: Easy to add or replace features via Registry

## 🌐 Live Demo

- **Demo**: https://voho0000.github.io/medical-note-smart-on-fhir
- **Launch URL**: https://voho0000.github.io/medical-note-smart-on-fhir/smart/launch

> 💡 Launch via [SMART Health IT Launcher](https://launch.smarthealthit.org/)

## 🎯 Key Features

### Clinical Data Integration
- SMART on FHIR OAuth 2.0 (PKCE)
- Real-time FHIR data retrieval
- Complete clinical data display

### AI Features
- **AI Agent (Deep Mode)**: 7 FHIR tools + Medical literature search
- **Note Chat (Normal Mode)**: Interactive AI assistant
- **Clinical Insights**: Auto-generated summaries
- **Prompt Gallery**: Browse, search, share templates
- **Voice Recording**: Whisper transcription
- **Chat History**: Patient-based storage with Firestore sync

### User Experience
- Multi-language (EN/ZH-TW)
- Firebase Authentication
- Responsive design, dark mode
- shadcn/ui + Tailwind CSS

---

## 🛠️ Tech Stack

- **Framework**: Next.js 16 (App Router + Turbopack)
- **UI**: shadcn/ui, Tailwind CSS 4
- **FHIR**: fhirclient 2.6.3
- **AI**: Vercel AI SDK, OpenAI, Gemini, Perplexity
- **Backend**: Firebase (Auth, Firestore, Functions)
  - Firebase Functions Repo: [firebase-smart-on-fhir](https://github.com/voho0000/firebase-smart-on-fhir)
- **State**: React Context + Zustand
- **Testing**: Jest 30 + React Testing Library
- **Architecture**: Clean Architecture + Feature-based Organization

---

## 📋 Prerequisites

- Node.js 18.18+ or 20.x LTS
- API Keys (optional): OpenAI, Gemini, Perplexity
- Firebase project (optional, for auth and chat history. See [Firebase Functions Repo](https://github.com/voho0000/firebase-smart-on-fhir) for setup)
- FHIR server access

---

## 🚀 Quick Start

### Install
```bash
npm install
```

### Development
```bash
npm run dev:webpack  # Recommended
npm run dev          # Turbopack (experimental)
```

App runs at `http://localhost:3000`

### Build
```bash
npm run build
npm start
```

### Test
```bash
npm test
npm test:watch
npm test:coverage
```

---

## 🔐 SMART on FHIR Configuration

1. Register app in SMART sandbox
2. Configure:
   - Launch URL: `http://localhost:3000/smart/launch`
   - Redirect URL: `http://localhost:3000/smart/callback`
   - Client Type: Public (PKCE)
   - Scopes: `launch openid fhirUser patient/*.read online_access`
3. Launch via SMART launcher

---

## 🔑 API Key Configuration

Configure in **Settings** tab (optional):

**Built-in Models** (no key needed):
- GPT-5 Mini
- Gemini 3 Flash Preview (default)

**Advanced Models** (key required):
- GPT-5.1, GPT-5.2
- Gemini 2.5 Pro, Gemini 3 Pro Preview

---

## 📁 Project Structure

```
medical-note-smart-on-fhir/
├── app/                    # Next.js App Router
├── components/             # UI components
├── features/               # Feature modules (pluggable)
├── src/
│   ├── application/       # Application layer
│   ├── core/              # Domain layer
│   ├── infrastructure/    # Infrastructure layer
│   └── shared/            # Shared utilities
├── docs/                  # 📚 Documentation (7 core files)
└── __tests__/             # Tests
```

---

## 🏗️ Architecture

### Clean Architecture

```
Presentation → app/ • features/ • components/
Application  → src/application/
Domain       → src/core/
Infrastructure → src/infrastructure/
```

### Pluggable Architecture

**Left Panel**: `src/shared/config/feature-registry.ts`
**Right Panel**: `src/shared/config/right-panel-registry.ts`

See: [ARCHITECTURE.md](./docs/ARCHITECTURE.md)

---

## 🧪 Testing

```bash
npm test              # Run tests
npm test:watch        # Watch mode
npm test:coverage     # Coverage report
```

---

## 📚 Documentation

### User Documentation
- [USER_GUIDE.md](./USER_GUIDE.md) - User guide

### Developer Documentation

**Architecture**:
- [ARCHITECTURE.md](./docs/ARCHITECTURE.md) - System architecture

**Implementation Guides**:
- [AI_AGENT_IMPLEMENTATION.md](./docs/AI_AGENT_IMPLEMENTATION.md) - AI Agent
- [MEDICAL_CHAT.md](./docs/MEDICAL_CHAT.md) - Medical Chat
- [PROMPT_GALLERY.md](./docs/PROMPT_GALLERY.md) - Prompt Gallery
- [FEATURES.md](./docs/FEATURES.md) - Feature modules

**Deployment**:
- [Firebase Functions Repo](https://github.com/voho0000/firebase-smart-on-fhir) - Firebase setup and deployment guide

**Security**:
- [SECURITY.md](./docs/SECURITY.md) - Security guide

---

## 📄 License

This project is private and proprietary.

---

## 🆘 Support

For questions, please report via GitHub Issues.
