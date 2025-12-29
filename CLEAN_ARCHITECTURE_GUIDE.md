# Clean Architecture 使用指南

## 🎯 重構完成！

專案已成功重構為 Clean Architecture，**useGptQuery 已重新命名為 useAiQuery**。

---

## 📁 新架構概覽

```
src/
├── core/                    # 核心層 - 純業務邏輯
│   ├── entities/           # 領域實體
│   ├── interfaces/         # 抽象介面 (Ports)
│   └── use-cases/          # 業務用例
│
├── infrastructure/         # 基礎設施層 - 外部服務實作
│   ├── fhir/              # FHIR 實作
│   └── ai/                # AI 服務實作
│
├── application/            # 應用層 - React 整合
│   ├── hooks/             # 自訂 Hooks
│   └── providers/         # Context Providers
│
└── shared/                 # 共用層
    ├── constants/
    ├── config/
    └── utils/
```

---

## 🚀 快速開始

### 1. 使用新的 AI Query Hook

**✨ useGptQuery → useAiQuery**

```typescript
// ❌ 舊的方式 (已棄用)
import { useGptQuery } from '@/features/medical-note/hooks/useGptQuery'
const { queryGpt } = useGptQuery()

// ✅ 新的方式
import { useAiQuery } from '@/src/application/hooks/use-ai-query.hook'
import { useApiKey } from '@/src/application/providers/api-key.provider'

function MyComponent() {
  const { apiKey, geminiKey } = useApiKey()
  const { queryAi, isLoading, error } = useAiQuery(apiKey, geminiKey)
  
  const handleQuery = async () => {
    const messages = [
      { role: 'system', content: 'You are a helpful assistant' },
      { role: 'user', content: 'Hello!' }
    ]
    
    const result = await queryAi(messages, 'gpt-5-mini')
    console.log(result.text)
  }
}
```

### 2. 使用新的 Providers

```typescript
// ❌ 舊的方式
import { usePatient } from '@/lib/providers/PatientProvider'
import { useClinicalData } from '@/lib/providers/ClinicalDataProvider'
import { useApiKey } from '@/lib/providers/ApiKeyProvider'

// ✅ 新的方式
import { usePatient } from '@/src/application/providers/patient.provider'
import { useClinicalData } from '@/src/application/providers/clinical-data.provider'
import { useApiKey } from '@/src/application/providers/api-key.provider'
```

### 3. 使用語音轉文字

```typescript
import { useTranscription } from '@/src/application/hooks/use-transcription.hook'
import { useApiKey } from '@/src/application/providers/api-key.provider'

function VoiceInput() {
  const { apiKey } = useApiKey()
  const { transcribe, isLoading, error } = useTranscription(apiKey)
  
  const handleAudioBlob = async (blob: Blob) => {
    const result = await transcribe(blob)
    if (result) {
      console.log('Transcribed text:', result.text)
    }
  }
}
```

### 4. 生成臨床上下文

```typescript
import { useClinicalContextGenerator } from '@/src/application/hooks/use-clinical-context.hook'
import { usePatient } from '@/src/application/providers/patient.provider'
import { useClinicalData } from '@/src/application/providers/clinical-data.provider'
import { useDataSelection } from '@/src/application/providers/data-selection.provider'

function ClinicalContext() {
  const { patient } = usePatient()
  const clinicalData = useClinicalData()
  const { selectedData, filters } = useDataSelection()
  const { generateFormattedContext } = useClinicalContextGenerator()
  
  const context = generateFormattedContext(patient, clinicalData, {
    selection: selectedData,
    filters
  })
  
  return <pre>{context}</pre>
}
```

---

## 🏗️ 架構原則

### 1. 依賴規則

```
Presentation → Application → Core ← Infrastructure
```

- **Core** 不依賴任何外層
- **Infrastructure** 實作 Core 定義的介面
- **Application** 協調 Core 和 Infrastructure
- **Presentation** 只使用 Application 層

### 2. 關鍵概念

#### Repository Pattern
```typescript
// Core 定義介面
interface IPatientRepository {
  getCurrentPatient(): Promise<PatientEntity | null>
}

// Infrastructure 實作
class FhirPatientRepository implements IPatientRepository {
  async getCurrentPatient() {
    // FHIR 特定實作
  }
}
```

#### Use Case Pattern
```typescript
// Core 業務邏輯
class GetPatientUseCase {
  constructor(private repository: IPatientRepository) {}
  
  async execute() {
    return await this.repository.getCurrentPatient()
  }
}
```

#### Service Pattern
```typescript
// Core 定義介面
interface IAiService {
  query(request: AiQueryRequest): Promise<AiQueryResponse>
}

// Infrastructure 實作
class AiService implements IAiService {
  async query(request: AiQueryRequest) {
    // OpenAI/Gemini 實作
  }
}
```

---

## 📦 主要 Exports

### Hooks
```typescript
// AI Query
export { useAiQuery } from '@/src/application/hooks/use-ai-query.hook'

// Transcription
export { useTranscription } from '@/src/application/hooks/use-transcription.hook'

// Clinical Context
export { useClinicalContextGenerator } from '@/src/application/hooks/use-clinical-context.hook'
```

### Providers
```typescript
// Patient
export { PatientProvider, usePatient } from '@/src/application/providers/patient.provider'

// Clinical Data
export { ClinicalDataProvider, useClinicalData } from '@/src/application/providers/clinical-data.provider'

// API Keys
export { ApiKeyProvider, useApiKey } from '@/src/application/providers/api-key.provider'

// Data Selection
export { DataSelectionProvider, useDataSelection } from '@/src/application/providers/data-selection.provider'
```

### Entities
```typescript
// Patient
export type { PatientEntity } from '@/src/core/entities/patient.entity'

// Clinical Data
export type {
  ConditionEntity,
  MedicationEntity,
  AllergyEntity,
  ObservationEntity,
  DiagnosticReportEntity,
  ProcedureEntity,
  EncounterEntity,
  ClinicalDataCollection
} from '@/src/core/entities/clinical-data.entity'

// AI
export type {
  AiMessage,
  ChatMessage,
  AiModelDefinition,
  AiQueryRequest,
  AiQueryResponse
} from '@/src/core/entities/ai.entity'

// Clinical Context
export type {
  ClinicalContextSection,
  DataSelection,
  DataFilters,
  TimeRange
} from '@/src/core/entities/clinical-context.entity'
```

---

## 🔧 常見使用場景

### 場景 1: 建立新的 AI 對話

```typescript
import { useAiQuery } from '@/src/application/hooks/use-ai-query.hook'
import { useApiKey } from '@/src/application/providers/api-key.provider'
import type { AiMessage } from '@/src/core/entities/ai.entity'

function ChatComponent() {
  const { apiKey, geminiKey } = useApiKey()
  const { queryAi, isLoading } = useAiQuery(apiKey, geminiKey)
  const [messages, setMessages] = useState<AiMessage[]>([])
  
  const sendMessage = async (userInput: string) => {
    const newMessages: AiMessage[] = [
      ...messages,
      { role: 'user', content: userInput }
    ]
    
    const result = await queryAi(newMessages, 'gpt-5-mini')
    
    setMessages([
      ...newMessages,
      { role: 'assistant', content: result.text }
    ])
  }
  
  return (
    <div>
      {messages.map((msg, i) => (
        <div key={i}>{msg.role}: {msg.content}</div>
      ))}
      {isLoading && <div>Loading...</div>}
    </div>
  )
}
```

### 場景 2: 獲取並顯示病患資料

```typescript
import { usePatient } from '@/src/application/providers/patient.provider'
import { getPatientDisplayName } from '@/src/core/entities/patient.entity'

function PatientInfo() {
  const { patient, loading, error } = usePatient()
  
  if (loading) return <div>Loading patient...</div>
  if (error) return <div>Error: {error}</div>
  if (!patient) return <div>No patient</div>
  
  return (
    <div>
      <h2>{getPatientDisplayName(patient)}</h2>
      <p>Age: {patient.age}</p>
      <p>Gender: {patient.gender}</p>
    </div>
  )
}
```

### 場景 3: 使用臨床資料

```typescript
import { useClinicalData } from '@/src/application/providers/clinical-data.provider'

function ClinicalSummary() {
  const {
    conditions,
    medications,
    allergies,
    isLoading,
    error
  } = useClinicalData()
  
  if (isLoading) return <div>Loading...</div>
  if (error) return <div>Error: {error.message}</div>
  
  return (
    <div>
      <h3>Conditions ({conditions.length})</h3>
      <h3>Medications ({medications.length})</h3>
      <h3>Allergies ({allergies.length})</h3>
    </div>
  )
}
```

---

## 🧪 測試建議

### 單元測試 Use Cases

```typescript
import { QueryAiUseCase } from '@/src/core/use-cases/ai/query-ai.use-case'

describe('QueryAiUseCase', () => {
  it('should query AI service', async () => {
    // Mock service
    const mockService = {
      query: jest.fn().mockResolvedValue({
        text: 'Hello!',
        metadata: { modelId: 'gpt-5-mini', provider: 'openai' }
      }),
      isAvailable: jest.fn().mockReturnValue(true),
      getSupportedModels: jest.fn().mockReturnValue([])
    }
    
    const useCase = new QueryAiUseCase(mockService)
    const result = await useCase.execute({
      messages: [{ role: 'user', content: 'Hi' }],
      modelId: 'gpt-5-mini'
    })
    
    expect(result.text).toBe('Hello!')
    expect(mockService.query).toHaveBeenCalled()
  })
})
```

### 整合測試 Repositories

```typescript
import { FhirPatientRepository } from '@/src/infrastructure/fhir/repositories/patient.repository'

describe('FhirPatientRepository', () => {
  it('should fetch current patient', async () => {
    const repository = new FhirPatientRepository()
    const patient = await repository.getCurrentPatient()
    
    expect(patient).toBeDefined()
    expect(patient?.id).toBeDefined()
  })
})
```

---

## 📚 進階主題

### 自訂 Use Case

```typescript
// 1. 定義在 src/core/use-cases/
export class CustomUseCase {
  constructor(
    private repository: IRepository,
    private service: IService
  ) {}
  
  async execute(input: Input): Promise<Output> {
    // 業務邏輯
  }
}

// 2. 在 Application Hook 中使用
export function useCustom() {
  const repository = new Repository()
  const service = new Service()
  const useCase = new CustomUseCase(repository, service)
  
  return {
    execute: useCase.execute.bind(useCase)
  }
}
```

### 新增 AI Provider

```typescript
// 實作 IAiService 介面
class NewAiService implements IAiService {
  async query(request: AiQueryRequest): Promise<AiQueryResponse> {
    // 新的 AI provider 實作
  }
  
  isAvailable(): boolean {
    return true
  }
  
  getSupportedModels(): AiModelDefinition[] {
    return []
  }
}
```

---

## 🎓 學習資源

- **Clean Architecture**: Robert C. Martin
- **Hexagonal Architecture**: Alistair Cockburn
- **Domain-Driven Design**: Eric Evans
- **SOLID Principles**

---

## ✅ 檢查清單

- [x] useGptQuery 已重新命名為 useAiQuery
- [x] 所有 providers 已遷移到新架構
- [x] 主要 features 已更新
- [x] 型別定義已統一
- [x] 依賴反轉原則已實作
- [x] Repository 模式已應用
- [x] Service 模式已應用

---

## 🆘 常見問題

**Q: 舊的 useGptQuery 還能用嗎？**
A: 舊的檔案還在，但建議使用新的 useAiQuery。

**Q: 如何切換 AI Provider？**
A: useAiQuery 會根據提供的 API key 自動選擇 provider。

**Q: 型別在哪裡定義？**
A: 所有核心型別在 `src/core/entities/` 中定義。

**Q: 如何新增自訂的 Use Case？**
A: 在 `src/core/use-cases/` 中建立，然後在 Application Hook 中使用。

---

**重構完成！專案現在符合 Clean Architecture 原則。** 🎉
