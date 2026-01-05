# 右側 Panel 功能開發指南

本文件說明如何在右側 Panel 新增、替換或移除功能。

## 架構概覽

```
src/
├── shared/config/
│   └── right-panel-registry.ts    # 功能註冊表
├── layouts/
│   └── RightPanelLayout.tsx       # Panel 佈局（通常不需修改）
features/
├── your-feature/                   # 你的新功能
│   ├── Feature.tsx                # 主要元件
│   ├── components/                # 子元件
│   └── hooks/                     # 自訂 hooks
```

## 新增功能步驟

### 1. 建立功能資料夾

```bash
mkdir -p features/your-feature/components
mkdir -p features/your-feature/hooks
```

### 2. 建立主要元件

```tsx
// features/your-feature/Feature.tsx
"use client"

import { useLanguage } from "@/src/application/providers/language.provider"

export default function YourFeature() {
  const { t } = useLanguage()
  
  return (
    <div className="h-full p-4">
      <h2 className="text-xl font-bold">Your Feature</h2>
      {/* 你的功能內容 */}
    </div>
  )
}
```

### 3. 在 Registry 註冊功能

編輯 `src/shared/config/right-panel-registry.ts`：

```tsx
// 新增到 RIGHT_PANEL_FEATURES 陣列
{
  id: 'your-feature',
  name: 'Your Feature',
  tabLabel: 'yourFeature',  // i18n key 或直接字串
  component: () => null,     // 會在 Layout 中映射
  order: 4,                  // 顯示順序
  enabled: true,
  contentClassName: 'flex-1 mt-4',
},
```

### 4. 在 Layout 中映射元件

編輯 `src/layouts/RightPanelLayout.tsx`：

```tsx
// 1. Import 你的元件
import YourFeature from "@/features/your-feature/Feature"

// 2. 加入 FEATURE_COMPONENTS
const FEATURE_COMPONENTS: Record<string, ComponentType> = {
  'medical-chat': MedicalChatFeature,
  'data-selection': DataSelectionFeature,
  'clinical-insights': ClinicalInsightsFeature,
  'settings': SettingsFeature,
  'your-feature': YourFeature,  // 新增這行
}
```

### 5. 新增翻譯（可選）

編輯 `src/shared/i18n/translations.ts`：

```tsx
tabs: {
  // ...existing tabs
  yourFeature: '你的功能',
}
```

## 替換現有功能

如果你想替換現有功能（例如替換 medical-chat）：

### 方法 1：直接替換元件

```tsx
// 在 FEATURE_COMPONENTS 中替換
const FEATURE_COMPONENTS: Record<string, ComponentType> = {
  'medical-chat': YourNewChatFeature,  // 替換這行
  // ...
}
```

### 方法 2：停用舊功能，新增新功能

```tsx
// 在 right-panel-registry.ts 中
{
  id: 'medical-chat',
  enabled: false,  // 停用舊功能
  // ...
},
{
  id: 'your-new-chat',
  enabled: true,   // 啟用新功能
  order: 0,
  // ...
},
```

## 移除功能

在 `right-panel-registry.ts` 中設定 `enabled: false`：

```tsx
{
  id: 'settings',
  enabled: false,  // 停用此功能
  // ...
},
```

## 使用臨床資料

如果你的功能需要存取臨床資料：

```tsx
import { useClinicalData } from "@/src/application/providers/clinical-data.provider"

export default function YourFeature() {
  const clinicalData = useClinicalData()
  
  // 可用資料：
  // - clinicalData.patient
  // - clinicalData.conditions (診斷)
  // - clinicalData.medications (藥物)
  // - clinicalData.allergies (過敏)
  // - clinicalData.observations (檢驗結果)
  // - clinicalData.procedures (處置)
  // - clinicalData.encounters (就診紀錄)
  // - clinicalData.vitalSigns (生命徵象)
  
  return (...)
}
```

## 新增自訂 Provider

如果你的功能需要自己的狀態管理：

### 1. 建立 Provider

```tsx
// src/application/providers/your-feature.provider.tsx
"use client"

import { createContext, useContext, useState, ReactNode } from 'react'

interface YourFeatureContextType {
  // 你的狀態
}

const YourFeatureContext = createContext<YourFeatureContextType | null>(null)

export function YourFeatureProvider({ children }: { children: ReactNode }) {
  // 你的狀態邏輯
  return (
    <YourFeatureContext.Provider value={...}>
      {children}
    </YourFeatureContext.Provider>
  )
}

export function useYourFeature() {
  const context = useContext(YourFeatureContext)
  if (!context) throw new Error('useYourFeature must be used within YourFeatureProvider')
  return context
}
```

### 2. 加入 RightPanelProviders

編輯 `src/layouts/RightPanelLayout.tsx`：

```tsx
import { YourFeatureProvider } from "@/src/application/providers/your-feature.provider"

function RightPanelProviders({ children }: { children: ReactNode }) {
  return (
    <DataSelectionProvider>
      <YourFeatureProvider>  {/* 新增這行 */}
        {/* ...existing providers */}
      </YourFeatureProvider>
    </DataSelectionProvider>
  )
}
```

## 完整範例

參考現有功能的實作：

- **簡單功能**: `features/settings/Feature.tsx`
- **使用臨床資料**: `features/data-selection/Feature.tsx`
- **複雜功能（含 AI）**: `features/medical-chat/Feature.tsx`
- **分析功能**: `features/clinical-insights/Feature.tsx`

## 注意事項

1. **保持獨立性**: 功能應該自包含，避免直接依賴其他功能
2. **使用 Provider**: 透過 Provider 共享狀態，而非 props drilling
3. **支援 i18n**: 使用 `useLanguage()` hook 支援多語言
4. **響應式設計**: 確保在不同螢幕尺寸下正常顯示
5. **錯誤處理**: 加入適當的 loading 和 error 狀態
