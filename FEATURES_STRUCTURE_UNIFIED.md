# ✅ Features 目錄結構已統一

## 🎯 統一完成

所有 features 現在都遵循一致的結構規則。

---

## 📁 統一後的結構

```
features/
├── clinical-insights/
│   ├── components/           ✅ UI 元件
│   ├── context/             ✅ Feature-specific 狀態
│   │   └── ClinicalInsightsConfigContext.tsx
│   └── Feature.tsx          ✅ Feature 入口
│
├── clinical-summary/
│   ├── components/           ✅ UI 元件
│   └── Feature.tsx          ✅ Feature 入口
│
├── data-selection/
│   ├── components/           ✅ UI 元件
│   └── Feature.tsx          ✅ Feature 入口
│
├── medical-chat/
│   ├── components/           ✅ UI 元件
│   ├── context/             ✅ Feature-specific 狀態
│   │   └── PromptTemplatesContext.tsx
│   └── Feature.tsx          ✅ Feature 入口
│
├── right-panel/
│   ├── components/           ✅ UI 元件
│   └── Feature.tsx          ✅ Feature 入口
│
└── settings/
    ├── components/           ✅ UI 元件
    │   ├── ApiKeyField.tsx
    │   ├── PromptTemplatesSettings.tsx
    │   └── ClinicalInsightsSettings.tsx
    └── Feature.tsx          ✅ Feature 入口
```

---

## 🔧 完成的改進

### 1. **移動 useClinicalContext** ✅
**從**: `features/data-selection/hooks/useClinicalContext.ts`  
**到**: `src/application/hooks/use-clinical-context.hook.ts`

**原因**: 這是跨 feature 使用的 hook，應該在 Application Layer

**已更新引用**:
- ✅ `features/medical-chat/components/MedicalChat.tsx`
- ✅ `features/clinical-insights/Feature.tsx`

### 2. **刪除空目錄** ✅
- ❌ `features/data-selection/hooks/` - 已刪除
- ❌ `features/right-panel/providers/` - 已刪除
- ❌ `features/shared/` - 已刪除

### 3. **保留 context/ 目錄** ✅
**保留原因**: 這些是 feature-specific 的狀態管理

- ✅ `clinical-insights/context/` - ClinicalInsightsConfigContext
- ✅ `medical-chat/context/` - PromptTemplatesContext

---

## 📋 統一的結構規則

### Features 目錄標準結構：

```
features/[feature-name]/
├── components/          # UI 元件（必須）
├── context/            # Feature-specific Context（可選）
└── Feature.tsx         # Feature 入口（必須）
```

### 規則說明：

#### ✅ 應該包含：
1. **components/** - 必須，放所有 UI 元件
2. **context/** - 可選，只在該 feature 需要內部狀態管理時使用
3. **Feature.tsx** - 必須，feature 入口

#### ❌ 不應該包含：
1. **hooks/** - 應該在 `src/application/hooks/`
2. **providers/** - 應該在 `src/application/providers/`
3. **utils/** - 應該在 `src/shared/utils/`
4. **constants/** - 應該在 `src/shared/constants/`
5. **types/** - 應該在 `src/core/entities/`

---

## 🎯 Context vs Provider 的區別

### Context（可以在 features/）
- **用途**: Feature-specific 的狀態管理
- **範圍**: 只在該 feature 內部使用
- **例子**: 
  - `PromptTemplatesContext` - 管理 medical-chat 的模板
  - `ClinicalInsightsConfigContext` - 管理 clinical-insights 的配置

### Provider（應該在 src/application/providers/）
- **用途**: 跨 feature 的全域狀態
- **範圍**: 被多個 features 使用
- **例子**:
  - `PatientProvider` - 全域的病人資料
  - `ClinicalDataProvider` - 全域的臨床資料
  - `NoteProvider` - 全域的筆記狀態

---

## 📊 統一前後對比

### 統一前 ❌
```
features/
├── data-selection/
│   ├── hooks/              ❌ 不一致
│   └── ...
├── right-panel/
│   ├── providers/          ❌ 不一致
│   └── ...
└── shared/                 ❌ 空目錄
```

### 統一後 ✅
```
features/
├── data-selection/
│   ├── components/         ✅ 一致
│   └── Feature.tsx         ✅ 一致
├── right-panel/
│   ├── components/         ✅ 一致
│   └── Feature.tsx         ✅ 一致
└── (shared 已刪除)         ✅ 清理完成
```

---

## 🎉 統一的好處

### 1. **清晰的職責分離**
- Features 只包含 UI 和 feature-specific 狀態
- 共用邏輯在 `src/` 下

### 2. **易於理解**
- 所有 features 結構一致
- 新開發者容易上手
- 減少認知負擔

### 3. **符合 Clean Architecture**
- Presentation Layer 只包含 UI
- Application Layer 包含共用邏輯
- 依賴方向正確

### 4. **避免循環依賴**
- Features 之間不互相依賴
- 都依賴 `src/` 下的共用層
- 依賴圖清晰

---

## 📝 開發指南

### 新增 Feature 時：

1. **建立基本結構**
   ```bash
   mkdir -p features/new-feature/components
   touch features/new-feature/Feature.tsx
   ```

2. **如果需要 feature-specific 狀態**
   ```bash
   mkdir features/new-feature/context
   ```

3. **不要建立**
   - ❌ hooks/ 目錄
   - ❌ providers/ 目錄
   - ❌ utils/ 目錄

### 共用邏輯放置位置：

- **Hooks** → `src/application/hooks/`
- **Providers** → `src/application/providers/`
- **Constants** → `src/shared/constants/`
- **Utils** → `src/shared/utils/`
- **Types** → `src/core/entities/`

---

## ✅ 驗證清單

- ✅ 所有 features 都有 `components/` 目錄
- ✅ 所有 features 都有 `Feature.tsx`
- ✅ 只有需要的 features 有 `context/` 目錄
- ✅ 沒有 features 有 `hooks/` 目錄
- ✅ 沒有 features 有 `providers/` 目錄
- ✅ 沒有空目錄
- ✅ 所有 import 路徑正確

---

## 🎯 總結

**Features 目錄結構已完全統一！**

- ✅ 結構一致
- ✅ 職責清晰
- ✅ 符合 Clean Architecture
- ✅ 易於維護

**現在所有 features 都遵循相同的組織原則。** 🎉
