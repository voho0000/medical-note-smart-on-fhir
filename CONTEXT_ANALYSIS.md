# 🔍 Context 目錄統一分析

## 📊 當前狀況

### 有 context/ 的 features：
1. **clinical-insights/context/**
   - `ClinicalInsightsConfigContext.tsx`
   - 被 3 個地方使用

2. **medical-chat/context/**
   - `PromptTemplatesContext.tsx`
   - 被 3 個地方使用

### 沒有 context/ 的 features：
- clinical-summary
- data-selection
- right-panel
- settings

---

## 🤔 分析：這些 Context 應該在哪裡？

### ClinicalInsightsConfigContext
**使用位置**:
- `features/clinical-insights/Feature.tsx` ✅ 自己的 feature
- `features/right-panel/Feature.tsx` ⚠️ 跨 feature
- `features/settings/components/ClinicalInsightsSettings.tsx` ⚠️ 跨 feature

**結論**: 被多個 features 使用 → **應該移到 `src/application/providers/`**

### PromptTemplatesContext
**使用位置**:
- `features/medical-chat/components/MedicalChat.tsx` ✅ 自己的 feature
- `features/right-panel/Feature.tsx` ⚠️ 跨 feature
- `features/settings/components/PromptTemplatesSettings.tsx` ⚠️ 跨 feature

**結論**: 被多個 features 使用 → **應該移到 `src/application/providers/`**

---

## 💡 統一方案

### 方案 A: 移除所有 context/ 目錄（推薦）✅

**理由**:
1. 這兩個 Context 都被跨 feature 使用
2. 應該移到 `src/application/providers/`
3. 統一後所有 features 結構完全一致

**結果**:
```
features/[feature-name]/
├── components/
└── Feature.tsx
```

**優點**:
- ✅ 完全統一，沒有例外
- ✅ 符合 Clean Architecture（跨 feature 的狀態在 Application Layer）
- ✅ 結構最簡單
- ✅ 易於理解

---

### 方案 B: 保留 context/，但只放真正 feature-specific 的

**理由**:
- 如果未來有真正只在單一 feature 內使用的狀態
- 可以保留 context/ 目錄結構

**問題**:
- ❌ 目前這兩個 Context 都不是 feature-specific 的
- ❌ 需要先移動現有的 Context
- ❌ 結構不統一（有些有，有些沒有）

---

## 🎯 建議：採用方案 A

### 執行步驟：

1. **移動 ClinicalInsightsConfigContext**
   - 從: `features/clinical-insights/context/ClinicalInsightsConfigContext.tsx`
   - 到: `src/application/providers/clinical-insights-config.provider.tsx`

2. **移動 PromptTemplatesContext**
   - 從: `features/medical-chat/context/PromptTemplatesContext.tsx`
   - 到: `src/application/providers/prompt-templates.provider.tsx`

3. **更新所有引用** (6 個檔案)
   - clinical-insights/Feature.tsx
   - right-panel/Feature.tsx
   - settings/components/ClinicalInsightsSettings.tsx
   - medical-chat/components/MedicalChat.tsx
   - settings/components/PromptTemplatesSettings.tsx

4. **刪除空的 context/ 目錄**
   - features/clinical-insights/context/
   - features/medical-chat/context/

---

## ✅ 統一後的結構

```
features/
├── clinical-insights/
│   ├── components/
│   └── Feature.tsx
│
├── clinical-summary/
│   ├── components/
│   └── Feature.tsx
│
├── data-selection/
│   ├── components/
│   └── Feature.tsx
│
├── medical-chat/
│   ├── components/
│   └── Feature.tsx
│
├── right-panel/
│   ├── components/
│   └── Feature.tsx
│
└── settings/
    ├── components/
    └── Feature.tsx
```

**完全統一！所有 features 結構完全相同！** ✅

---

## 📝 命名規範

移到 `src/application/providers/` 後的命名：

| 舊名稱 | 新名稱 |
|--------|--------|
| `ClinicalInsightsConfigContext.tsx` | `clinical-insights-config.provider.tsx` |
| `PromptTemplatesContext.tsx` | `prompt-templates.provider.tsx` |

**Export 名稱保持不變**:
- `useClinicalInsightsConfig`
- `ClinicalInsightsConfigProvider`
- `usePromptTemplates`
- `PromptTemplatesProvider`

---

## 🎉 統一的好處

1. **完全一致的結構**
   - 所有 features 都是 `components/ + Feature.tsx`
   - 沒有例外，沒有特殊情況

2. **符合 Clean Architecture**
   - 跨 feature 的狀態在 Application Layer
   - Features 只包含 UI

3. **易於理解和維護**
   - 新開發者一看就懂
   - 不需要記住哪些 feature 有 context

4. **避免混淆**
   - 清楚區分 feature-specific 和跨 feature 的狀態
   - Provider 都在同一個地方

---

## 🚀 執行？

要我執行方案 A，將所有 context 移到 `src/application/providers/` 並統一所有 features 結構嗎？
