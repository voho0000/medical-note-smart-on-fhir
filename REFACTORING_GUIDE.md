# Clean Architecture 重構指南

## 重構進度

### ✅ 已完成
1. **Core Layer (核心層)** - 完成
   - Entities: Patient, Clinical Data, AI, Clinical Context
   - Interfaces: Repository & Service interfaces
   - Use Cases: Patient, Clinical Data, AI Query, Transcription, Clinical Context

2. **Shared Layer (共用層)** - 完成
   - Constants: AI Models, Data Selection
   - Config: Environment configuration
   - Utils: Date, Storage, ID generation

3. **Infrastructure Layer (基礎設施層)** - 完成
   - FHIR: Client, Repositories, Mappers
   - AI: AI Service (OpenAI + Gemini), Transcription Service

4. **Application Layer (應用層)** - 完成
   - Hooks: useAiQuery (renamed from useGptQuery), useTranscription, useClinicalContextGenerator
   - Providers: Patient, ClinicalData, ApiKey, DataSelection

### 🔄 進行中
5. **更新 Import 路徑** - 需要更新所有現有檔案的 import

### ⏳ 待完成
6. **Presentation Layer** - 簡化 features
7. **測試與驗證**

---

## 新架構說明

### 目錄結構
```
src/
├── core/                          # 核心業務邏輯層
│   ├── entities/                  # 領域實體
│   ├── interfaces/                # 抽象介面 (Ports)
│   │   ├── repositories/
│   │   └── services/
│   └── use-cases/                 # 業務用例
│       ├── patient/
│       ├── clinical-data/
│       ├── clinical-context/
│       ├── ai/
│       └── transcription/
│
├── infrastructure/                # 基礎設施層 (Adapters)
│   ├── fhir/                     # FHIR 實作
│   │   ├── client/
│   │   ├── repositories/
│   │   └── mappers/
│   └── ai/                       # AI 服務實作
│       └── services/
│
├── application/                   # 應用層
│   ├── hooks/                    # React Hooks
│   ├── providers/                # Context Providers
│   └── dto/                      # Data Transfer Objects
│
└── shared/                        # 共用工具
    ├── constants/
    ├── config/
    └── utils/
```

### 關鍵改進

1. **useGptQuery → useAiQuery**
   - 更通用的命名，支援 OpenAI 和 Gemini
   - 位置: `src/application/hooks/use-ai-query.hook.ts`

2. **依賴反轉**
   - Core 層不依賴任何外層
   - Infrastructure 實作 Core 定義的介面

3. **關注點分離**
   - 業務邏輯 (Use Cases) 獨立於框架
   - Repository 抽象化 FHIR 存取
   - Service 抽象化 AI 服務

4. **可測試性**
   - Use Cases 可獨立測試
   - 可輕鬆 mock Repository 和 Service

---

## 使用方式

### 舊的方式 (已棄用)
```typescript
import { useGptQuery } from '@/features/medical-note/hooks/useGptQuery'
```

### 新的方式
```typescript
import { useAiQuery } from '@/src/application/hooks'
import { useApiKey } from '@/src/application/providers'

const { apiKey, geminiKey } = useApiKey()
const { queryAi, isLoading } = useAiQuery(apiKey, geminiKey)
```

---

## 遷移步驟

1. ✅ 建立新的 src 目錄結構
2. ✅ 實作 Core, Infrastructure, Application 層
3. 🔄 更新現有檔案的 import 路徑
4. ⏳ 簡化 features (移除重複的業務邏輯)
5. ⏳ 測試所有功能
6. ⏳ 刪除舊的檔案 (lib/providers, features/*/hooks)

---

## 注意事項

- 所有新的 import 都使用 `@/src/` 前綴
- 舊的 `@/lib/`, `@/features/` 將逐步遷移
- Provider 階層已簡化，減少不必要的巢狀
