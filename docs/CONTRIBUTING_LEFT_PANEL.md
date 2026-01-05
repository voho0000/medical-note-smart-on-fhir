# 左側 Panel 功能開發指南

本文件說明如何在左側 Panel（臨床摘要）新增、替換或移除功能。

## 架構概覽

```
src/
├── shared/config/
│   └── feature-registry.ts        # Tab 和功能註冊表
├── layouts/
│   └── LeftPanelLayout.tsx        # Panel 佈局（通常不需修改）
features/
├── clinical-summary/
│   ├── patient-info/              # 病患資訊
│   ├── vitals/                    # 生命徵象
│   ├── diagnosis/                 # 診斷
│   ├── medications/               # 藥物
│   ├── allergies/                 # 過敏
│   ├── reports/                   # 報告
│   ├── visit-history/             # 就診紀錄
│   └── your-feature/              # 你的新功能
```

## 新增功能步驟

### 1. 建立功能資料夾

```bash
mkdir -p features/clinical-summary/your-feature
```

### 2. 建立功能元件

```tsx
// features/clinical-summary/your-feature/YourFeatureCard.tsx
"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useClinicalData } from "@/src/application/providers/clinical-data.provider"
import { useLanguage } from "@/src/application/providers/language.provider"

export function YourFeatureCard() {
  const { t } = useLanguage()
  const clinicalData = useClinicalData()
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Your Feature</CardTitle>
      </CardHeader>
      <CardContent>
        {/* 你的功能內容 */}
      </CardContent>
    </Card>
  )
}
```

### 3. 在 Registry 註冊功能

編輯 `src/shared/config/feature-registry.ts`：

```tsx
// 1. Import 你的元件
import { YourFeatureCard } from '@/features/clinical-summary/your-feature/YourFeatureCard'

// 2. 新增到 CLINICAL_SUMMARY_FEATURES 陣列
{
  id: 'your-feature',
  name: 'Your Feature',
  component: YourFeatureCard,
  tab: 'patient',      // 指定屬於哪個 tab
  order: 3,            // 在該 tab 中的顯示順序
  enabled: true,
},
```

完成！不需要修改 `LeftPanelLayout.tsx`。

## 新增 Tab 步驟

如果你想新增一個全新的 Tab：

### 1. 在 Registry 新增 Tab 配置

```tsx
// 在 LEFT_PANEL_TABS 陣列中新增
{ id: 'my-tab', labelKey: 'myTab', order: 4, enabled: true },
```

### 2. 新增翻譯

編輯 `src/shared/i18n/translations.ts`：

```tsx
tabs: {
  // ...existing tabs
  myTab: '我的分頁',
}
```

### 3. 新增功能到該 Tab

```tsx
{
  id: 'my-feature',
  name: 'My Feature',
  component: MyFeatureCard,
  tab: 'my-tab',       // 指定到新的 tab
  order: 0,
  enabled: true,
},
```

## 替換現有功能

### 方法 1：直接替換元件

```tsx
// 在 CLINICAL_SUMMARY_FEATURES 中找到要替換的功能
{
  id: 'patient-info',
  component: YourNewPatientInfoCard,  // 替換元件
  // ...
},
```

### 方法 2：停用舊功能，新增新功能

```tsx
// 停用舊功能
{
  id: 'patient-info',
  enabled: false,
  // ...
},
// 新增新功能
{
  id: 'my-patient-info',
  component: MyPatientInfoCard,
  tab: 'patient',
  order: 0,
  enabled: true,
},
```

## 移除功能

在 `feature-registry.ts` 中設定 `enabled: false`：

```tsx
{
  id: 'vitals',
  enabled: false,  // 停用此功能
  // ...
},
```

## 移除 Tab

在 `LEFT_PANEL_TABS` 中設定 `enabled: false`：

```tsx
{ id: 'visits', labelKey: 'visits', order: 3, enabled: false },
```

## 使用臨床資料

所有左側 Panel 功能都可以存取臨床資料：

```tsx
import { useClinicalData } from "@/src/application/providers/clinical-data.provider"
import { usePatient } from "@/src/application/providers/patient.provider"

export function YourFeatureCard() {
  const patient = usePatient()
  const clinicalData = useClinicalData()
  
  // 可用資料：
  // - patient (病患基本資料)
  // - clinicalData.conditions (診斷)
  // - clinicalData.medications (藥物)
  // - clinicalData.allergies (過敏)
  // - clinicalData.observations (檢驗結果)
  // - clinicalData.procedures (處置)
  // - clinicalData.encounters (就診紀錄)
  // - clinicalData.vitalSigns (生命徵象)
  // - clinicalData.diagnosticReports (診斷報告)
  
  return (...)
}
```

## 調整功能順序

修改 `order` 值來調整顯示順序（數字越小越前面）：

```tsx
// Patient Tab 中的順序
{ id: 'patient-info', tab: 'patient', order: 0 },  // 第一個
{ id: 'vitals', tab: 'patient', order: 1 },        // 第二個
{ id: 'diagnosis', tab: 'patient', order: 2 },     // 第三個
{ id: 'your-feature', tab: 'patient', order: 3 },  // 第四個
```

## 調整 Tab 順序

修改 `LEFT_PANEL_TABS` 中的 `order` 值：

```tsx
{ id: 'patient', order: 0 },   // 第一個 Tab
{ id: 'reports', order: 1 },   // 第二個 Tab
{ id: 'meds', order: 2 },      // 第三個 Tab
{ id: 'visits', order: 3 },    // 第四個 Tab
```

## 完整範例

參考現有功能的實作：

- **簡單卡片**: `features/clinical-summary/patient-info/PatientInfoCard.tsx`
- **列表顯示**: `features/clinical-summary/medications/MedListCard.tsx`
- **複雜報告**: `features/clinical-summary/reports/ReportsCard.tsx`
- **就診紀錄**: `features/clinical-summary/visit-history/VisitHistoryCard.tsx`

## 注意事項

1. **使用 Card 元件**: 保持 UI 一致性，使用 `@/components/ui/card`
2. **支援 i18n**: 使用 `useLanguage()` hook 支援多語言
3. **處理 Loading**: 檢查 `clinicalData.isLoading` 狀態
4. **處理空資料**: 當沒有資料時顯示適當的提示
5. **響應式設計**: 確保在不同螢幕尺寸下正常顯示
