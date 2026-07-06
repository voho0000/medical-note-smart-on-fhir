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
- `/` 斜線快速套用提示模板

---

### 4. Clinical Insights（臨床洞察）
**Entry Point:** `@/features/clinical-insights`

```typescript
import { ClinicalInsightsFeature } from '@/features/clinical-insights'

// Usage
<ClinicalInsightsFeature />
```

**功能**：
- 自訂提示詞的並行 AI 分析工作台（每個標籤一個提示詞，載入病人後可自動生成）
- 洞察標籤可新增、重新命名、調整提示詞；回應可手動編輯（重新生成前會確認）
- 內建範本：變化摘要（What's Changed）、臨床快照（Clinical Snapshot）

> 主動安全警示（Safety Alerts）已於 v0.26 移至「醫療摘要」分頁內嵌呈現（見第 10 節）；臨床洞察回歸純自訂工作台。

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
- AI 偏好設定（API 金鑰、金鑰持久化）——模型改在各 AI 功能內就地選擇（共用 `src/shared/components/ModelPicker`，各功能偏好獨立記憶）
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
- `PatientInfoCard` - 病人基本資料
- `ReportsCard` - 診斷報告
- `VisitHistoryCard` - 就診紀錄
- `VitalsCard` - 生命徵象

---

### 9. Medical Calculator（醫療計算機）
**Entry Point:** `@/features/medical-calculator`

```typescript
import MedicalCalculatorFeature from '@/features/medical-calculator/Feature'

// Usage（右側面板分頁）
<MedicalCalculatorFeature />
```

**功能**：
- MDCalc 風格的臨床計算工具／評分量表，共 10 類、50+ 個（腎、肝、GI、電解質、心血管、肺、血液、神經、精神、一般）
- **自動帶入病人數值**：檢驗值依 canonical／LOINC／檢體（`Observation.specimen`）解析後自動填入，顯示原始單位並在維度相符時自動換算（僅在真正無法換算時顯示 ⚠）
- 每個計算機附「適用時機（When to Use）」與「注意事項（Pearls/Pitfalls）」，結果含風險分層與處置建議
- 我的最愛、最近使用、依受眾（醫療／民眾）與科別／用途篩選、搜尋
- 民眾可自填的量表（PHQ-9、GDS-15、Epworth…）
- 結果可一鍵複製成病歷可貼上的一行摘要

**資料驅動架構**：`calculators/`（依類別分檔，每個 `CalculatorDef` 帶純函式 `compute`）＋純模組 `list-logic.ts`／`format.ts`／`autofill-compute.ts`（`resolveInput` 為自動帶入的唯一真相來源），154 個單元測試。新增一個計算機＝新增一筆 `CalculatorDef`（＋ `CALC_TAGS`／`CALC_INFO`）。

---

### 10. Medical Summary（醫療摘要）
**Entry Point:** `@/features/medical-summary/Feature`

```typescript
import MedicalSummaryFeature from '@/features/medical-summary/Feature'

// Usage（右側面板第一個分頁，開啟病人後的預設分頁）
<MedicalSummaryFeature />
```

**功能**：
- **零點擊 AI 簡報**：載入病人後自動產生（onboarding 可關閉），單頁縱向流——重點閱讀零點擊，稽核才互動
- **跨院病程摘要**：3–5 句敘事、關鍵片語 highlight、Perplexity 式引用藥丸；引用逐筆對 FHIR bundle 驗證，查無來源標「未驗證」（琥珀色、不可點），已驗證來源可點擊導航至左側面板對應卡片並閃爍定位
- **用藥安全警示（內嵌）**：`features/proactive-safety-alerts` 的 `SafetyAlertsPanel` 以 embedded 模式內嵌；依嚴重度分級密度——高風險完整卡（證據常駐）、中風險緊湊列（點擊展開）、低風險整批收合一行
- **需要決定的事**：附緊急度（高／中／低）與依據來源
- **跨院時間軸**：App 端確定性抽取事件骨架（日期、院所、住院／急診／門診由 `Encounter.class` 判別），AI 只做策展與一句話標籤——零幻覺日期與院所；預設顯示最近 8 筆，較早收合
- **資料涵蓋卡**：純計算（零 AI）——日期範圍、院所數、各資源計數＋健康存摺涵蓋邊界聲明（自費不含、上傳時間差）
- **區塊導覽列**：敘事卡下方的警示／待決／時間軸計數 chip（色碼嚴重度），點擊平滑捲至區塊
- **雙受眾**：醫療人員版／民眾版跟隨全域 audience，各自生成與快取；民眾版有語氣護欄與免責文案
- **快取與韌性**：encrypted-session-cache 12 小時（key 含 audience）；Zod schema 驗證，壞 JSON 自動靜默重試一次

**架構重點**：2 個 AI 呼叫（既有 Safety scan＋一個 Summary structured call）＋1 個純計算（涵蓋卡）；區塊獨立進場（涵蓋卡秒出 → 警示 → 摘要）。設計文件：[BRIEFING-PANEL-DESIGN-2026-07-04.md](./BRIEFING-PANEL-DESIGN-2026-07-04.md)。

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

**Registry 配置**：`src/shared/config/right-panel-registry.ts`（元件不在 registry 內——由 `RightPanelLayout` 的 `FEATURE_COMPONENTS` 依 id 對映並 lazy-load）

```typescript
export const RIGHT_PANEL_FEATURES: RightPanelFeatureConfig[] = [
  {
    id: 'medical-summary',
    name: 'Medical Summary',
    tabLabel: 'medicalSummary',   // i18n key（t.tabs）
    order: 0,
    enabled: true,
    forceMount: true,             // 切換分頁時保留狀態
  },
  {
    id: 'data-selection',
    // ...
    pinned: false,                // 預設收合於「更多」選單
  },
  {
    id: 'settings',
    // ...
    pinLocked: true,              // 永遠常駐、不可被使用者收合
    iconOnly: true,               // 只顯示 icon（齒輪）
  },
]
```

**分頁常駐與收合**：`pinned: false` 的功能預設收在 tab 列的「更多」下拉選單；使用者可在選單內「自訂常駐分頁」逐一 pin／unpin，覆寫值持久化於 `right-panel-tabs` store（localStorage）。`pinLocked` 的功能（設定）永遠顯示在最右端。

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
