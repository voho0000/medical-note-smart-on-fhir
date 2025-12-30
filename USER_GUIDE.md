# 臨床使用者操作指南 / Clinical User Guide

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

[🔝 返回頂部](#臨床使用者操作指南--clinical-user-guide) | [🌐 切換到 English](#english-version)

## 系統簡介

Medical Note SMART on FHIR 是一個智能臨床文件助理系統，協助醫療人員：
- 快速查看病患的完整臨床資料
- 使用 AI 生成臨床摘要和病歷記錄
- 透過語音輸入建立病歷
- 與 AI 助理互動，獲得臨床建議

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

#### 1. 病患資訊
- **基本資料**：姓名、性別、出生日期、聯絡方式
- **生命徵象**：最新的血壓、心跳、體溫、血氧等
- **診斷**：目前和過往的診斷記錄

**使用方式：**
- 點擊各個卡片可展開查看詳細資訊
- 資料會自動從 FHIR 伺服器載入

#### 2. 檢驗報告
- 顯示所有診斷性檢查報告
- 包含實驗室檢驗、影像檢查等
- 可查看報告日期、類型和結果

**使用方式：**
- 點擊報告可查看完整內容
- 使用搜尋功能快速找到特定報告

#### 3. 用藥與過敏
- **用藥記錄**：目前用藥、劑量、頻率
- **過敏史**：藥物過敏、食物過敏等

**使用方式：**
- 檢視完整的用藥清單
- 確認過敏史以避免藥物交互作用

#### 4. 就診記錄
- 顯示病患的歷次就診記錄
- 包含就診日期、診斷、處置等

---

### 右側面板：AI 功能

右側面板提供四個主要功能標籤：

#### 1. 病歷對話（Medical Chat）

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
- **選擇 AI 模型**：在設定中切換不同的 AI 模型
- **調整溫度參數**：控制回應的創意程度（0-1）
- **清除對話**：點擊清除按鈕重新開始

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

自動生成各種臨床摘要和分析。

**預設分析項目：**

1. **SOAP 病歷**：
   - Subjective（主觀）
   - Objective（客觀）
   - Assessment（評估）
   - Plan（計畫）

2. **問題清單**：
   - 目前活動中的問題
   - 優先順序排序

3. **用藥建議**：
   - 藥物交互作用檢查
   - 劑量建議

**使用方式：**

1. 點擊各個標籤查看不同分析
2. 點擊「重新生成」按鈕更新內容
3. 可編輯提示詞（Prompt）自訂分析內容
4. 點擊「複製」按鈕複製結果

**自動生成：**
- 在設定中啟用「自動生成」
- 系統會在載入病患資料後自動產生洞察

#### 4. 設定（Settings）

管理系統設定和偏好。

**設定項目：**

1. **API 金鑰管理**：
   - 新增/更新 OpenAI API 金鑰
   - 新增/更新 Google Gemini API 金鑰
   - 測試金鑰是否有效

2. **AI 模型選擇**：
   - GPT-4（最強大，較慢）
   - GPT-4 Turbo（平衡）
   - GPT-3.5 Turbo（快速）
   - Gemini Pro
   - Gemini 1.5 Pro

3. **臨床洞察設定**：
   - 啟用/停用自動生成
   - 自訂分析項目
   - 編輯提示詞範本

4. **語音辨識設定**：
   - 選擇語音辨識語言
   - 調整辨識靈敏度

---

## 工作流程建議

### 情境 1：撰寫門診病歷

1. 在左側面板查看病患基本資料和生命徵象
2. 切換到「資料選擇」，勾選相關的診斷和用藥
3. 切換到「病歷對話」
4. 使用語音輸入描述病患主訴和理學檢查
5. 要求 AI 生成 SOAP 格式病歷
6. 複製結果並貼到病歷系統

### 情境 2：快速了解新病患

1. 切換到「臨床洞察」標籤
2. 查看自動生成的問題清單
3. 閱讀 SOAP 摘要
4. 在「病歷對話」中詢問特定問題
5. 查看左側的詳細資料確認

### 情境 3：用藥評估

1. 在左側面板查看「用藥與過敏」
2. 在「資料選擇」中選擇所有用藥和過敏史
3. 在「臨床洞察」查看用藥建議
4. 在「病歷對話」詢問藥物交互作用

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
4. 複製金鑰並貼到設定中

**Google Gemini API 金鑰：**
1. 前往 https://makersuite.google.com/app/apikey
2. 使用 Google 帳號登入
3. 建立新的 API 金鑰
4. 複製金鑰並貼到設定中

**注意：** API 使用可能需要付費，請確認費率。

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

[🔝 Back to Top](#臨床使用者操作指南--clinical-user-guide) | [🌐 Switch to 中文](#中文版)

## System Overview

Medical Note SMART on FHIR is an intelligent clinical documentation assistant that helps healthcare providers:
- Quickly review comprehensive patient clinical data
- Generate clinical summaries and medical notes using AI
- Create medical records through voice input
- Interact with AI assistant for clinical insights

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

#### 1. Patient Information
- **Demographics**: Name, gender, date of birth, contact information
- **Vital Signs**: Latest blood pressure, heart rate, temperature, oxygen saturation, etc.
- **Diagnoses**: Current and historical diagnosis records

**How to Use:**
- Click cards to expand and view detailed information
- Data automatically loads from FHIR server

#### 2. Reports
- Displays all diagnostic test reports
- Includes laboratory tests, imaging studies, etc.
- View report date, type, and results

**How to Use:**
- Click reports to view full content
- Use search function to quickly find specific reports

#### 3. Medications & Allergies
- **Medication Records**: Current medications, dosages, frequencies
- **Allergy History**: Drug allergies, food allergies, etc.

**How to Use:**
- Review complete medication list
- Confirm allergy history to avoid drug interactions

#### 4. Visit History
- Displays patient's visit records
- Includes visit dates, diagnoses, treatments, etc.

---

### Right Panel: AI Features

The right panel provides four main feature tabs:

#### 1. Medical Chat

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
- **Select AI Model**: Switch between different AI models in settings
- **Adjust Temperature**: Control response creativity (0-1)
- **Clear Chat**: Click clear button to start fresh

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

Automatically generate various clinical summaries and analyses.

**Default Analysis Items:**

1. **SOAP Note**:
   - Subjective
   - Objective
   - Assessment
   - Plan

2. **Problem List**:
   - Currently active problems
   - Priority sorted

3. **Medication Recommendations**:
   - Drug interaction checks
   - Dosage recommendations

**How to Use:**

1. Click tabs to view different analyses
2. Click "Regenerate" button to update content
3. Edit prompts to customize analysis content
4. Click "Copy" button to copy results

**Auto-Generate:**
- Enable "Auto-generate" in settings
- System will automatically generate insights after loading patient data

#### 4. Settings

Manage system settings and preferences.

**Setting Items:**

1. **API Key Management**:
   - Add/update OpenAI API key
   - Add/update Google Gemini API key
   - Test if keys are valid

2. **AI Model Selection**:
   - GPT-4 (most powerful, slower)
   - GPT-4 Turbo (balanced)
   - GPT-3.5 Turbo (fast)
   - Gemini Pro
   - Gemini 1.5 Pro

3. **Clinical Insights Settings**:
   - Enable/disable auto-generation
   - Customize analysis items
   - Edit prompt templates

4. **Voice Recognition Settings**:
   - Select voice recognition language
   - Adjust recognition sensitivity

---

## Recommended Workflows

### Scenario 1: Writing Outpatient Notes

1. Review patient demographics and vital signs in left panel
2. Switch to "Data Selection", check relevant diagnoses and medications
3. Switch to "Medical Chat"
4. Use voice input to describe chief complaint and physical examination
5. Ask AI to generate SOAP format note
6. Copy result and paste into medical record system

### Scenario 2: Quickly Understanding New Patient

1. Switch to "Clinical Insights" tab
2. Review auto-generated problem list
3. Read SOAP summary
4. Ask specific questions in "Medical Chat"
5. Check detailed data in left panel for confirmation

### Scenario 3: Medication Assessment

1. Review "Medications & Allergies" in left panel
2. Select all medications and allergies in "Data Selection"
3. Check medication recommendations in "Clinical Insights"
4. Ask about drug interactions in "Medical Chat"

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
4. Copy key and paste into settings

**Google Gemini API Key:**
1. Go to https://makersuite.google.com/app/apikey
2. Login with Google account
3. Create new API key
4. Copy key and paste into settings

**Note:** API usage may require payment, please confirm rates.

---

## Technical Support

For technical issues or assistance, please contact:
- IT Support Department
- System Administrator
- Provide error message screenshots to expedite resolution

---

---

[⬆️ Back to English Version](#english-version) | [🔝 返回頂部](#臨床使用者操作指南--clinical-user-guide)

---

**Last Updated:** December 2024  
**Version:** 1.0
