# 🔍 medical-note Feature 架構分析

## 📊 當前狀態

### features/medical-note/ 目錄結構
```
features/medical-note/
├── Feature.tsx
├── components/
│   ├── AsrPanel.tsx
│   ├── GptPanel.tsx
│   └── PromptEditor.tsx
├── context/
│   ├── AsrContext.tsx
│   └── GptResponseContext.tsx
└── providers/
    └── NoteProvider.tsx
```

---

## 🎯 元件使用分析

### 1. **NoteProvider** - 被多處使用 ✅
**引用位置**:
- `features/medical-chat/components/MedicalChat.tsx`
- `features/right-panel/Feature.tsx`
- `features/clinical-insights/Feature.tsx`
- `features/settings/components/ApiKeyField.tsx`

**用途**: 管理筆記相關狀態（ASR 文字、提示、GPT 回應、模型選擇、聊天訊息）

**結論**: **需要保留** - 這是跨 feature 共用的狀態管理

---

### 2. **AsrContext** - 被多處使用 ✅
**引用位置**:
- `features/medical-chat/components/MedicalChat.tsx`
- `features/right-panel/Feature.tsx`
- `features/medical-note/components/AsrPanel.tsx`

**用途**: 管理語音轉文字狀態

**結論**: **需要保留** - 跨 feature 共用

---

### 3. **GptResponseContext** - 被多處使用 ✅
**引用位置**:
- `features/right-panel/Feature.tsx`
- `features/medical-note/components/GptPanel.tsx`

**用途**: 管理 GPT 回應狀態

**結論**: **需要保留** - 跨 feature 共用

---

### 4. **AsrPanel.tsx** - 只在 Feature.tsx 使用 ✅
**引用位置**:
- `features/medical-note/Feature.tsx` (動態載入)

**用途**: 語音輸入面板 UI

**結論**: **保留在 medical-note** - 這是該 feature 的 UI

---

### 5. **GptPanel.tsx** - 只在 Feature.tsx 使用 ✅
**引用位置**:
- `features/medical-note/Feature.tsx`

**用途**: GPT 回應顯示面板 UI

**結論**: **保留在 medical-note** - 這是該 feature 的 UI

---

### 6. **PromptEditor.tsx** - 只在 Feature.tsx 使用 ✅
**引用位置**:
- `features/medical-note/Feature.tsx`

**用途**: 提示編輯器 UI

**結論**: **保留在 medical-note** - 這是該 feature 的 UI

---

### 7. **ApiKeyField.tsx** - 只在 settings 使用 ✅
**引用位置**:
- `features/settings/Feature.tsx`

**用途**: API Key 設定 UI

**結論**: **已移到 features/settings/components/** ✅

---

## 🤔 問題：medical-note 的定位

### 問題分析
`features/medical-note/` 目前的情況：
- ✅ 有自己的 UI 元件（AsrPanel, GptPanel, PromptEditor）
- ✅ 有自己的 Feature.tsx 入口
- ✅ 提供跨 feature 共用的 Context 和 Provider
- ❓ 但名稱 "medical-note" 不太清楚其用途

### 兩種選擇

#### 選擇 A: 保留 medical-note feature ✅
**理由**:
- 它有自己的 UI 元件和功能
- 它提供共用的狀態管理（NoteProvider, AsrContext, GptResponseContext）
- 符合 feature 的定義

**建議重新命名**:
- `features/medical-note/` → `features/note-editor/` 或 `features/voice-note/`
- 更清楚地表達其功能

#### 選擇 B: 拆分 medical-note ❌
**如果拆分**:
1. UI 元件保留在 `features/note-editor/`
2. 共用的 Context/Provider 移到 `src/application/providers/`

**問題**:
- NoteProvider 包含 feature-specific 的狀態（prompt, gptResponse）
- 不適合放在 application layer

---

## 💡 建議方案

### 方案 1: 保持現狀（推薦）✅
```
features/medical-note/          # 或重新命名為 note-editor
├── Feature.tsx                 # 筆記編輯器入口
├── components/                 # UI 元件
│   ├── AsrPanel.tsx
│   ├── GptPanel.tsx
│   └── PromptEditor.tsx
├── context/                    # Feature-specific Context
│   ├── AsrContext.tsx
│   └── GptResponseContext.tsx
└── providers/                  # Feature-specific Provider
    └── NoteProvider.tsx
```

**優點**:
- 符合 Clean Architecture 的 Presentation Layer
- Context 和 Provider 是 feature-specific 的
- 結構清晰，易於維護

---

### 方案 2: 重新命名（可選）
將 `features/medical-note/` 重新命名為更清楚的名稱：
- `features/note-editor/` - 如果主要是編輯功能
- `features/voice-note/` - 如果強調語音功能
- `features/clinical-note/` - 如果強調臨床筆記

---

## ✅ 結論

**medical-note feature 應該保留**，因為：

1. ✅ 它有自己的 UI 元件和功能
2. ✅ 它提供的 Context/Provider 是 feature-specific 的
3. ✅ 符合 Clean Architecture 的 Presentation Layer
4. ✅ 其他 features 依賴它的狀態管理

**已完成的改進**:
- ✅ ApiKeyField 已移到 settings
- ✅ models.ts 已移到 shared/constants

**建議**:
- 可考慮重新命名為更清楚的名稱
- 保持當前的結構

---

**medical-note 不是「舊內容」，它是正確的 Presentation Layer！** ✅
