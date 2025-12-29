# 🔍 Components 重構分析

## 📊 程式碼行數統計

### 🔴 需要重構的大型檔案 (>300 行)

| 檔案 | 行數 | 狀態 | 優先級 |
|------|------|------|--------|
| **VisitHistoryCard.tsx** | 635 | 🔴 過大 | 高 |
| **ReportsCard.tsx** | 563 | 🔴 過大 | 高 |
| **MedicalChat.tsx** | 536 | 🔴 過大 | 高 |
| **DataSelectionPanel.tsx** | 530 | 🔴 過大 | 高 |
| **MedListCard.tsx** | 435 | 🔴 過大 | 中 |
| **ClinicalInsights Feature.tsx** | 366 | 🔴 過大 | 中 |

### 🟡 可考慮重構 (200-300 行)

| 檔案 | 行數 | 狀態 |
|------|------|------|
| **ApiKeyField.tsx** | 259 | 🟡 偏大 |

### 🟢 大小合理 (<200 行)

| 檔案 | 行數 | 狀態 |
|------|------|------|
| VitalsCard.tsx | 166 | 🟢 良好 |
| AllergiesCard.tsx | 163 | 🟢 良好 |
| ClinicalInsightsSettings.tsx | 145 | 🟢 良好 |
| DiagnosisCard.tsx | 132 | 🟢 良好 |
| PatientInfoCard.tsx | 128 | 🟢 良好 |
| RightPanel Feature.tsx | 110 | 🟢 良好 |
| PromptTemplatesSettings.tsx | 102 | 🟢 良好 |

---

## 🎯 重構建議

### 1. **MedicalChat.tsx** (536 行) 🔴

#### 問題分析
- 包含太多職責：聊天邏輯、語音錄製、模板選擇、API 調用
- 多個 useEffect 和 useState
- 複雜的事件處理邏輯

#### 建議拆分
```
features/medical-chat/components/
├── MedicalChat.tsx (主元件，100-150 行)
├── ChatMessageList.tsx (訊息列表顯示)
├── ChatInput.tsx (輸入框和發送邏輯)
├── VoiceRecorder.tsx (語音錄製功能)
├── TemplateSelector.tsx (模板選擇器)
└── hooks/
    ├── useChatMessages.ts (聊天訊息管理)
    ├── useVoiceRecording.ts (語音錄製邏輯)
    └── useWhisperTranscription.ts (語音轉文字)
```

#### 重構優先級：**高** ⭐⭐⭐

---

### 2. **VisitHistoryCard.tsx** (635 行) 🔴

#### 問題分析
- 最大的單一元件
- 包含複雜的資料處理和顯示邏輯
- 多層嵌套的 UI 結構

#### 建議拆分
```
features/clinical-summary/components/
├── VisitHistoryCard.tsx (主元件，100-150 行)
├── VisitHistoryItem.tsx (單個就診記錄)
├── VisitHistoryTimeline.tsx (時間軸顯示)
├── VisitHistoryFilters.tsx (篩選器)
└── hooks/
    └── useVisitHistory.ts (資料處理邏輯)
```

#### 重構優先級：**高** ⭐⭐⭐

---

### 3. **ReportsCard.tsx** (563 行) 🔴

#### 問題分析
- 處理多種報告類型
- 複雜的資料格式化邏輯
- 大量的條件渲染

#### 建議拆分
```
features/clinical-summary/components/
├── ReportsCard.tsx (主元件，100-150 行)
├── ReportItem.tsx (單個報告顯示)
├── ReportDetails.tsx (報告詳細內容)
├── ReportFilters.tsx (報告篩選)
└── utils/
    └── reportFormatters.ts (報告格式化工具)
```

#### 重構優先級：**高** ⭐⭐⭐

---

### 4. **DataSelectionPanel.tsx** (530 行) 🔴

#### 問題分析
- 處理多種資料類型的選擇
- 複雜的狀態管理
- 大量的 UI 邏輯

#### 建議拆分
```
features/data-selection/components/
├── DataSelectionPanel.tsx (主元件，100-150 行)
├── DataTypeSelector.tsx (資料類型選擇器)
├── DataItemList.tsx (資料項目列表)
├── DataFilters.tsx (篩選器)
├── TimeRangeSelector.tsx (時間範圍選擇)
└── hooks/
    └── useDataSelection.ts (選擇邏輯)
```

#### 重構優先級：**高** ⭐⭐⭐

---

### 5. **MedListCard.tsx** (435 行) 🔴

#### 問題分析
- 藥物列表顯示邏輯複雜
- 多種藥物狀態處理
- 大量的資料格式化

#### 建議拆分
```
features/clinical-summary/components/
├── MedListCard.tsx (主元件，100-150 行)
├── MedicationItem.tsx (單個藥物顯示)
├── MedicationDetails.tsx (藥物詳細資訊)
├── MedicationFilters.tsx (藥物篩選)
└── utils/
    └── medicationFormatters.ts (藥物格式化)
```

#### 重構優先級：**中** ⭐⭐

---

### 6. **ClinicalInsights Feature.tsx** (366 行) 🔴

#### 問題分析
- Feature 檔案過大
- 包含太多業務邏輯
- 多個面板的狀態管理

#### 建議拆分
```
features/clinical-insights/
├── Feature.tsx (主元件，100-150 行)
├── components/
│   ├── InsightPanel.tsx (單個洞察面板)
│   ├── InsightContent.tsx (洞察內容顯示)
│   └── InsightActions.tsx (操作按鈕)
└── hooks/
    ├── useInsightGeneration.ts (洞察生成邏輯)
    └── useInsightPanels.ts (面板管理)
```

#### 重構優先級：**中** ⭐⭐

---

### 7. **ApiKeyField.tsx** (259 行) 🟡

#### 問題分析
- 包含多個 API Key 的管理
- 模型選擇邏輯
- 可以適度拆分

#### 建議拆分
```
features/settings/components/
├── ApiKeyField.tsx (主元件，100-150 行)
├── ApiKeyInput.tsx (API Key 輸入框)
├── ModelSelector.tsx (模型選擇器)
└── hooks/
    └── useApiKeyManagement.ts (API Key 管理邏輯)
```

#### 重構優先級：**低** ⭐

---

## 📋 Clean Code 原則

### 單一職責原則 (SRP)
- ✅ 每個元件只負責一個功能
- ✅ 將業務邏輯抽取到 hooks
- ✅ 將工具函數抽取到 utils

### 元件大小建議
- 🟢 **理想**: 50-150 行
- 🟡 **可接受**: 150-250 行
- 🔴 **需重構**: >250 行

### 拆分原則
1. **按功能拆分**: 將不同功能拆成獨立元件
2. **抽取 Hooks**: 將狀態邏輯和副作用抽取到自定義 hooks
3. **抽取工具函數**: 將資料處理邏輯抽取到 utils
4. **使用組合**: 用小元件組合成大元件

---

## 🎯 重構優先順序

### 第一階段（高優先級）⭐⭐⭐
1. **MedicalChat.tsx** - 最常用，影響最大
2. **VisitHistoryCard.tsx** - 最大的元件
3. **ReportsCard.tsx** - 複雜度高
4. **DataSelectionPanel.tsx** - 核心功能

### 第二階段（中優先級）⭐⭐
5. **MedListCard.tsx**
6. **ClinicalInsights Feature.tsx**

### 第三階段（低優先級）⭐
7. **ApiKeyField.tsx** - 可選

---

## 💡 重構範例：MedicalChat.tsx

### 重構前 (536 行)
```typescript
export function MedicalChat() {
  // 20+ useState
  // 10+ useEffect
  // 複雜的事件處理
  // 語音錄製邏輯
  // API 調用邏輯
  // UI 渲染邏輯
  // ... 500+ 行
}
```

### 重構後 (主元件 ~150 行)
```typescript
// MedicalChat.tsx
export function MedicalChat() {
  const chatState = useChatMessages()
  const voiceRecording = useVoiceRecording()
  const template = useTemplateSelector()
  
  return (
    <Card>
      <ChatHeader />
      <ChatMessageList messages={chatState.messages} />
      <ChatInput 
        onSend={chatState.sendMessage}
        template={template.selected}
      />
      <VoiceRecorder 
        onTranscript={chatState.addTranscript}
        {...voiceRecording}
      />
    </Card>
  )
}

// hooks/useChatMessages.ts (50-80 行)
export function useChatMessages() {
  // 聊天訊息管理邏輯
}

// hooks/useVoiceRecording.ts (50-80 行)
export function useVoiceRecording() {
  // 語音錄製邏輯
}

// components/ChatInput.tsx (80-100 行)
export function ChatInput({ onSend, template }) {
  // 輸入框邏輯
}

// components/VoiceRecorder.tsx (80-100 行)
export function VoiceRecorder({ onTranscript }) {
  // 語音錄製 UI
}
```

---

## ✅ 重構效益

### 可維護性 ⬆️
- 更容易理解和修改
- 更容易找到 bug
- 更容易測試

### 可重用性 ⬆️
- 小元件可在其他地方重用
- Hooks 可跨元件共用

### 可讀性 ⬆️
- 程式碼更清晰
- 職責更明確
- 減少認知負擔

### 可測試性 ⬆️
- 小元件更容易測試
- Hooks 可獨立測試
- 減少測試複雜度

---

## 🚀 建議執行步驟

### 1. 先重構最常用的元件
從 **MedicalChat.tsx** 開始，因為它是使用者最常互動的元件。

### 2. 逐步拆分
不要一次重構太多，每次重構一個元件，確保功能正常後再繼續。

### 3. 保持測試
每次重構後都要測試功能是否正常。

### 4. 提交版本控制
每完成一個元件的重構就提交，方便回滾。

---

## 📝 總結

**需要重構的元件**: 6 個大型元件 (>300 行)  
**建議重構優先級**: 
- 🔴 高優先級: 4 個
- 🟡 中優先級: 2 個
- 🟢 低優先級: 1 個

**重構後預期**:
- 元件平均大小: 100-150 行
- 提高可維護性: 50%+
- 提高可測試性: 70%+
- 符合 Clean Code 原則: ✅

**要開始重構嗎？我可以幫你從 MedicalChat.tsx 開始！** 🚀
