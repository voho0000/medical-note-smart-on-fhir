# Feature 模組架構指南

## 📋 概述

本專案採用 **Feature-based Organization**（功能導向組織），每個功能模組都是獨立、可插拔的單元。每個 feature 都有一個 **Barrel File** (`index.ts`) 定義其公開 API，強制執行封裝並防止功能間的耦合。

---

## 🏗️ 架構規則

### ✅ 正確做法：從 feature 的公開 API 匯入

```typescript
// ✅ 正確 - 使用 barrel file
import { MedicalChatFeature } from '@/features/medical-chat'
import { ClinicalInsightsFeature } from '@/features/clinical-insights'
import { AllergiesCard, VitalsCard } from '@/features/clinical-summary'
import { AuthDialog, useAuthDialog } from '@/features/auth'
```

### ❌ 錯誤做法：匯入內部實作

```typescript
// ❌ 錯誤 - 不要直接存取內部檔案
import MedicalChat from '@/features/medical-chat/components/MedicalChat'
import { useStreamingChat } from '@/features/medical-chat/hooks/useStreamingChat'
```

### ❌ 錯誤做法：跨 feature 依賴

```typescript
// ❌ 錯誤 - Features 之間不應該相互依賴
import { SomeHook } from '@/features/other-feature/hooks/SomeHook'
```

---

## 📦 Feature 目錄

### 1. Auth（使用者認證）
**Entry Point:** `@/features/auth`

```typescript
import { 
  AuthDialog,
  AuthStatus,
  HeaderAuthButton,
  useAuthDialog 
} from '@/features/auth'

// Usage
<HeaderAuthButton />
<AuthDialog />
```

**功能**：
- Firebase Authentication 整合
- Google 登入
- Email/密碼登入
- Email 驗證
- 登入狀態管理

---

### 2. Chat History（對話歷史）
**Entry Point:** `@/features/chat-history`

```typescript
import { ChatHistoryDrawer } from '@/features/chat-history'

// Usage
<ChatHistoryDrawer />
```

**功能**：
- 依病人分類儲存對話
- Firestore 雲端同步
- 對話搜尋和管理
- 繼續先前的對話

---

### 3. Medical Chat（AI 對話）
**Entry Point:** `@/features/medical-chat`

```typescript
import { MedicalChatFeature } from '@/features/medical-chat'

// Usage
<MedicalChatFeature />
```

**功能**：
- 一般模式：基本 AI 對話
- 深入模式：AI Agent with Tool Calling
- 支援 OpenAI、Gemini、Perplexity
- 語音錄製和轉錄
- 對話歷史整合

---

### 4. Clinical Insights（臨床洞察）
**Entry Point:** `@/features/clinical-insights`

```typescript
import { ClinicalInsightsFeature } from '@/features/clinical-insights'

// Usage
<ClinicalInsightsFeature />
```

**功能**：
- AI 生成臨床摘要
- 可自訂洞察標籤
- 安全警示（Safety Flag）
- 變化摘要（What's Changed）
- 臨床快照（Clinical Snapshot）

---

### 5. Data Selection（資料選擇）
**Entry Point:** `@/features/data-selection`

```typescript
import { DataSelectionFeature } from '@/features/data-selection'

// Usage
<DataSelectionFeature />
```

**功能**：
- 互動式資料選擇介面
- 篩選臨床資料
- 提供情境感知的 AI 回應

---

### 6. Prompt Gallery（提示範本庫）
**Entry Point:** `@/features/prompt-gallery`

```typescript
import { 
  PromptGalleryDialog,
  usePromptGallery 
} from '@/features/prompt-gallery'

// Usage
<PromptGalleryDialog />
```

**功能**：
- 瀏覽社群共享的提示範本
- 依類型、專科、標籤篩選
- 分享自己的提示範本
- 使用計數追蹤

---

### 7. Settings（設定）
**Entry Point:** `@/features/settings`

```typescript
import { SettingsFeature } from '@/features/settings'

// Usage
<SettingsFeature />
```

**功能**：
- AI 偏好設定（模型選擇、API 金鑰）
- 提示範本管理
- 臨床洞察標籤自訂
- 外觀設定（深色/亮色模式）

---

### 8. Clinical Summary（臨床摘要）
**Entry Point:** `@/features/clinical-summary`

**特殊說明**：此 feature 匯出多個卡片元件，支援靈活組合。

```typescript
import { 
  AllergiesCard,
  DiagnosesCard,
  MedListCard,
  PatientInfoCard,
  ReportsCard,
  VisitHistoryCard,
  VitalsCard
} from '@/features/clinical-summary'

// Usage - 依需求組合
<div>
  <PatientInfoCard />
  <VitalsCard />
  <MedListCard />
</div>
```

**可用卡片**：
- `AllergiesCard` - 過敏史
- `DiagnosesCard` - 診斷/病況
- `MedListCard` - 用藥清單
- `PatientInfoCard` - 病患基本資料
- `ReportsCard` - 診斷報告
- `VisitHistoryCard` - 就診紀錄
- `VitalsCard` - 生命徵象

---

## 🔗 依賴規則

### Features 可以依賴：

- ✅ `@/src/core/*` - 領域實體和用例
- ✅ `@/src/application/*` - 應用層 hooks 和 providers
- ✅ `@/src/infrastructure/*` - 基礎設施服務
- ✅ `@/src/shared/*` - 共用工具和元件
- ✅ `@/components/ui/*` - UI 元件庫（shadcn/ui）

### Features 不可以依賴：

- ❌ `@/features/*` - 其他 features（**絕對禁止**）

---

## 📁 內部結構

每個 feature 遵循以下結構：

```
features/
  feature-name/
    ├── index.ts              # 🚪 公開 API (Barrel File)
    ├── Feature.tsx           # 主要元件
    ├── components/           # 內部元件
    ├── hooks/                # 內部 hooks
    ├── services/             # 內部服務（如有）
    ├── utils/                # 內部工具函數
    └── types/                # 內部類型定義
```

**只有 `index.ts` 的匯出是公開的。** 其他所有內容都是內部實作。

---

## 🎯 優勢

1. **封裝性** - 內部變更不影響使用者
2. **清楚邊界** - 容易理解什麼是公開 vs 私有
3. **重構安全** - 可以重組內部結構而不破壞匯入
4. **防止耦合** - 強制 features 保持獨立
5. **更好的 Tree-shaking** - 打包工具可以優化未使用的程式碼
6. **可插拔** - 透過 Registry 輕鬆啟用/停用功能

---

## 🔌 可插拔架構

### 左側 Panel（臨床摘要）

**Registry 配置**：`src/shared/config/feature-registry.ts`

```typescript
export const CLINICAL_SUMMARY_FEATURES: FeatureConfig[] = [
  {
    id: 'patient-info',
    name: 'Patient Information',
    component: PatientInfoCard,
    tab: 'patient',
    order: 0,
    enabled: true,
  },
  // ...
]
```

**新增功能**：
1. 建立功能元件
2. 在 `feature-registry.ts` 註冊
3. 完成！無需修改 Layout

### 右側 Panel（AI 功能）

**Registry 配置**：`src/shared/config/right-panel-registry.ts`

```typescript
export const RIGHT_PANEL_FEATURES: FeatureConfig[] = [
  {
    id: 'medical-chat',
    name: 'Medical Chat',
    tabLabel: 'medicalChat',
    component: () => null,
    order: 0,
    enabled: true,
  },
  // ...
]
```

---

## 🛡️ 強制執行

### ESLint 規則

建議加入 ESLint 規則來強制執行這些模式：

```json
{
  "rules": {
    "no-restricted-imports": [
      "error",
      {
        "patterns": [
          {
            "group": ["@/features/*/*"],
            "message": "Import from feature's index.ts instead: @/features/feature-name"
          }
        ]
      }
    ]
  }
}
```

---

## ❓ 常見問題

### Q: 如果需要在 features 之間共享功能怎麼辦？

考慮以下選項：

1. **移到 `@/src/shared/*`** - 用於 UI 元件或工具函數
2. **移到 `@/src/core/*`** - 用於業務邏輯
3. **移到 `@/src/application/*`** - 用於應用層級的關注點

**絕對不要**在 features 之間建立直接依賴。

### Q: 如何新增一個新的 feature？

1. 在 `features/` 目錄建立新資料夾
2. 建立 `index.ts` barrel file
3. 建立 `Feature.tsx` 主要元件
4. 在適當的 registry 註冊（如果需要）
5. 匯出公開 API

### Q: 可以在 feature 內部使用其他 feature 的元件嗎？

不可以。如果需要共享元件，應該將其移到 `@/src/shared/components/` 或 `@/components/ui/`。

---

## 📚 相關文件

- [ARCHITECTURE.md](./ARCHITECTURE.md) - 完整系統架構
- [AI_AGENT_IMPLEMENTATION.md](./AI_AGENT_IMPLEMENTATION.md) - AI Agent 實作指南
- [MEDICAL_CHAT.md](./MEDICAL_CHAT.md) - Medical Chat 功能指南

---

## 🎯 總結

Feature 模組架構提供：

✅ **清楚的邊界**：每個 feature 都是獨立單元  
✅ **封裝性**：內部實作細節隱藏  
✅ **可維護性**：容易理解和修改  
✅ **可擴展性**：透過 Registry 輕鬆新增功能  
✅ **重構安全**：內部變更不影響外部  

遵循這些規則可以保持程式碼庫的整潔和可維護性。
