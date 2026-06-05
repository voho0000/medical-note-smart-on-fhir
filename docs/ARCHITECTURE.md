# 系統架構文件

## 概述

本應用程式採用 **Clean Architecture（整潔架構）** 和 **Pluggable Architecture（可插拔架構）**，確保系統的可維護性、可擴展性和可測試性。

---

## 🏗️ Clean Architecture

### 架構層級

```
┌─────────────────────────────────────────────────────────────┐
│                      展示層 (Presentation)                    │
│              app/ • features/ • components/                  │
│                    UI 元件和頁面                              │
├─────────────────────────────────────────────────────────────┤
│                      應用層 (Application)                     │
│                     src/application/                         │
│           應用程式特定邏輯、hooks 和 providers                  │
├─────────────────────────────────────────────────────────────┤
│                      領域層 (Domain)                          │
│                        src/core/                             │
│                    業務實體和用例                              │
├─────────────────────────────────────────────────────────────┤
│                    基礎設施層 (Infrastructure)                 │
│                    src/infrastructure/                       │
│              外部服務整合（FHIR、AI）                          │
└─────────────────────────────────────────────────────────────┘
```

### 1. Presentation Layer（展示層）

**職責**：UI 元件、使用者互動、路由

**目錄結構**：
- `app/` - Next.js App Router、API routes
- `features/` - 功能模組（可插拔）
- `components/` - 可重複使用的 UI 元件

**特點**：
- 使用 React 和 Next.js 16
- shadcn/ui 元件庫
- Tailwind CSS 4 樣式
- 響應式設計

### 2. Application Layer（應用層）

**職責**：應用程式特定邏輯、狀態管理、hooks

**目錄結構**：
```
src/application/
├── adapters/        # 外部服務適配器
├── dto/             # 資料傳輸物件
├── hooks/           # 自訂 React hooks
├── providers/       # Context providers
└── stores/          # Zustand stores
```

**關鍵元件**：
- **Providers**：統一的狀態管理（Auth、FHIR、Language、Theme）
- **Hooks**：封裝業務邏輯的可重用 hooks
- **Stores**：Zustand 狀態管理（Chat、Chat History）

### 3. Domain Layer（領域層）

**職責**：核心業務邏輯、領域實體、用例

**目錄結構**：
```
src/core/
├── categories/      # 資料分類邏輯
├── entities/        # 領域實體
├── errors/          # 錯誤定義
├── interfaces/      # 領域介面
├── registry/        # 功能註冊表
├── services/        # 領域服務
├── use-cases/       # 業務邏輯用例
└── utils/           # 工具函數
```

**Use Cases**：
- `agent/` - AI Agent 用例
- `ai/` - AI 生成用例
- `chat/` - 對話管理用例
- `clinical-context/` - 臨床上下文
- `clinical-data/` - 臨床資料處理
- `clinical-insights/` - 臨床洞察生成
- `patient/` - 病人資料
- `transcription/` - 語音轉錄

### 4. Infrastructure Layer（基礎設施層）

**職責**：外部服務整合、資料持久化

**目錄結構**：
```
src/infrastructure/
├── ai/              # AI 服務實作
│   ├── services/    # OpenAI, Gemini, Perplexity
│   ├── streaming/   # 串流處理
│   └── tools/       # FHIR Tools for AI Agent
├── fhir/            # FHIR 客戶端實作
│   ├── client/      # FHIR 客戶端服務
│   └── repositories/ # FHIR 資料存取
└── firebase/        # Firebase 整合
    └── repositories/ # Firestore repositories
```

---

## 🔌 Pluggable Architecture（可插拔架構）

### 設計理念

可插拔架構讓開發者可以輕鬆新增、替換或移除功能，而無需修改核心程式碼。

### 左側 Panel（臨床摘要）

**Registry 配置**：`src/shared/config/feature-registry.ts`

**核心概念**：
- **Tab 配置**：`LEFT_PANEL_TABS` 定義所有標籤
- **功能配置**：`CLINICAL_SUMMARY_FEATURES` 定義所有功能
- **動態渲染**：`LeftPanelLayout.tsx` 從 registry 讀取並渲染

**新增功能步驟**：
1. 建立功能元件（例如：`MyFeatureCard.tsx`）
2. 在 `feature-registry.ts` 註冊
3. 完成！無需修改 Layout

**範例**：
```typescript
// 1. 建立功能元件
export function MyFeatureCard() {
  const { patient } = useFhirContext()
  return <Card>...</Card>
}

// 2. 在 feature-registry.ts 註冊
{
  id: 'my-feature',
  name: 'My Feature',
  component: MyFeatureCard,
  tab: 'patient',
  order: 3,
  enabled: true,
}
```

**預設功能**（7 個）：
- Patient Info - 病人基本資料
- Vitals - 生命徵象
- Diagnoses - 診斷
- Reports - 診斷報告
- Allergies - 過敏史
- Medications - 用藥
- Visit History - 就診紀錄

### 右側 Panel（AI 功能）

**Registry 配置**：`src/shared/config/right-panel-registry.ts`

**核心概念**：
- **功能配置**：`RIGHT_PANEL_FEATURES` 陣列
- **元件映射**：`RightPanelLayout.tsx` 中的 `FEATURE_COMPONENTS`
- **Provider 管理**：統一的 `RightPanelProviders` wrapper

**新增功能步驟**：
1. 建立功能元件
2. 在 `right-panel-registry.ts` 註冊
3. 在 `FEATURE_COMPONENTS` 加入映射
4. 完成！

**範例**：
```typescript
// 在 right-panel-registry.ts 註冊
{
  id: 'my-feature',
  name: 'My Feature',
  tabLabel: 'myFeature',
  component: () => null,
  order: 4,
  enabled: true,
}
```

**預設功能**（4 個）：
- Medical Chat - AI 對話（一般模式 + 深入模式）
- Data Selection - 資料選擇
- Clinical Insights - 臨床洞察
- Settings - 設定

### 架構優勢

1. **低耦合**：功能之間互不依賴
2. **高內聚**：每個功能自包含
3. **易擴展**：透過 registry 輕鬆新增功能
4. **易維護**：清楚的結構和文件
5. **型別安全**：完整的 TypeScript 支援

### 適用場景

- **Fork 專案**：保留臨床資料顯示，替換 AI 功能
- **客製化**：醫院可以根據需求新增專屬功能
- **實驗性功能**：可以輕鬆啟用/停用功能測試
- **多團隊開發**：不同團隊可以獨立開發功能

---

## 🎯 關鍵設計模式

### 1. Provider 模式

**用途**：基於 Context 的狀態管理

**實作**：
```typescript
// src/application/providers/app-providers.tsx
export function AppProviders({ children }) {
  return (
    <AuthProvider>
      <LanguageProvider>
        <ThemeProvider>
          <FhirProvider>
            {children}
          </FhirProvider>
        </ThemeProvider>
      </LanguageProvider>
    </AuthProvider>
  )
}
```

**主要 Providers**：
- `AuthProvider` - Firebase 使用者認證
- `FhirProvider` - FHIR 資料和病人上下文
- `LanguageProvider` - 多語言支援
- `ThemeProvider` - 深色/亮色模式

### 2. Repository 模式

**用途**：資料存取抽象

**實作**：
```typescript
// src/core/interfaces/repositories/
interface IChatSessionRepository {
  create(session: CreateChatSessionDto): Promise<string>
  update(id: string, updates: UpdateChatSessionDto): Promise<void>
  delete(id: string): Promise<void>
  findById(id: string): Promise<ChatSessionEntity | null>
  listByUser(userId: string): Promise<ChatSessionMetadata[]>
}

// src/infrastructure/firebase/repositories/
class ChatSessionRepository implements IChatSessionRepository {
  // Firestore 實作
}
```

### 3. Use Case 模式

**用途**：封裝業務邏輯

**實作**：
```typescript
// src/core/use-cases/chat/save-chat-session.use-case.ts
export class SaveChatSessionUseCase {
  async execute(
    dto: CreateChatSessionDto,
    repository: IChatSessionRepository
  ): Promise<string> {
    // 業務邏輯
    return await repository.create(dto)
  }
}
```

### 4. Registry 模式

**用途**：可插拔功能架構

**實作**：
```typescript
// src/shared/config/feature-registry.ts
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

// 輔助函數
export function getEnabledFeatures(): FeatureConfig[]
export function getFeaturesForTab(tabId: string): FeatureConfig[]
export function registerFeature(feature: FeatureConfig): void
```

### 5. Adapter 模式

**用途**：外部 API 整合

**實作**：
```typescript
// src/application/adapters/
export class OpenAIAdapter {
  async generateCompletion(prompt: string): Promise<string> {
    // 適配 OpenAI API
  }
}

export class GeminiAdapter {
  async generateCompletion(prompt: string): Promise<string> {
    // 適配 Gemini API
  }
}
```

---

## 🔄 狀態管理策略

### Single Source of Truth (SSOT)

**原則**：每個狀態只有一個唯一的來源

**實作範例**：
```typescript
// ✅ 正確：單一狀態源
const { responses, setResponses } = useInsightGeneration()

// ❌ 錯誤：重複狀態
const [responses1] = useState()  // 來源 A
const [responses2] = useState()  // 來源 B - 會導致不同步
```

### 狀態流程

```
用戶操作
    ↓
UI 元件 (Presentation)
    ↓
Hook (Application)
    ↓
Use Case (Domain)
    ↓
Repository (Infrastructure)
    ↓
外部服務 (FHIR/Firebase/AI)
```

### Context vs Zustand

**使用 Context 的情境**：
- 全域配置（語言、主題）
- 使用者認證狀態
- FHIR 上下文（病人資料）

**使用 Zustand 的情境**：
- 複雜的狀態邏輯
- 需要跨元件共享的狀態
- 對話訊息、對話歷史

---

## 🔐 安全性架構

### 1. 認證與授權

**SMART on FHIR OAuth 2.0 + PKCE**：
- 標準的 OAuth 2.0 流程
- PKCE 增強安全性
- Token 管理由 fhirclient 處理

**Firebase Authentication**：
- Google 登入
- Email/密碼登入
- Email 驗證機制

### 2. API Key 管理

**儲存策略**：
- 僅存於瀏覽器 localStorage
- 支援 AES-GCM 256-bit 加密（可選）
- 不傳送到後端伺服器

**使用方式**：
```typescript
// src/application/providers/api-key.provider.tsx
const { apiKey, setApiKey, clearApiKey } = useApiKey()
```

### 3. AI Agent 安全性

**限制**：
- ✅ 僅限查詢當前病人的資料
- ✅ 僅限讀取操作，無寫入權限
- ✅ 使用 FHIR client 的權限控制
- ✅ 客戶端執行，避免 Token 外洩

**實作**：
```typescript
// 客戶端 Tool Calling
const tools = createFhirTools(fhirClient, patientId)
// patientId 由系統提供，AI 無法修改
```

### 4. 資料隔離

**Firestore Security Rules**：
```javascript
match /users/{userId}/chats/{chatId} {
  allow read, write: if request.auth != null 
                     && request.auth.uid == userId;
}
```

---

## 📦 Feature-based Organization

### 目錄結構

```
features/
├── auth/                    # 使用者認證
│   ├── components/
│   ├── hooks/
│   └── index.ts            # 公開 API
├── chat-history/           # 對話歷史
├── clinical-insights/      # 臨床洞察
├── clinical-summary/       # 臨床摘要（7 個子功能）
├── data-selection/         # 資料選擇
├── medical-chat/           # AI 對話
├── prompt-gallery/         # 提示範本庫
└── settings/               # 設定
```

### Barrel File 模式

**每個 feature 都有 `index.ts` 定義公開 API**：

```typescript
// features/medical-chat/index.ts
export { MedicalChatFeature } from './Feature'
export { useChatStore } from './hooks/useChatStore'
export type { ChatMessage } from './types'
```

**使用方式**：
```typescript
// ✅ 正確：使用 barrel file
import { MedicalChatFeature } from '@/features/medical-chat'

// ❌ 錯誤：直接存取內部檔案
import MedicalChat from '@/features/medical-chat/components/MedicalChat'
```

### 優勢

1. **封裝**：內部變更不影響使用者
2. **清楚邊界**：明確的公開 vs 私有 API
3. **重構安全**：可以重組內部結構
4. **防止耦合**：強制功能獨立
5. **Tree-shaking**：更好的打包優化

---

## 🧪 測試策略

### 測試層級

```
__tests__/
├── application/     # 應用層測試
├── core/            # 領域層測試
├── fhir/            # FHIR 測試
├── infrastructure/  # 基礎設施層測試
└── shared/          # 共用工具測試
```

### 測試工具

- **Jest 30**：測試框架
- **React Testing Library**：元件測試
- **@testing-library/jest-dom**：DOM 斷言

### 測試原則

1. **單元測試**：測試 use cases 和 utilities
2. **整合測試**：測試 repositories 和 adapters
3. **元件測試**：測試 UI 元件行為
4. **E2E 測試**：測試完整使用者流程（未來）

---

## 🔄 FHIR 資料映射

### 概述

本系統使用 **FHIR Mapper** 將 FHIR 資源轉換為應用程式的 Domain Entities，確保業務邏輯與外部資料格式解耦。

### 架構設計

```
FHIR Server
    ↓
FHIR Resources (R4)
    ↓
FHIR Mapper (Infrastructure Layer)
    ↓
Domain Entities (Core Layer)
    ↓
Application Layer (Hooks & Stores)
    ↓
Presentation Layer (UI Components)
```

### 實作位置

**Infrastructure Layer**：
```
src/infrastructure/fhir/
├── mappers/
│   ├── fhir.mapper.ts        # 主要 FHIR 資源映射
│   └── patient.mapper.ts     # 病人資料映射
└── repositories/
    ├── clinical-data.repository.ts  # 使用 mapper 轉換資料
    └── patient.repository.ts        # 使用 mapper 轉換病人資料
```

**Core Layer**：
```
src/core/entities/
├── patient.entity.ts         # 病人實體
├── observation.entity.ts     # 檢驗檢查實體
├── medication.entity.ts      # 用藥實體
├── condition.entity.ts       # 診斷實體
└── ...                       # 其他臨床資料實體
```

### FHIR Mapper 功能

**主要職責**：
- 將 FHIR R4 資源轉換為 Domain Entities
- 標準化資料格式（日期、狀態碼、單位等）
- 處理 FHIR 資源的複雜結構
- 提供類型安全的轉換

**範例**：
```typescript
// src/infrastructure/fhir/mappers/fhir.mapper.ts
export class FhirMapper {
  mapObservation(fhirResource: fhir4.Observation): ObservationEntity {
    return {
      id: fhirResource.id,
      code: fhirResource.code.coding?.[0]?.code,
      displayName: fhirResource.code.coding?.[0]?.display,
      status: fhirResource.status,
      effectiveDate: new Date(fhirResource.effectiveDateTime),
      value: this.extractValue(fhirResource.valueQuantity),
      // ...
    }
  }
}
```

### 優勢

1. **解耦合** - 業務邏輯不依賴 FHIR 格式
2. **可維護** - FHIR 版本更新只需修改 Mapper
3. **類型安全** - TypeScript 確保轉換正確性
4. **可測試** - Mapper 可獨立測試

---

## 📚 相關文件

- [FEATURES.md](./FEATURES.md) - Feature 模組架構
- [AI_AGENT_IMPLEMENTATION.md](./AI_AGENT_IMPLEMENTATION.md) - AI Agent 實作
- [MEDICAL_CHAT.md](./MEDICAL_CHAT.md) - Medical Chat 功能
- [PROMPT_GALLERY.md](./PROMPT_GALLERY.md) - 提示範本庫
- [SECURITY.md](./SECURITY.md) - 安全性指南
- [Firebase Functions Repo](https://github.com/voho0000/firebase-smart-on-fhir) - Firebase 設定與部署
- [SECURITY_IMPLEMENTATION.md](./SECURITY_IMPLEMENTATION.md) - 安全性實作

---

## 🎯 最佳實踐

### 1. 遵循 Clean Architecture

- 依賴方向：外層依賴內層
- 領域層不依賴外層
- 使用介面抽象外部依賴

### 2. 使用 TypeScript

- 完整的型別定義
- 避免使用 `any`
- 使用 interface 和 type

### 3. 功能獨立

- 透過 Registry 註冊功能
- 使用 barrel file 封裝
- 避免功能間直接依賴

### 4. 狀態管理

- 遵循 SSOT 原則
- 選擇適當的狀態管理工具
- 避免狀態重複

### 5. 測試覆蓋

- 為核心邏輯撰寫測試
- 測試邊界條件
- 保持測試簡單明確

---

## 🚀 未來發展

### 短期目標

- [ ] 完善 E2E 測試
- [ ] 增加更多 AI Agent Tools
- [ ] 優化效能和載入速度

### 長期目標

- [ ] 支援更多 FHIR 資源類型
- [ ] 多租戶架構
- [ ] 離線模式支援
- [ ] 行動應用程式

---

## 總結

本系統採用 Clean Architecture 和 Pluggable Architecture，提供：

✅ **可維護性**：清楚的層級和職責分離  
✅ **可擴展性**：透過 Registry 輕鬆新增功能  
✅ **可測試性**：完整的測試策略  
✅ **型別安全**：TypeScript 完整支援  
✅ **安全性**：多層安全防護  

這個架構設計讓團隊能夠高效協作，快速迭代，並保持程式碼品質。
