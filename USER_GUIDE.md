# MediPrisma 使用者指南 / User Guide

> **語言選擇 / Language Selection:**  
> 📖 [**中文版**](#中文版) | 📖 [**English Version**](#english-version)

---

# 中文版

## 🎯 系統簡介

MediPrisma 是智能臨床文件助理系統，整合 SMART on FHIR 和 AI 技術，協助醫療人員：
- 快速查看病患完整臨床資料
- 使用 AI Agent 自動查詢 FHIR 資料和醫學文獻
- 透過 AI 對話生成臨床筆記
- 管理對話歷史和提示範本

### 線上展示
- **Demo**：https://voho0000.github.io/medical-note-smart-on-fhir
- **Launch URL**：https://voho0000.github.io/medical-note-smart-on-fhir/smart/launch

> 💡 透過 [SMART Health IT Launcher](https://launch.smarthealthit.org/) 啟動應用程式

---

## 🚀 快速開始

### 1. 啟動應用程式
1. 透過 SMART on FHIR Launcher 開啟
2. 系統自動進行 OAuth 認證
3. 成功後進入主介面

**注意**：請勿直接重新整理頁面，需重新登入請從 Launcher 重新開始

### 2. 登入（選用）
點擊右上角「登入」按鈕：
- Google 登入
- Email/密碼登入

登入後可使用：
- 對話歷史（依病人儲存）
- 提示範本庫
- 個人化設定同步

### 3. 設定 API 金鑰（選用）
前往「設定」→「AI 偏好設定」：
- OpenAI API 金鑰（進階 GPT 模型）
- Gemini API 金鑰（進階 Gemini 模型）
- Perplexity API 金鑰（文獻搜尋）

**內建模型**（無需金鑰）：
- GPT-5 Mini
- Gemini 3 Flash Preview

---

## 📱 主要功能

### 左側面板：臨床摘要

**4 個標籤**：
1. **病患**：基本資料、生命徵象
2. **報告**：診斷報告、檢驗結果
3. **用藥**：用藥清單、過敏史
4. **就診**：就診紀錄、診斷

**功能**：
- 可調整面板大小
- 點擊項目查看詳細資訊
- 手機版自動隱藏

### 右側面板：AI 功能

**4 個標籤**：

#### 1. 筆記對話
- **一般模式**：快速 AI 對話
- **深入模式（AI Agent）**：自動調用 8 種工具
  - 7 個 FHIR 工具（查詢診斷、用藥、檢驗等）
  - 1 個文獻搜尋工具（Perplexity）
- 🎤 語音錄製（Whisper 轉錄）
- 📋 提示範本快速套用
- 📚 對話歷史管理

#### 2. 資料選擇
- 篩選特定臨床資料
- 提供情境感知的 AI 回應

#### 3. 臨床洞察
- 自動生成臨床摘要
- 可自訂洞察標籤：
  - 安全警示
  - 變化摘要
  - 臨床快照

#### 4. 設定
- **AI 偏好設定**：模型選擇、API 金鑰、外觀
- **提示範本**：建立和管理範本
- **臨床洞察標籤**：自訂標籤

---

## 💡 使用技巧

### AI Agent 深入模式
**何時使用**：
- 需要查詢多種臨床資料
- 需要醫學文獻支援
- 複雜的臨床問題

**範例問題**：
- "這位病人最近的血糖控制如何？"
- "有哪些用藥可能影響腎功能？"
- "高血壓的最新治療指引是什麼？"

### 對話歷史
- 自動依病人分類儲存
- 支援跨裝置同步（需登入）
- 可繼續先前的對話
- 可刪除不需要的對話

### 提示範本庫
- 瀏覽社群共享範本
- 依類型、專科、標籤篩選
- 分享自己的範本
- 查看使用計數

### 語音輸入
1. 點擊麥克風圖示
2. 開始錄音
3. 停止後自動轉錄
4. 編輯後送出

---

## 🔧 常見問題

### Q: 為什麼看不到病患資料？
A: 確認已透過 SMART Launcher 正確啟動，並有適當的權限。

### Q: API 金鑰安全嗎？
A: 金鑰僅儲存在瀏覽器本地，使用 AES-GCM 256-bit 加密。

### Q: 對話歷史會混淆不同病人嗎？
A: 不會，系統依病人分類儲存，使用 `fhirServerUrl + patientId` 作為唯一識別。

### Q: 可以離線使用嗎？
A: 需要網路連線才能存取 FHIR 資料和 AI 功能。

### Q: 如何切換語言？
A: 點擊右上角的語言切換按鈕。

### Q: 深色模式在哪裡？
A: 設定 → AI 偏好設定 → 外觀設定。

---

## 🆘 支援

如有問題，請透過 GitHub Issues 回報。

---

# English Version

## 🎯 System Overview

MediPrisma is an intelligent clinical documentation assistant that integrates SMART on FHIR and AI technology to help healthcare professionals:
- Quickly view complete patient clinical data
- Use AI Agent to automatically query FHIR data and medical literature
- Generate clinical notes through AI conversations
- Manage chat history and prompt templates

### Live Demo
- **Demo**: https://voho0000.github.io/medical-note-smart-on-fhir
- **Launch URL**: https://voho0000.github.io/medical-note-smart-on-fhir/smart/launch

> 💡 Launch via [SMART Health IT Launcher](https://launch.smarthealthit.org/)

---

## 🚀 Quick Start

### 1. Launch Application
1. Open via SMART on FHIR Launcher
2. System performs OAuth authentication automatically
3. Enter main interface after success

**Note**: Do not refresh the page directly. To re-login, restart from Launcher.

### 2. Sign In (Optional)
Click "Sign In" button in top-right corner:
- Google Sign-In
- Email/Password Sign-In

After signing in, you can use:
- Chat history (stored per patient)
- Prompt gallery
- Personalized settings sync

### 3. Configure API Keys (Optional)
Go to "Settings" → "AI Preferences":
- OpenAI API Key (advanced GPT models)
- Gemini API Key (advanced Gemini models)
- Perplexity API Key (literature search)

**Built-in Models** (no key needed):
- GPT-5 Mini
- Gemini 3 Flash Preview

---

## 📱 Main Features

### Left Panel: Clinical Summary

**4 Tabs**:
1. **Patient**: Demographics, vitals
2. **Reports**: Diagnostic reports, lab results
3. **Meds**: Medications, allergies
4. **Visits**: Encounter history, diagnoses

**Features**:
- Resizable panel
- Click items for details
- Auto-hide on mobile

### Right Panel: AI Features

**4 Tabs**:

#### 1. Note Chat
- **Normal Mode**: Quick AI conversations
- **Deep Mode (AI Agent)**: Auto-invokes 8 tools
  - 7 FHIR tools (query diagnoses, meds, labs, etc.)
  - 1 literature search tool (Perplexity)
- 🎤 Voice recording (Whisper transcription)
- �� Quick prompt templates
- 📚 Chat history management

#### 2. Data Selection
- Filter specific clinical data
- Context-aware AI responses

#### 3. Clinical Insights
- Auto-generate clinical summaries
- Customizable insight tags:
  - Safety flags
  - What's changed
  - Clinical snapshot

#### 4. Settings
- **AI Preferences**: Model selection, API keys, appearance
- **Prompt Templates**: Create and manage templates
- **Clinical Insight Tags**: Customize tags

---

## 💡 Tips

### AI Agent Deep Mode
**When to use**:
- Need to query multiple clinical data types
- Need medical literature support
- Complex clinical questions

**Example questions**:
- "How is this patient's recent blood sugar control?"
- "Which medications might affect kidney function?"
- "What are the latest hypertension treatment guidelines?"

### Chat History
- Auto-saved per patient
- Cross-device sync (requires sign-in)
- Continue previous conversations
- Delete unwanted chats

### Prompt Gallery
- Browse community-shared templates
- Filter by type, specialty, tags
- Share your own templates
- View usage counts

### Voice Input
1. Click microphone icon
2. Start recording
3. Auto-transcribe after stop
4. Edit and send

---

## 🔧 FAQ

### Q: Why can't I see patient data?
A: Ensure you launched correctly via SMART Launcher with appropriate permissions.

### Q: Are API keys secure?
A: Keys are stored locally in browser with AES-GCM 256-bit encryption.

### Q: Will chat history mix different patients?
A: No, system stores per patient using `fhirServerUrl + patientId` as unique identifier.

### Q: Can I use offline?
A: Internet connection required for FHIR data access and AI features.

### Q: How to switch language?
A: Click language toggle button in top-right corner.

### Q: Where is dark mode?
A: Settings → AI Preferences → Appearance.

---

## 🆘 Support

For questions, please report via GitHub Issues.
