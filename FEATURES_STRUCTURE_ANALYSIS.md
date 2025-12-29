# 🔍 Features 目錄結構分析

## 📊 當前結構（不一致）

```
features/
├── clinical-insights/
│   ├── components/
│   ├── context/              ✅ 有 context
│   └── Feature.tsx
│
├── clinical-summary/
│   ├── components/
│   └── Feature.tsx           ✅ 簡單結構
│
├── data-selection/
│   ├── components/
│   ├── hooks/                ❌ 有 hooks（應該移到 src/application/）
│   └── Feature.tsx
│
├── medical-chat/
│   ├── components/
│   ├── context/              ✅ 有 context
│   └── Feature.tsx
│
├── right-panel/
│   ├── components/
│   ├── providers/            ❌ 有 providers（應該是空的？）
│   └── Feature.tsx
│
├── settings/
│   ├── components/
│   └── Feature.tsx           ✅ 簡單結構
│
└── shared/                   ❌ 空目錄（應該刪除）
```

---

## 🎯 問題分析

### 1. **data-selection/hooks/** ❌
**問題**: 
- `useClinicalContext.ts` 在這裡
- 這個 hook 被多個地方使用，應該在 `src/application/hooks/`

**引用位置**:
- `features/medical-chat/components/MedicalChat.tsx`
- `features/clinical-insights/Feature.tsx`

### 2. **right-panel/providers/** ❌
**問題**: 
- 這個目錄可能是空的或包含不應該在這裡的檔案
- Providers 應該在 `src/application/providers/`

### 3. **features/shared/** ❌
**問題**: 
- 空目錄
- 應該刪除

### 4. **context/ 目錄不一致** ⚠️
**有 context/**:
- `clinical-insights/context/` - ClinicalInsightsConfigContext
- `medical-chat/context/` - PromptTemplatesContext

**沒有 context/**:
- `clinical-summary/`
- `data-selection/`
- `settings/`
- `right-panel/`

---

## 💡 統一結構建議

### 方案 A: 最簡化結構（推薦）✅

```
features/[feature-name]/
├── components/          # UI 元件（必須）
├── context/            # Feature-specific Context（可選，只在需要時）
└── Feature.tsx         # Feature 入口（必須）
```

**規則**:
1. **components/** - 必須，放所有 UI 元件
2. **context/** - 可選，只在該 feature 需要內部狀態管理時使用
3. **Feature.tsx** - 必須，feature 入口
4. **❌ 不應該有**: hooks/, providers/, utils/ 等（這些應該在 src/ 下）

---

## 🔧 需要的改進

### 1. 移動 `data-selection/hooks/useClinicalContext.ts` ✅
**從**: `features/data-selection/hooks/useClinicalContext.ts`  
**到**: `src/application/hooks/use-clinical-context.hook.ts`

**原因**: 這是跨 feature 使用的 hook，應該在 Application Layer

### 2. 檢查並清理 `right-panel/providers/` ✅
- 如果是空的，刪除
- 如果有檔案，移到 `src/application/providers/`

### 3. 刪除 `features/shared/` ✅
- 空目錄，應該刪除

### 4. 保持 context/ 目錄（合理）✅
**保留**:
- `clinical-insights/context/` - 該 feature 的配置狀態
- `medical-chat/context/` - 該 feature 的模板狀態

**原因**: 這些是 feature-specific 的狀態，不是全域狀態

---

## 📁 統一後的結構

```
features/
├── clinical-insights/
│   ├── components/
│   ├── context/              ✅ Feature-specific 狀態
│   │   └── ClinicalInsightsConfigContext.tsx
│   └── Feature.tsx
│
├── clinical-summary/
│   ├── components/
│   └── Feature.tsx
│
├── data-selection/
│   ├── components/
│   └── Feature.tsx           ✅ hooks/ 已移除
│
├── medical-chat/
│   ├── components/
│   ├── context/              ✅ Feature-specific 狀態
│   │   └── PromptTemplatesContext.tsx
│   └── Feature.tsx
│
├── right-panel/
│   ├── components/
│   └── Feature.tsx           ✅ providers/ 已移除
│
└── settings/
    ├── components/
    └── Feature.tsx
```

---

## 🎯 統一規則

### Features 目錄應該包含：
✅ **components/** - UI 元件  
✅ **context/** - Feature-specific Context（可選）  
✅ **Feature.tsx** - Feature 入口

### Features 目錄不應該包含：
❌ **hooks/** - 應該在 `src/application/hooks/`  
❌ **providers/** - 應該在 `src/application/providers/`  
❌ **utils/** - 應該在 `src/shared/utils/`  
❌ **constants/** - 應該在 `src/shared/constants/`  
❌ **types/** - 應該在 `src/core/entities/`

---

## 🔄 Context vs Provider 的區別

### Context（可以在 features/）
- Feature-specific 的狀態管理
- 只在該 feature 內部使用
- 例如：PromptTemplatesContext, ClinicalInsightsConfigContext

### Provider（應該在 src/application/providers/）
- 跨 feature 的全域狀態
- 被多個 features 使用
- 例如：PatientProvider, ClinicalDataProvider, NoteProvider

---

## ✅ 執行計劃

1. ✅ 移動 `data-selection/hooks/useClinicalContext.ts` 到 `src/application/hooks/`
2. ✅ 更新所有引用該 hook 的檔案
3. ✅ 刪除 `data-selection/hooks/` 目錄
4. ✅ 檢查並清理 `right-panel/providers/`
5. ✅ 刪除 `features/shared/` 目錄
6. ✅ 更新文件說明統一的結構規則

---

## 📝 統一後的好處

1. **清晰的職責分離**
   - Features 只包含 UI 和 feature-specific 狀態
   - 共用邏輯在 src/ 下

2. **易於理解**
   - 所有 features 結構一致
   - 新開發者容易上手

3. **符合 Clean Architecture**
   - Presentation Layer 只包含 UI
   - Application Layer 包含共用邏輯

4. **避免循環依賴**
   - Features 之間不互相依賴
   - 都依賴 src/ 下的共用層
