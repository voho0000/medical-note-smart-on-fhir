# MediPrisma · SMART on FHIR 使用者操作指南 / User Guide

> **語言選擇 / Language Selection:**  
> 📖 [**中文版**](#中文版) | 📖 [**English Version**](#english-version)

---

## 目錄 / Table of Contents

### 中文版
- [系統簡介](#系統簡介)
- [首次使用設定](#首次使用設定)
- [主要功能介紹](#主要功能介紹)
  - [左側面板：臨床摘要](#左側面板臨床摘要)
  - [右側面板：AI 功能](#右側面板ai-功能)
- [工作流程建議](#工作流程建議)
- [常見問題](#常見問題)

### English Version
- [System Overview](#system-overview)
- [Initial Setup](#initial-setup)
- [Main Features](#main-features)
  - [Left Panel: Clinical Summary](#left-panel-clinical-summary)
  - [Right Panel: AI Features](#right-panel-ai-features)
- [Recommended Workflows](#recommended-workflows)
- [FAQ](#faq)

---

# 中文版

[🔝 返回頂部](#mediprisma--smart-on-fhir-使用者操作指南--user-guide) | [🌐 切換到 English](#english-version)

## 系統簡介

MediPrisma · SMART on FHIR 是一個智能臨床文件助理系統，協助醫療人員：
- 快速查看病患的完整臨床資料
- 使用 AI 生成臨床摘要和病歷記錄
- 透過語音輸入建立病歷
- 與 AI 助理互動，獲得臨床建議

### 線上展示

**Demo 網站：** https://voho0000.github.io/medical-note-smart-on-fhir

**Launch URL（用於 SMART Launcher）：** https://voho0000.github.io/medical-note-smart-on-fhir/smart/launch

> 💡 請透過 SMART on FHIR Launcher（如 [SMART Health IT Launcher](https://launch.smarthealthit.org/)）輸入上述 Launch URL 來啟動應用程式進行測試。

### 系統需求
- 現代網頁瀏覽器（Chrome、Safari、Edge、Firefox）
- 穩定的網路連線
- 麥克風（用於語音輸入功能）

---

## 首次使用設定

### 步驟 1：登入系統

1. 透過醫院的 SMART on FHIR 啟動器開啟應用程式
2. 系統會自動進行身份驗證
3. 成功登入後，您會看到主介面

**注意事項：**
- 請勿直接重新整理頁面
- 如需重新登入，請從啟動器重新開始

### 步驟 2：設定 API 金鑰

首次使用需要設定 AI 功能的 API 金鑰：

1. 點擊右側面板的「**設定**」標籤
2. 在「API 金鑰設定」區域輸入您的金鑰：
   - **OpenAI API 金鑰**：用於 GPT 模型
   - **Google Gemini API 金鑰**：用於 Gemini 模型
   - 至少需要設定一個金鑰
3. 選擇您偏好的 AI 模型
4. 點擊「儲存設定」

**安全提示：**
- API 金鑰僅儲存在您的瀏覽器本地
- 不會傳送到其他伺服器
- 請妥善保管您的 API 金鑰

### 步驟 3：選擇語言

點擊右上角的語言切換按鈕，選擇「中文」或「English」。

---

## 主要功能介紹

### 左側面板：臨床摘要

左側面板顯示病患的完整臨床資料，分為四個標籤：

#### 1. 病患 / 生命徵象 / 診斷
此標籤整合顯示三個主要卡片：

- **病患資訊卡片**：姓名、性別、出生日期、年齡
- **生命徵象卡片**：最新的血壓、心率、體溫、呼吸速率、血氧飽和度、身高、體重、BMI
- **診斷卡片**：目前和過往的診斷記錄

**使用方式：**
- 所有資料會自動從 FHIR 伺服器載入
- 向下滾動查看各個卡片內容

#### 2. 報告
- 顯示所有診斷性檢查報告
- 分為「全部」、「檢驗」、「影像」、「處置」四個子標籤
- 可篩選時間範圍（過去 24 小時、3 天、1 週、1 個月、3 個月、6 個月、1 年、全部時間）
- 可選擇僅顯示最新版本或所有版本

**使用方式：**
- 點擊子標籤切換不同類型的報告
- 使用時間範圍篩選器快速找到特定時期的報告
- 點擊報告可展開查看詳細內容

#### 3. 用藥
- **用藥記錄**：顯示病患的所有用藥
- **過敏史**：顯示已知的藥物過敏和不耐症
- 可篩選「使用中」或「全部」用藥

**使用方式：**
- 切換「使用中」/「全部」查看不同狀態的用藥
- 檢視完整的用藥清單和過敏史
- 確認過敏史以避免藥物交互作用

#### 4. 就診紀錄
- 顯示病患的歷次就診記錄
- 包含就診類型（門診、住院、急診、居家照護、遠距就醫）
- 顯示就診日期、主治醫師、就診原因、診斷
- 可展開查看該次就診的檢驗、用藥、處置詳情

**使用方式：**
- 點擊「查看檢驗與用藥」展開詳細資訊
- 查看每次就診的完整記錄

---

### 右側面板：AI 功能

右側面板提供四個主要功能標籤：

#### 1. 筆記對話（Note Chat）

與 AI 助理互動，協助撰寫病歷或回答臨床問題。

**使用方式：**

1. **語音輸入**：
   - 點擊麥克風按鈕開始錄音
   - 說出您的病歷內容或問題
   - 再次點擊停止錄音
   - 系統會自動轉錄並送出

2. **文字輸入**：
   - 在輸入框直接輸入文字
   - 按 Enter 或點擊送出按鈕

3. **查看回應**：
   - AI 會根據病患資料和您的輸入生成回應
   - 可複製回應內容到病歷系統

**實用範例：**
- "請根據病患資料撰寫入院病歷"
- "這位病患的主要問題是什麼？"
- "建議的治療計畫為何？"
- "請整理最近的檢驗結果"

**進階功能：**
- **插入臨床資料**：點擊「臨床資料」按鈕將選定的病患資料插入對話
- **插入語音文字**：點擊「語音文字」按鈕將最近的語音轉錄插入對話
- **插入範本**：從下拉選單選擇預設的提示範本快速開始
- **編輯系統提示**：點擊標題列的編輯按鈕自訂 AI 助理的行為
- **重設聊天**：點擊「Chat」按鈕清除對話記錄重新開始

#### 2. 資料選擇（Data Selection）

精確控制 AI 使用哪些臨床資料。

**使用方式：**

1. **選擇資料類型**：
   - 診斷/病況
   - 用藥記錄
   - 過敏史
   - 檢驗報告
   - 生命徵象

2. **篩選條件**：
   - **日期範圍**：選擇特定時間範圍的資料
   - **關鍵字搜尋**：快速找到特定項目
   - **狀態篩選**：僅顯示活動中的項目

3. **勾選項目**：
   - 勾選您想要 AI 參考的資料
   - 可全選或取消全選
   - 選擇的資料會在 AI 回應時作為上下文

**使用情境：**
- 只想參考最近一個月的資料
- 專注於特定疾病相關的資料
- 排除不相關的歷史記錄

#### 3. 臨床洞察（Clinical Insights）

自動生成臨床分析和建議。

**預設分析項目：**

1. **安全警示（Safety Flag）**：
   - 突顯緊急安全問題或禁忌症
   - 標記立即的病人安全風險
   - 包括藥物交互作用、異常結果或緊急追蹤需求
   - 依嚴重程度排序

2. **變化摘要（What's Changed）**：
   - 總結與先前資料或就診相比的顯著變化
   - 列出狀態、治療或結果中最重要的變化
   - 強調需要注意的差異

3. **臨床快照（Clinical Snapshot）**：
   - 提供當前臨床狀況的簡明概述
   - 涵蓋活動中的問題、目前治療、近期結果和待辦事項
   - 保持簡短且可執行

**使用方式：**

1. 點擊各個標籤查看不同分析
2. 點擊「重新生成」按鈕更新內容
3. 可編輯提示詞（Prompt）自訂分析內容
4. 點擊「複製」按鈕複製結果

**自動生成：**
- 在設定中啟用「自動生成」
- 系統會在載入病患資料後自動產生洞察

#### 4. 設定（Settings）

管理系統設定和偏好，分為三個子標籤：

**AI 偏好設定標籤：**

1. **外觀設定**：
   - 切換亮色模式或深色模式

2. **生成模型選擇**：
   - **內建模型**（透過 Firebase 代理，無需個人金鑰）：
     - GPT-5 Mini（經濟實惠的基礎模型）
     - GPT-5.1（臨床摘要推薦模型）
     - Gemini 2.5 Flash（快速 Gemini 模型）
     - Gemini 3 Flash Preview（預覽版）
   - **進階模型**（需要個人 API 金鑰）：
     - GPT-5.2（最新進階模型）
     - GPT-5 Pro（專業級模型）
     - Gemini 2.5 Pro（進階 Gemini 模型）
     - Gemini 3 Pro Preview（高級預覽版）

3. **API 金鑰管理**：
   - 個人 OpenAI API 金鑰（本機儲存）
   - 個人 Gemini API 金鑰（本機儲存）
   - 儲存或清除金鑰

**提示範本標籤：**

- 建立可重複使用的提示範本
- 每個範本包含：標籤、描述、提示內容
- 最多可建立多個範本
- 可新增、編輯、刪除範本
- 重設為預設範本

**臨床洞察標籤標籤：**

- 啟用/停用「載入頁面時自動產生洞察」
- 自訂臨床洞察中顯示的標籤
- 每個標籤包含：標籤名稱、副標題、提示內容
- 可新增、編輯、刪除、重新排序標籤
- 重設為預設標籤配置

---

## 工作流程建議

### 情境 1：撰寫門診病歷

1. 在左側面板「病患 / 生命徵象 / 診斷」標籤查看病患基本資料
2. 切換到右側「資料選擇」，勾選相關的診斷和用藥
3. 切換到「筆記對話」標籤
4. 從範本下拉選單選擇適合的提示範本（如有設定）
5. 使用語音輸入或文字輸入描述病患主訴和理學檢查
6. 點擊「臨床資料」按鈕插入選定的病患資料
7. 要求 AI 生成病歷內容
8. 複製結果並貼到病歷系統

### 情境 2：快速了解新病患

1. 切換到「臨床洞察」標籤
2. 查看自動生成的問題清單
3. 閱讀 SOAP 摘要
4. 在「病歷對話」中詢問特定問題
5. 查看左側的詳細資料確認

### 情境 3：用藥評估

1. 在左側面板切換到「用藥」標籤
2. 查看所有使用中的用藥和過敏史
3. 在右側「資料選擇」中勾選所有用藥和過敏史
4. 切換到「臨床洞察」標籤查看 AI 生成的用藥分析
5. 在「筆記對話」詢問特定的藥物交互作用問題

---

## 常見問題

### Q1: 為什麼看不到病患資料？

**可能原因：**
- 未正確登入 SMART on FHIR 系統
- 網路連線問題
- FHIR 伺服器暫時無法存取

**解決方式：**
- 重新從啟動器登入
- 檢查網路連線
- 聯絡 IT 支援

### Q2: AI 沒有回應或回應錯誤？

**可能原因：**
- API 金鑰未設定或無效
- API 配額用盡
- 網路連線問題

**解決方式：**
- 檢查設定中的 API 金鑰
- 確認 API 帳戶有足夠配額
- 嘗試切換不同的 AI 模型

### Q3: 語音輸入無法使用？

**可能原因：**
- 瀏覽器未授權麥克風權限
- 麥克風硬體問題

**解決方式：**
- 在瀏覽器設定中允許麥克風權限
- 檢查麥克風是否正常運作
- 嘗試使用文字輸入

### Q4: 如何確保資料安全？

**系統安全措施：**
- 使用 SMART on FHIR 標準認證
- API 金鑰僅存於本地瀏覽器
- 不儲存病患資料在外部伺服器
- 所有通訊使用加密連線

**使用建議：**
- 使用完畢後登出系統
- 不在公共電腦儲存 API 金鑰
- 定期更新 API 金鑰

### Q5: 可以同時開啟多個病患嗎？

目前系統一次只能處理一位病患。如需切換病患，請：
1. 返回 SMART 啟動器
2. 選擇新的病患
3. 重新啟動應用程式

### Q6: AI 生成的內容可以直接使用嗎？

**重要提醒：**
- AI 生成的內容僅供參考
- 醫師必須審核並確認所有內容
- 最終病歷由醫師負責
- 建議將 AI 內容作為草稿，再進行修改

### Q7: 如何獲得 API 金鑰？

**OpenAI API 金鑰：**
1. 前往 https://platform.openai.com
2. 註冊帳號並登入
3. 在 API Keys 頁面建立新金鑰
4. 複製金鑰並貼到設定的「AI 偏好設定」標籤中
5. 點擊「儲存金鑰」

**Google Gemini API 金鑰：**
1. 前往 https://aistudio.google.com/app/apikey
2. 使用 Google 帳號登入
3. 建立新的 API 金鑰
4. 複製金鑰並貼到設定的「AI 偏好設定」標籤中
5. 點擊「儲存金鑰」

**注意：** 
- 如果不提供個人 API 金鑰，系統會使用內建模型（透過 Firebase Functions 代理）
- 個人 API 金鑰僅儲存在您的瀏覽器本機，不會上傳到伺服器
- API 使用可能需要付費，請確認費率

---

## 技術支援

如遇到技術問題或需要協助，請聯絡：
- IT 支援部門
- 系統管理員
- 提供錯誤訊息截圖以加快處理速度

---

[⬆️ 返回中文版](#中文版)

---

# English Version

[🔝 Back to Top](#mediprisma--smart-on-fhir-使用者操作指南--user-guide) | [🌐 Switch to 中文](#中文版)

## System Overview

MediPrisma · SMART on FHIR is an intelligent clinical documentation assistant that helps healthcare providers:
- Quickly review comprehensive patient clinical data
- Generate clinical summaries and medical notes using AI
- Create medical records through voice input
- Interact with AI assistant for clinical insights

### Live Demo

**Demo Site:** https://voho0000.github.io/medical-note-smart-on-fhir

**Launch URL (for SMART Launcher):** https://voho0000.github.io/medical-note-smart-on-fhir/smart/launch

> 💡 Please use a SMART on FHIR Launcher (such as [SMART Health IT Launcher](https://launch.smarthealthit.org/)) and enter the Launch URL above to start the application for testing.

### System Requirements
- Modern web browser (Chrome, Safari, Edge, Firefox)
- Stable internet connection
- Microphone (for voice input feature)

---

## Initial Setup

### Step 1: System Login

1. Launch the application through your hospital's SMART on FHIR launcher
2. The system will automatically authenticate
3. After successful login, you'll see the main interface

**Important Notes:**
- Do not refresh the page directly
- To re-login, restart from the launcher

### Step 2: Configure API Keys

First-time setup requires AI feature API keys:

1. Click the "**Settings**" tab in the right panel
2. Enter your keys in the "API Key Settings" section:
   - **OpenAI API Key**: For GPT models
   - **Google Gemini API Key**: For Gemini models
   - At least one key is required
3. Select your preferred AI model
4. Click "Save Settings"

**Security Tips:**
- API keys are stored only in your browser locally
- Not transmitted to other servers
- Keep your API keys secure

### Step 3: Select Language

Click the language switcher button in the top-right corner to choose "中文" or "English".

---

## Main Features

### Left Panel: Clinical Summary

The left panel displays comprehensive patient clinical data in four tabs:

#### 1. Patient / Vitals / Diagnosis
This tab integrates three main cards:

- **Patient Information Card**: Name, gender, date of birth, age
- **Vital Signs Card**: Latest blood pressure, heart rate, temperature, respiratory rate, oxygen saturation, height, weight, BMI
- **Diagnoses Card**: Current and historical diagnosis records

**How to Use:**
- All data automatically loads from FHIR server
- Scroll down to view each card's content

#### 2. Reports
- Displays all diagnostic test reports
- Organized into four sub-tabs: "All", "Labs", "Imaging", "Procedures"
- Filter by time range (Last 24 hours, 3 days, 1 week, 1 month, 3 months, 6 months, 1 year, All time)
- Option to show latest versions only or all versions

**How to Use:**
- Click sub-tabs to switch between different report types
- Use time range filter to quickly find reports from specific periods
- Click reports to expand and view detailed content

#### 3. Medications
- **Medication Records**: Displays all patient medications
- **Allergy History**: Shows known drug allergies and intolerances
- Filter by "Active" or "All" medications

**How to Use:**
- Toggle between "Active"/"All" to view medications by status
- Review complete medication list and allergy history
- Confirm allergy history to avoid drug interactions

#### 4. Visit History
- Displays patient's historical visit records
- Includes visit types (Outpatient, Inpatient, Emergency, Home Care, Virtual Visit)
- Shows visit date, physician, reason, diagnosis
- Expandable to view tests, medications, and procedures for each visit

**How to Use:**
- Click "View tests & medications" to expand detailed information
- Review complete records for each visit

---

### Right Panel: AI Features

The right panel provides four main feature tabs:

#### 1. Note Chat

Interact with AI assistant to help write medical notes or answer clinical questions.

**How to Use:**

1. **Voice Input**:
   - Click microphone button to start recording
   - Speak your medical note content or questions
   - Click again to stop recording
   - System will automatically transcribe and submit

2. **Text Input**:
   - Type directly in the input box
   - Press Enter or click submit button

3. **View Response**:
   - AI generates responses based on patient data and your input
   - Copy response content to medical record system

**Practical Examples:**
- "Please write an admission note based on patient data"
- "What are the main problems for this patient?"
- "What is the recommended treatment plan?"
- "Please summarize recent lab results"

**Advanced Features:**
- **Insert Clinical Context**: Click "Context" button to insert selected patient data into conversation
- **Insert Voice Text**: Click "Voice" button to insert recent voice transcription into conversation
- **Insert Template**: Select from dropdown menu to quickly start with predefined prompt templates
- **Edit System Prompt**: Click edit button in header to customize AI assistant behavior
- **Reset Chat**: Click "Chat" button to clear conversation history and start fresh

#### 2. Data Selection

Precisely control which clinical data AI uses.

**How to Use:**

1. **Select Data Types**:
   - Diagnoses/Conditions
   - Medication Records
   - Allergy History
   - Diagnostic Reports
   - Vital Signs

2. **Filter Criteria**:
   - **Date Range**: Select data from specific time period
   - **Keyword Search**: Quickly find specific items
   - **Status Filter**: Show only active items

3. **Check Items**:
   - Check data you want AI to reference
   - Can select all or deselect all
   - Selected data will be used as context in AI responses

**Use Cases:**
- Only reference data from the last month
- Focus on specific disease-related data
- Exclude irrelevant historical records

#### 3. Clinical Insights

Automatically generate clinical analysis and recommendations.

**Default Analysis Items:**

1. **Safety Flag**:
   - Highlight urgent safety issues or contraindications
   - Flag immediate patient safety risks
   - Include drug interactions, abnormal results, or urgent follow-up needs
   - Ordered by severity

2. **What's Changed**:
   - Summarize notable changes compared to prior data or visits
   - List most important changes in status, therapy, or results
   - Emphasize deltas that require attention

3. **Clinical Snapshot**:
   - Provide a concise overview of the current clinical picture
   - Cover active problems, current therapies, recent results, and outstanding tasks
   - Keep it brief and actionable

**How to Use:**

1. Click tabs to view different analyses
2. Click "Regenerate" button to update content
3. Edit prompts to customize analysis content
4. Click "Copy" button to copy results

**Auto-Generate:**
- Enable "Auto-generate" in settings
- System will automatically generate insights after loading patient data

#### 4. Settings

Manage system settings and preferences, organized into three sub-tabs:

**AI Preferences Tab:**

1. **Appearance Settings**:
   - Toggle between Light Mode and Dark Mode

2. **Generation Model Selection**:
   - **Built-in Models** (via Firebase proxy, no personal key required):
     - GPT-5 Mini (Cost-efficient base model)
     - GPT-5.1 (Recommended for clinical summarization)
     - Gemini 2.5 Flash (Fast Gemini model)
     - Gemini 3 Flash Preview (Preview version)
   - **Premium Models** (requires personal API key):
     - GPT-5.2 (Latest premium model)
     - GPT-5 Pro (Professional grade model)
     - Gemini 2.5 Pro (Advanced Gemini model)
     - Gemini 3 Pro Preview (Premium preview version)

3. **API Key Management**:
   - Personal OpenAI API key (stored locally)
   - Personal Gemini API key (stored locally)
   - Save or clear keys

**Prompt Templates Tab:**

- Create reusable prompt templates
- Each template includes: label, description, prompt content
- Can create multiple templates
- Add, edit, delete templates
- Reset to default templates

**Clinical Insights Tabs Tab:**

- Enable/disable "Auto-generate insights on page load"
- Customize tabs displayed in Clinical Insights
- Each tab includes: tab label, subtitle, prompt content
- Add, edit, delete, reorder tabs
- Reset to default tab configuration

---

## Recommended Workflows

### Scenario 1: Writing Outpatient Notes

1. Review patient information in left panel's "Patient / Vitals / Diagnosis" tab
2. Switch to right panel's "Data Selection", check relevant diagnoses and medications
3. Switch to "Note Chat" tab
4. Select appropriate prompt template from dropdown menu (if configured)
5. Use voice input or text input to describe chief complaint and physical examination
6. Click "Context" button to insert selected patient data
7. Ask AI to generate medical note content
8. Copy result and paste into medical record system

### Scenario 2: Quickly Understanding New Patient

1. Switch to "Clinical Insights" tab
2. Review auto-generated problem list
3. Read SOAP summary
4. Ask specific questions in "Medical Chat"
5. Check detailed data in left panel for confirmation

### Scenario 3: Medication Assessment

1. Switch to "Medications" tab in left panel
2. Review all active medications and allergy history
3. Check all medications and allergies in right panel's "Data Selection"
4. Switch to "Clinical Insights" tab to view AI-generated medication analysis
5. Ask specific drug interaction questions in "Note Chat"

---

## FAQ

### Q1: Why can't I see patient data?

**Possible Causes:**
- Not properly logged into SMART on FHIR system
- Network connection issues
- FHIR server temporarily inaccessible

**Solutions:**
- Re-login from launcher
- Check network connection
- Contact IT support

### Q2: AI not responding or giving errors?

**Possible Causes:**
- API key not set or invalid
- API quota exhausted
- Network connection issues

**Solutions:**
- Check API key in settings
- Confirm API account has sufficient quota
- Try switching to different AI model

### Q3: Voice input not working?

**Possible Causes:**
- Browser hasn't authorized microphone permission
- Microphone hardware issues

**Solutions:**
- Allow microphone permission in browser settings
- Check if microphone is working properly
- Try using text input

### Q4: How to ensure data security?

**System Security Measures:**
- Uses SMART on FHIR standard authentication
- API keys stored only in local browser
- No patient data stored on external servers
- All communications use encrypted connections

**Usage Recommendations:**
- Logout after use
- Don't store API keys on public computers
- Regularly update API keys

### Q5: Can I open multiple patients simultaneously?

Currently, the system can only handle one patient at a time. To switch patients:
1. Return to SMART launcher
2. Select new patient
3. Restart application

### Q6: Can AI-generated content be used directly?

**Important Reminder:**
- AI-generated content is for reference only
- Physicians must review and confirm all content
- Final medical record is physician's responsibility
- Recommend using AI content as draft, then modify

### Q7: How to obtain API keys?

**OpenAI API Key:**
1. Go to https://platform.openai.com
2. Register and login
3. Create new key in API Keys page
4. Copy key and paste into "AI Preferences" tab in settings
5. Click "Save key"

**Google Gemini API Key:**
1. Go to https://aistudio.google.com/app/apikey
2. Login with Google account
3. Create new API key
4. Copy key and paste into "AI Preferences" tab in settings
5. Click "Save key"

**Note:** 
- If you don't provide a personal API key, the system will use built-in models (via Firebase Functions proxy)
- Personal API keys are stored only in your browser locally and are not uploaded to servers
- API usage may require payment, please confirm rates

---

## Technical Support

For technical issues or assistance, please contact:
- IT Support Department
- System Administrator
- Provide error message screenshots to expedite resolution

---

---

[⬆️ Back to English Version](#english-version) | [🔝 返回頂部](#mediprisma--smart-on-fhir-使用者操作指南--user-guide)

---

**Last Updated:** December 2024  
**Version:** 1.0
