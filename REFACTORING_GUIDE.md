# 重構實施指南 (Refactoring Implementation Guide)

## 已完成的工作 (Completed Work)

### ✅ 階段 1.1: 統一錯誤處理系統

已建立完整的錯誤處理架構：

```
src/core/errors/
├── base.error.ts          # 基礎錯誤類別
├── ai.error.ts            # AI 服務錯誤
├── fhir.error.ts          # FHIR 服務錯誤
├── validation.error.ts    # 驗證錯誤
└── index.ts               # 統一導出和工具函數
```

**使用範例：**
```typescript
import { AiError, AiErrorCode, getUserErrorMessage } from '@/src/core/errors'

// 拋出錯誤
throw new AiError(
  'API key is missing',
  AiErrorCode.API_KEY_MISSING,
  { modelId: 'gpt-4' }
)

// 處理錯誤
try {
  await aiService.query(...)
} catch (error) {
  const userMessage = getUserErrorMessage(error)
  console.error(userMessage)
}
```

### ✅ 階段 1.2: AI 服務介面定義

已建立標準介面：

```
src/core/interfaces/services/
├── ai-provider.interface.ts   # Provider 介面
└── ai-service.interface.ts    # 服務介面
```

## 當前架構問題詳細分析

### 問題 1: 重複的 AI 調用邏輯

**受影響的檔案：**
1. `src/application/hooks/use-ai-query.hook.ts` (75 行)
2. `src/application/hooks/use-ai-streaming.hook.ts` (80 行)
3. `features/medical-chat/hooks/useStreamingChat.ts` (約 150 行)
4. `features/medical-chat/hooks/useAgentChat.ts` (約 200 行)
5. `features/clinical-insights/hooks/useInsightGeneration.ts` (約 100 行)

**重複的邏輯：**
- API key 驗證
- 模型選擇邏輯
- 錯誤處理
- Loading 狀態管理
- 訊息格式化

**建議解決方案：**

建立統一的 `useAiService` hook：

```typescript
// src/application/hooks/ai/use-ai-service.hook.ts
export function useAiService() {
  const { apiKey: openAiKey, geminiKey } = useApiKey()
  const { model } = useNote()
  
  const query = useCallback(async (
    messages: AiMessage[],
    options?: { modelId?: string; temperature?: number }
  ) => {
    const aiService = new AiService(openAiKey, geminiKey)
    const queryUseCase = new QueryAiUseCase(aiService)
    
    return await queryUseCase.execute({
      messages,
      modelId: options?.modelId || model,
      temperature: options?.temperature,
    })
  }, [openAiKey, geminiKey, model])
  
  return { query }
}
```

### 問題 2: 功能間狀態管理不一致

**Clinical Insights 模式：**
```typescript
// 使用 local state + custom hooks
const [responses, setResponses] = useState({})
const [panelStatus, setPanelStatus] = useState({})
const { prompts, handlePromptChange } = useInsightPanels()
```

**Medical Chat 模式：**
```typescript
// 使用多個 custom hooks
const chat = useStreamingChat()
const agent = useAgentChat()
const voice = useVoiceRecording()
const template = useTemplateSelector()
```

**Data Selection 模式：**
```typescript
// 使用 Provider pattern
const { selectedData, setSelectedData } = useDataSelection()
```

**建議統一模式：**

使用 **Custom Hook + Context** 組合模式：

```typescript
// 1. 定義 Context (僅用於跨組件共享)
// 2. 使用 Custom Hook 封裝業務邏輯
// 3. 組件只使用 Hook，不直接使用 Context
```

### 問題 3: Provider 過度耦合

**當前依賴圖：**
```
ClinicalInsightsFeature
├── useLanguage()
├── useClinicalContext()
├── useApiKey()
├── useClinicalData()
├── useClinicalInsightsConfig()
└── useNote()
```

**建議重構：**

```typescript
// 方案 1: 組合 Provider
export function ClinicalProvider({ children }) {
  return (
    <ClinicalDataProvider>
      <ClinicalContextProvider>
        <ClinicalInsightsConfigProvider>
          {children}
        </ClinicalInsightsConfigProvider>
      </ClinicalContextProvider>
    </ClinicalDataProvider>
  )
}

// 方案 2: 使用單一 Hook 聚合
export function useClinicalFeature() {
  const data = useClinicalData()
  const context = useClinicalContext()
  const config = useClinicalInsightsConfig()
  
  return { data, context, config }
}
```

## 逐步重構計劃

### 第一步：重構 Clinical Insights (最複雜的功能)

**目標：** 簡化邏輯，減少重複代碼

**重構步驟：**

#### 1. 建立統一的 Insight Generation Service

```typescript
// src/core/use-cases/insights/generate-insight.use-case.ts
export class GenerateInsightUseCase {
  constructor(private aiService: IAiService) {}
  
  async execute(params: {
    prompt: string
    context: string
    modelId: string
  }): Promise<InsightResult> {
    const messages = [
      { role: 'system', content: 'You are a clinical assistant.' },
      { role: 'user', content: `${params.prompt}\n\nContext:\n${params.context}` }
    ]
    
    const response = await this.aiService.query(messages, params.modelId)
    
    return {
      text: response.text,
      metadata: response.metadata,
    }
  }
}
```

#### 2. 簡化 Feature 組件

**重構前 (188 行)：**
```typescript
export default function ClinicalInsightsFeature() {
  // 6 個不同的 hooks
  // 複雜的狀態管理
  // 內嵌的業務邏輯
  // ...
}
```

**重構後 (約 100 行)：**
```typescript
export default function ClinicalInsightsFeature() {
  const { t } = useLanguage()
  const insights = useClinicalInsights() // 統一 hook
  
  return (
    <ScrollArea className="h-full pr-3">
      <InsightTabs
        panels={insights.panels}
        onGenerate={insights.generate}
        onStop={insights.stop}
      />
    </ScrollArea>
  )
}
```

#### 3. 建立統一的 useClinicalInsights Hook

```typescript
// features/clinical-insights/hooks/useClinicalInsights.ts
export function useClinicalInsights() {
  const { panels, updatePanel } = useClinicalInsightsConfig()
  const { getFullClinicalContext } = useClinicalContext()
  const { model } = useNote()
  const aiService = useAiService()
  
  const [state, setState] = useState({
    responses: {},
    loading: {},
    errors: {},
  })
  
  const generate = useCallback(async (panelId: string) => {
    const panel = panels.find(p => p.id === panelId)
    if (!panel) return
    
    setState(prev => ({
      ...prev,
      loading: { ...prev.loading, [panelId]: true },
      errors: { ...prev.errors, [panelId]: null },
    }))
    
    try {
      const result = await aiService.query(
        [
          { role: 'system', content: 'You are a clinical assistant.' },
          { role: 'user', content: `${panel.prompt}\n\n${getFullClinicalContext()}` }
        ],
        { modelId: model }
      )
      
      setState(prev => ({
        ...prev,
        responses: { ...prev.responses, [panelId]: result.text },
        loading: { ...prev.loading, [panelId]: false },
      }))
    } catch (error) {
      setState(prev => ({
        ...prev,
        errors: { ...prev.errors, [panelId]: getUserErrorMessage(error) },
        loading: { ...prev.loading, [panelId]: false },
      }))
    }
  }, [panels, getFullClinicalContext, model, aiService])
  
  return {
    panels,
    responses: state.responses,
    loading: state.loading,
    errors: state.errors,
    generate,
    stop: () => {}, // TODO: implement
  }
}
```

### 第二步：重構 Medical Chat

**目標：** 統一 normal mode 和 agent mode

**重構策略：**

#### 1. 統一 Chat Hook

```typescript
// features/medical-chat/hooks/useMedicalChat.ts
export function useMedicalChat(mode: 'normal' | 'agent' = 'normal') {
  const aiService = useAiService()
  const { messages, addMessage, clearMessages } = useChatMessages()
  const [isLoading, setIsLoading] = useState(false)
  
  const send = useCallback(async (content: string) => {
    addMessage({ role: 'user', content })
    setIsLoading(true)
    
    try {
      const allMessages = [...messages, { role: 'user', content }]
      
      if (mode === 'agent') {
        // Agent mode: 使用 agent use case
        const result = await agentUseCase.execute({ messages: allMessages })
        addMessage({ role: 'assistant', content: result.text })
      } else {
        // Normal mode: 直接查詢
        const result = await aiService.query(allMessages)
        addMessage({ role: 'assistant', content: result.text })
      }
    } catch (error) {
      // 錯誤處理
    } finally {
      setIsLoading(false)
    }
  }, [messages, mode, aiService])
  
  return { messages, send, isLoading, clear: clearMessages }
}
```

### 第三步：簡化 Provider 架構

**建立 Provider 組合：**

```typescript
// src/application/providers/app.provider.tsx
export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <LanguageProvider>
        <ApiKeyProvider>
          <NoteProvider>
            <FhirProvider>
              <ClinicalProvider>
                {children}
              </ClinicalProvider>
            </FhirProvider>
          </NoteProvider>
        </ApiKeyProvider>
      </LanguageProvider>
    </ErrorBoundary>
  )
}

// src/application/providers/clinical.provider.tsx
export function ClinicalProvider({ children }: { children: React.ReactNode }) {
  return (
    <ClinicalDataProvider>
      <DataSelectionProvider>
        <ClinicalInsightsConfigProvider>
          {children}
        </ClinicalInsightsConfigProvider>
      </DataSelectionProvider>
    </ClinicalDataProvider>
  )
}
```

## 重構檢查清單

### Clinical Insights 重構
- [ ] 建立 `useClinicalInsights` 統一 hook
- [ ] 移除 `useInsightPanels`, `useInsightGeneration`, `useAutoGenerate` 
- [ ] 簡化 `Feature.tsx` 組件
- [ ] 更新測試

### Medical Chat 重構
- [ ] 建立 `useMedicalChat` 統一 hook
- [ ] 合併 `useStreamingChat` 和 `useAgentChat`
- [ ] 簡化 `MedicalChat.tsx` 組件
- [ ] 更新測試

### Data Selection 重構
- [ ] 驗證當前架構（已相對乾淨）
- [ ] 確保使用統一的錯誤處理
- [ ] 微調即可

### Provider 架構
- [ ] 建立 `AppProviders` 組合
- [ ] 建立 `ClinicalProvider` 組合
- [ ] 更新 `app/page.tsx` 使用新的 Provider 結構

### 錯誤處理
- [ ] 更新所有 services 使用新的錯誤類別
- [ ] 更新所有 use cases 使用新的錯誤處理
- [ ] 在組件中使用 `getUserErrorMessage`

## 測試策略

### 單元測試
```typescript
// __tests__/core/use-cases/insights/generate-insight.use-case.test.ts
describe('GenerateInsightUseCase', () => {
  it('should generate insight successfully', async () => {
    const mockAiService = {
      query: jest.fn().mockResolvedValue({
        text: 'Generated insight',
        metadata: { modelId: 'gpt-4' }
      })
    }
    
    const useCase = new GenerateInsightUseCase(mockAiService)
    const result = await useCase.execute({
      prompt: 'Test prompt',
      context: 'Test context',
      modelId: 'gpt-4'
    })
    
    expect(result.text).toBe('Generated insight')
  })
})
```

### 整合測試
```typescript
// __tests__/features/clinical-insights/useClinicalInsights.test.ts
describe('useClinicalInsights', () => {
  it('should generate insights for all panels', async () => {
    const { result } = renderHook(() => useClinicalInsights())
    
    await act(async () => {
      await result.current.generate('panel-1')
    })
    
    expect(result.current.responses['panel-1']).toBeDefined()
  })
})
```

## 預期成果

### 程式碼減少
- Clinical Insights: 從 ~500 行減少到 ~300 行 (-40%)
- Medical Chat: 從 ~600 行減少到 ~400 行 (-33%)
- 總體重複代碼減少: ~40%

### 可維護性提升
- 統一的錯誤處理
- 一致的狀態管理模式
- 清晰的職責分離
- 更好的可測試性

### 開發效率
- 新功能開發時間減少 30%
- Bug 修復時間減少 40%
- 程式碼審查時間減少 25%

## 下一步行動

1. **立即開始：** 重構 Clinical Insights
   - 建立 `useClinicalInsights` hook
   - 測試並驗證功能
   
2. **第二階段：** 重構 Medical Chat
   - 建立 `useMedicalChat` hook
   - 統一 normal 和 agent mode
   
3. **第三階段：** 簡化 Provider 架構
   - 建立 Provider 組合
   - 更新應用程式入口

4. **最後階段：** 清理和文件
   - 移除舊代碼
   - 更新文件
   - 完整測試

## 風險緩解

- ✅ 保持向後相容性（已完成）
- ✅ 建立錯誤處理系統（已完成）
- ⏳ 逐步重構，每步驗證
- ⏳ 完整的測試覆蓋
- ⏳ 程式碼審查

## 參考資源

- [SOLID Principles](https://en.wikipedia.org/wiki/SOLID)
- [Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
- [React Hooks Best Practices](https://react.dev/reference/react)
