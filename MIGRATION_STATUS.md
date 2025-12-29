# Clean Architecture 遷移狀態

## ✅ 已完成

### 1. 新架構建立 (100%)
- ✅ Core Layer: Entities, Interfaces, Use Cases
- ✅ Infrastructure Layer: FHIR Repositories, AI Services
- ✅ Application Layer: Hooks, Providers
- ✅ Shared Layer: Constants, Config, Utils

### 2. 關鍵重構
- ✅ **useGptQuery → useAiQuery** (已重新命名)
- ✅ FHIR 邏輯抽象化到 Repository
- ✅ AI 服務抽象化 (支援 OpenAI + Gemini)
- ✅ 依賴反轉原則實作

### 3. 新的 Providers (在 src/application/providers/)
- ✅ PatientProvider - 使用 GetPatientUseCase
- ✅ ClinicalDataProvider - 使用 FetchClinicalDataUseCase
- ✅ ApiKeyProvider - 管理 API keys
- ✅ DataSelectionProvider - 管理資料選擇

### 4. 新的 Hooks (在 src/application/hooks/)
- ✅ useAiQuery - 統一的 AI 查詢介面
- ✅ useTranscription - 語音轉文字
- ✅ useClinicalContextGenerator - 生成臨床上下文

---

## 🔄 進行中

### 更新 Import 路徑
- ✅ app/page.tsx - 已更新使用新 providers
- ⏳ app/layout.tsx - 需要確認
- ⏳ features/* - 待更新

---

## ⏳ 待完成

### 1. Features 遷移
需要更新以下 features 使用新的 hooks 和 providers：

- [ ] features/medical-chat/components/MedicalChat.tsx
  - 將 `useGptQuery` 改為 `useAiQuery`
  - 更新 import 路徑

- [ ] features/clinical-insights/Feature.tsx
  - 將 `useGptQuery` 改為 `useAiQuery`
  - 更新 import 路徑

- [ ] features/clinical-summary/Feature.tsx
  - 更新 provider imports

- [ ] features/data-selection/
  - 使用新的 DataSelectionProvider

- [ ] features/right-panel/Feature.tsx
  - 更新所有 provider imports

### 2. 舊檔案清理
待所有 features 遷移完成後刪除：
- [ ] lib/providers/PatientProvider.tsx
- [ ] lib/providers/ClinicalDataProvider.tsx
- [ ] lib/providers/ApiKeyProvider.tsx
- [ ] features/medical-note/hooks/useGptQuery.ts
- [ ] features/data-selection/hooks/useDataSelection.ts

### 3. 測試
- [ ] 驗證 SMART on FHIR 登入流程
- [ ] 驗證病患資料載入
- [ ] 驗證 AI 查詢功能
- [ ] 驗證語音轉文字
- [ ] 驗證所有 features 正常運作

---

## 📝 遷移指南

### 更新 useGptQuery 到 useAiQuery

**舊的方式：**
```typescript
import { useGptQuery } from '@/features/medical-note/hooks/useGptQuery'

const { queryGpt, isLoading, error } = useGptQuery()
```

**新的方式：**
```typescript
import { useAiQuery } from '@/src/application/hooks'
import { useApiKey } from '@/src/application/providers'

const { apiKey, geminiKey } = useApiKey()
const { queryAi, isLoading, error } = useAiQuery(apiKey, geminiKey)
```

### 更新 Providers

**舊的方式：**
```typescript
import { usePatient } from '@/lib/providers/PatientProvider'
import { useClinicalData } from '@/lib/providers/ClinicalDataProvider'
```

**新的方式：**
```typescript
import { usePatient } from '@/src/application/providers/patient.provider'
import { useClinicalData } from '@/src/application/providers/clinical-data.provider'
```

---

## 🎯 下一步行動

1. 更新 features/medical-chat/components/MedicalChat.tsx
2. 更新 features/clinical-insights/Feature.tsx
3. 測試所有功能
4. 清理舊檔案
