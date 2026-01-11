# SSOT (Single Source of Truth) 合規性檢查清單

## 📋 快速檢查清單

在重構或新增功能時，使用這個清單確保符合 SSOT 原則：

- [ ] **唯一所有者** - 每個狀態只有一個明確的所有者
- [ ] **單一更新點** - 所有狀態更新都通過同一個 setter
- [ ] **無重複狀態** - 沒有狀態的副本或鏡像
- [ ] **單向數據流** - 數據流向清晰且單向
- [ ] **清晰職責** - 每個 hook/組件的職責明確定義

---

## 🔍 詳細檢查項目

### 1. 狀態所有權檢查

#### ✅ 通過標準
```typescript
// ✅ 好：明確的單一所有者
const { responses, setResponses } = useStateOwner()

// ✅ 好：文檔中明確標註所有權
/**
 * State Owner: useInsightGeneration
 * Owns: responses, panelStatus
 */
```

#### ❌ 失敗標準
```typescript
// ❌ 壞：多個地方管理相同狀態
const { responses: responsesA } = useHookA()
const { responses: responsesB } = useHookB()

// ❌ 壞：沒有明確的所有者
const [responses, setResponses] = useState({})
// 這個狀態屬於誰？
```

#### 檢查問題
1. 這個狀態有明確的所有者嗎？
2. 所有者是否在代碼或文檔中明確標註？
3. 是否有其他地方也在管理相同的狀態？

---

### 2. 更新路徑檢查

#### ✅ 通過標準
```typescript
// ✅ 好：所有更新都通過同一個 setter
const { setResponses } = useStateOwner()

const handleUpdate = (id, value) => {
  setResponses(prev => ({ ...prev, [id]: value }))
}

const handleClear = (id) => {
  setResponses(prev => ({ ...prev, [id]: null }))
}
```

#### ❌ 失敗標準
```typescript
// ❌ 壞：多個 setter 更新相同的狀態概念
const { setResponsesA } = useHookA()
const { setResponsesB } = useHookB()

handleUpdate() // 更新 A
// 但顯示的是 B！
```

#### 檢查問題
1. 所有更新都使用同一個 setter 嗎？
2. 是否有多個 setter 可能影響相同的數據？
3. 更新路徑是否清晰可追蹤？

---

### 3. 狀態重複檢查

#### ✅ 通過標準
```typescript
// ✅ 好：狀態只存在一個地方
const StateOwner = () => {
  const [data, setData] = useState({})
  return { data, setData }
}

const Consumer = () => {
  const { data } = useStateOwner() // 只是引用
  return <div>{data}</div>
}
```

#### ❌ 失敗標準
```typescript
// ❌ 壞：狀態被複製到多個地方
const HookA = () => {
  const [data, setData] = useState({}) // 副本 A
}

const HookB = () => {
  const [data, setData] = useState({}) // 副本 B
}
```

#### 檢查問題
1. 這個狀態是否在多個地方被 `useState` 初始化？
2. 是否有狀態的副本或鏡像？
3. 所有消費者都引用同一個狀態源嗎？

---

### 4. 數據流向檢查

#### ✅ 通過標準
```typescript
// ✅ 好：清晰的單向數據流
State Owner (useState)
    ↓ provides state & setter
Parent Component (creates handlers)
    ↓ passes handlers as props
Child Component (triggers events)
    ↓ calls handlers
Back to State Owner (updates state)
```

#### ❌ 失敗標準
```typescript
// ❌ 壞：混亂的雙向數據流
Component A ←→ Component B
    ↕           ↕
State A     State B
// 誰更新誰？數據從哪來？
```

#### 檢查問題
1. 數據流向是否單向且清晰？
2. 能否畫出清晰的數據流程圖？
3. 是否有循環依賴或雙向綁定？

---

### 5. 職責分離檢查

#### ✅ 通過標準
```typescript
// ✅ 好：清晰的職責分離
/**
 * useStateOwner
 * Responsibility: Own and manage state
 */
const useStateOwner = () => {
  const [state, setState] = useState({})
  return { state, setState }
}

/**
 * useStatelessHelper
 * Responsibility: Provide utility functions (no state)
 */
const useStatelessHelper = () => {
  const transform = (data) => { /* ... */ }
  return { transform }
}
```

#### ❌ 失敗標準
```typescript
// ❌ 壞：職責不清
const useConfusedHook = () => {
  const [stateA, setStateA] = useState({})
  const [stateB, setStateB] = useState({})
  const [stateC, setStateC] = useState({})
  // 這個 hook 到底負責什麼？
}
```

#### 檢查問題
1. 每個 hook/組件的職責是否明確？
2. 職責是否在文檔中清楚說明？
3. 是否有 hook 承擔了太多職責？

---

## 🎯 實際應用範例

### 範例 1：檢查 Clinical Insights

#### 重構前評分
- [ ] ❌ 唯一所有者 - responses 有兩個所有者
- [ ] ❌ 單一更新點 - setResponses 有兩個版本
- [ ] ❌ 無重複狀態 - responses 被重複管理
- [ ] ⚠️ 單向數據流 - 部分清晰，但有混亂
- [ ] ⚠️ 清晰職責 - useInsightPanels 職責過多

**評分：0/5 通過 ❌**

#### 重構後評分
- [x] ✅ 唯一所有者 - useInsightGeneration 是唯一所有者
- [x] ✅ 單一更新點 - 所有更新都通過同一個 setResponses
- [x] ✅ 無重複狀態 - responses 只在一個地方
- [x] ✅ 單向數據流 - 清晰的單向流動
- [x] ✅ 清晰職責 - 每個 hook 職責明確

**評分：5/5 通過 ✅**

---

### 範例 2：檢查新功能

假設你要新增一個 `useUserPreferences` hook：

```typescript
// 🤔 需要檢查的代碼
const useUserPreferences = () => {
  const [theme, setTheme] = useState('light')
  const [language, setLanguage] = useState('en')
  return { theme, setTheme, language, setLanguage }
}

const useSettings = () => {
  const [theme, setTheme] = useState('light') // ⚠️ 重複！
  const [fontSize, setFontSize] = useState(14)
  return { theme, setTheme, fontSize, setFontSize }
}
```

#### 檢查結果
- [ ] ❌ 唯一所有者 - theme 有兩個所有者
- [ ] ❌ 單一更新點 - setTheme 有兩個版本
- [ ] ❌ 無重複狀態 - theme 被重複管理
- [x] ✅ 單向數據流 - 流向清晰
- [ ] ⚠️ 清晰職責 - 職責重疊

**評分：1/5 通過 ❌ - 需要重構！**

#### 修正方案
```typescript
// ✅ 修正：合併為單一所有者
const useUserPreferences = () => {
  const [theme, setTheme] = useState('light')
  const [language, setLanguage] = useState('en')
  const [fontSize, setFontSize] = useState(14)
  return { theme, setTheme, language, setLanguage, fontSize, setFontSize }
}

// useSettings 變成無狀態工具
const useSettings = () => {
  const { theme, setTheme, fontSize, setFontSize } = useUserPreferences()
  
  const applySettings = () => {
    // 應用設定的邏輯
  }
  
  return { theme, fontSize, applySettings }
}
```

---

## 📊 評分標準

### 5/5 - 完美 ✅
- 所有檢查項目都通過
- 代碼清晰易懂
- 文檔完整

### 3-4/5 - 良好 ⚠️
- 大部分檢查項目通過
- 有小問題但不影響功能
- 建議改進

### 0-2/5 - 需要重構 ❌
- 多個檢查項目失敗
- 有明顯的架構問題
- 必須重構

---

## 🛠️ 重構步驟

當檢查發現問題時，按照以下步驟重構：

### Step 1: 識別所有狀態
列出所有相關的狀態和它們的當前所有者

### Step 2: 確定唯一所有者
為每個狀態選擇一個明確的所有者

### Step 3: 移除重複
刪除所有重複的狀態管理

### Step 4: 重構消費者
讓所有消費者從 SSOT 獲取狀態

### Step 5: 更新文檔
在代碼中明確標註狀態所有權

### Step 6: 驗證
使用這個檢查清單再次驗證

---

## 📝 Code Review 使用指南

在 Code Review 時，使用這個清單：

```markdown
## SSOT 合規性檢查

- [ ] 唯一所有者
- [ ] 單一更新點
- [ ] 無重複狀態
- [ ] 單向數據流
- [ ] 清晰職責

評分：__/5

備註：
- 
```

---

## 🎓 最佳實踐

### DO ✅
- 在文檔中明確標註狀態所有權
- 使用 TypeScript 強制類型安全
- 為複雜狀態畫出流程圖
- 定期使用這個清單檢查

### DON'T ❌
- 不要在多個地方 `useState` 相同的狀態
- 不要創建狀態的副本或鏡像
- 不要讓多個 hooks 管理相同的數據
- 不要忽略狀態所有權的文檔

---

## 📚 相關資源

- [STATE_FLOW_DIAGRAM.md](./STATE_FLOW_DIAGRAM.md) - 狀態流程圖範例
- [React 官方文檔 - State Management](https://react.dev/learn/managing-state)
- [Single Source of Truth 原則](https://en.wikipedia.org/wiki/Single_source_of_truth)

---

## 🔄 持續改進

這個檢查清單應該：
- 在每次重構前使用
- 在 Code Review 時使用
- 定期更新和改進
- 與團隊分享和討論

記住：**好的架構不是一次性的，而是持續改進的結果！**
