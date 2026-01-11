# Zustand 遷移總結

## 問題：Provider Hell

### 之前（8 層嵌套）
```tsx
<ThemeProvider>
  <LanguageProvider>
    <ApiKeyProvider>
      <ModelSelectionProvider>
        <ChatMessagesProvider>
          <PatientProvider>
            <ClinicalDataProvider>
              <PageContent />
            </ClinicalDataProvider>
          </PatientProvider>
        </ChatMessagesProvider>
      </ModelSelectionProvider>
    </ApiKeyProvider>
  </LanguageProvider>
</ThemeProvider>
```

**問題：**
- 8 層 Provider 嵌套
- 每個 Context 變更都會觸發所有子組件重新渲染
- 代碼難以維護
- 性能問題

---

## 解決方案：Zustand

### 之後（4 層嵌套，減少 50%）
```tsx
<ThemeProvider>
  <LanguageProvider>
    <PatientProvider>
      <ClinicalDataProvider>
        <PageContent />
      </ClinicalDataProvider>
    </PatientProvider>
  </LanguageProvider>
</ThemeProvider>
```

**改善：**
- ✅ Provider 從 8 層減少到 4 層（50% 減少）
- ✅ 不需要 Provider 嵌套（Zustand stores 可直接使用）
- ✅ 更好的性能（細粒度訂閱）
- ✅ 更簡單的代碼

---

## 遷移到 Zustand 的 Providers

### 1. ApiKeyProvider + ModelSelectionProvider → `useAiConfigStore`

**之前：**
```tsx
// 需要 2 個 Providers
const { apiKey, geminiKey } = useApiKey()
const { model } = useModelSelection()
```

**之後：**
```tsx
// 不需要 Provider！
import { useApiKey, useModel } from '@/src/stores/ai-config.store'

const apiKey = useApiKey()
const model = useModel()
```

**優勢：**
- 合併相關狀態到單一 store
- 細粒度訂閱（只訂閱需要的數據）
- 自動加密/解密 API keys
- 支持 localStorage/sessionStorage 切換

---

### 2. ChatMessagesProvider → `useChatStore`

**之前：**
```tsx
// 需要 Provider
const { chatMessages, setChatMessages } = useChatMessages()
```

**之後：**
```tsx
// 不需要 Provider！
import { useChatMessages, useSetChatMessages } from '@/src/stores/chat.store'

const messages = useChatMessages()
const setMessages = useSetChatMessages()
```

**優勢：**
- 不需要 Provider 包裹
- 更簡單的 API
- 更好的 TypeScript 支持

---

## 性能改善

### Context API 問題
```tsx
// Context 變更會觸發所有消費者重新渲染
const { apiKey, geminiKey, model } = useApiConfig()
// 即使只用 apiKey，geminiKey 或 model 變更也會觸發重新渲染
```

### Zustand 解決方案
```tsx
// 細粒度訂閱，只在需要的數據變更時重新渲染
const apiKey = useApiKey()  // 只訂閱 apiKey
const model = useModel()    // 只訂閱 model
```

---

## 遷移指南

### 更新組件使用 Zustand

**步驟 1：移除舊的 Provider imports**
```tsx
// ❌ 移除
import { useApiKey } from '@/src/application/providers/api-key.provider'
import { useModelSelection } from '@/src/application/providers/model-selection.provider'
```

**步驟 2：使用 Zustand stores**
```tsx
// ✅ 新增
import { useApiKey, useModel, useAiConfigStore } from '@/src/stores/ai-config.store'
```

**步驟 3：更新使用方式**
```tsx
// ❌ 舊方式
const { apiKey, setApiKey } = useApiKey()

// ✅ 新方式
const apiKey = useApiKey()
const setApiKey = useAiConfigStore(state => state.setApiKey)
```

---

## 待遷移的組件

需要更新以下文件來使用 Zustand stores：

### 高優先級（直接使用 API keys 和 model）
- [ ] `features/medical-chat/hooks/useAgentChat.ts`
- [ ] `features/medical-chat/hooks/useStreamingChat.ts`
- [ ] `features/clinical-insights/hooks/useInsightGeneration.ts`
- [ ] `src/application/hooks/ai/use-unified-ai.hook.ts`

### 中優先級（使用 chat messages）
- [ ] `features/medical-chat/hooks/useChatMessages.ts`
- [ ] `features/medical-chat/components/MedicalChat.tsx`

### 低優先級（間接使用）
- [ ] 其他使用這些 providers 的組件

---

## 結論

Zustand 遷移帶來的實際改善：

1. **Provider 減少 50%**：從 8 層減少到 4 層
2. **性能提升**：細粒度訂閱，減少不必要的重新渲染
3. **代碼更簡潔**：不需要 Provider 包裹，直接使用 hooks
4. **更好的開發體驗**：更簡單的 API，更好的 TypeScript 支持
5. **真正解決 Provider Hell**：不只是視覺上的改善，而是架構上的改善
