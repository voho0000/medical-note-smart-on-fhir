# 什麼是好的本地狀態？完整指南

## 📚 目錄
1. [本地狀態 vs 全局狀態](#本地狀態-vs-全局狀態)
2. [判斷標準](#判斷標準)
3. [好的本地狀態範例](#好的本地狀態範例)
4. [壞的本地狀態範例](#壞的本地狀態範例)
5. [決策流程圖](#決策流程圖)
6. [實際案例分析](#實際案例分析)
7. [最佳實踐](#最佳實踐)

---

## 本地狀態 vs 全局狀態

### 本地狀態 (Local State)
**定義：** 只在單一組件或其直接子組件中使用的狀態

**特徵：**
- 使用 `useState` 或 `useReducer` 在組件內部定義
- 不需要在多個不相關的組件間共享
- 通常是 UI 相關的臨時狀態
- 組件卸載時狀態消失

### 全局狀態 (Global State)
**定義：** 需要在多個組件間共享的狀態

**特徵：**
- 使用 Context Provider 或狀態管理庫
- 需要在應用的多個地方訪問
- 通常是業務數據或配置
- 可能需要持久化

---

## 判斷標準

### ✅ 應該使用本地狀態的情況

#### 1. **純 UI 狀態**
狀態只影響組件的視覺呈現，不影響業務邏輯

```typescript
// ✅ 好：展開/收起狀態
const [isExpanded, setIsExpanded] = useState(false)

// ✅ 好：顯示/隱藏模態框
const [showModal, setShowModal] = useState(false)

// ✅ 好：當前選中的 tab
const [activeTab, setActiveTab] = useState('overview')

// ✅ 好：hover 狀態
const [isHovered, setIsHovered] = useState(false)
```

#### 2. **臨時輸入狀態**
用戶正在輸入但尚未提交的數據

```typescript
// ✅ 好：輸入框的臨時值
const [input, setInput] = useState('')

// ✅ 好：表單的編輯狀態
const [editedValue, setEditedValue] = useState('')

// ✅ 好：搜索框的臨時查詢
const [searchQuery, setSearchQuery] = useState('')
```

#### 3. **組件特定的載入/錯誤狀態**
只影響單一組件的狀態

```typescript
// ✅ 好：單一按鈕的載入狀態
const [isSubmitting, setIsSubmitting] = useState(false)

// ✅ 好：單一表單的驗證錯誤
const [validationError, setValidationError] = useState<string | null>(null)

// ✅ 好：單一圖片的載入狀態
const [imageLoaded, setImageLoaded] = useState(false)
```

#### 4. **動畫和過渡狀態**
控制動畫效果的狀態

```typescript
// ✅ 好：動畫進行中
const [isAnimating, setIsAnimating] = useState(false)

// ✅ 好：過渡階段
const [transitionStage, setTransitionStage] = useState<'entering' | 'entered' | 'exiting'>('entering')
```

#### 5. **組件內部的計算緩存**
只在組件內使用的派生狀態

```typescript
// ✅ 好：組件內的過濾結果
const [filteredItems, setFilteredItems] = useState<Item[]>([])

// ✅ 好：組件內的排序狀態
const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
```

---

### ❌ 不應該使用本地狀態的情況

#### 1. **需要在多個組件間共享的數據**

```typescript
// ❌ 壞：用戶資料應該是全局狀態
const ComponentA = () => {
  const [user, setUser] = useState(null)
  // ComponentB 也需要這個數據！
}

// ✅ 好：使用 Provider
const { user } = useUser() // 從 UserProvider 獲取
```

#### 2. **需要持久化的數據**

```typescript
// ❌ 壞：設定應該持久化
const Settings = () => {
  const [theme, setTheme] = useState('light')
  // 刷新頁面後會丟失！
}

// ✅ 好：使用 Provider + localStorage
const { theme, setTheme } = useTheme() // Provider 處理持久化
```

#### 3. **影響全局行為的狀態**

```typescript
// ❌ 壞：認證狀態應該是全局的
const LoginButton = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  // 其他組件無法知道用戶是否登入！
}

// ✅ 好：使用 Provider
const { isAuthenticated } = useAuth()
```

#### 4. **需要在路由間保持的狀態**

```typescript
// ❌ 壞：購物車狀態會在切換頁面時丟失
const ProductPage = () => {
  const [cart, setCart] = useState([])
  // 切換到其他頁面時狀態消失！
}

// ✅ 好：使用 Provider
const { cart, addToCart } = useCart()
```

#### 5. **複雜的業務邏輯狀態**

```typescript
// ❌ 壞：複雜的狀態管理應該提取
const ComplexForm = () => {
  const [step, setStep] = useState(1)
  const [data, setData] = useState({})
  const [errors, setErrors] = useState({})
  const [isValidating, setIsValidating] = useState(false)
  // 太複雜了！
}

// ✅ 好：提取為 custom hook 或 Provider
const { step, data, errors, isValidating, nextStep, validate } = useFormWizard()
```

---

## 好的本地狀態範例

### 範例 1：展開/收起面板

```typescript
// ✅ 完美的本地狀態使用
function AccordionPanel({ title, children }: AccordionPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  
  return (
    <div>
      <button onClick={() => setIsExpanded(!isExpanded)}>
        {title}
      </button>
      {isExpanded && <div>{children}</div>}
    </div>
  )
}

// 為什麼這是好的本地狀態？
// ✅ 只影響這個組件的視覺呈現
// ✅ 不需要在其他地方訪問
// ✅ 組件卸載時狀態消失是合理的
```

### 範例 2：輸入框的臨時值

```typescript
// ✅ 完美的本地狀態使用
function SearchBox({ onSearch }: SearchBoxProps) {
  const [query, setQuery] = useState('')
  
  const handleSubmit = () => {
    onSearch(query) // 提交時才傳遞給父組件
  }
  
  return (
    <div>
      <input 
        value={query} 
        onChange={(e) => setQuery(e.target.value)} 
      />
      <button onClick={handleSubmit}>搜索</button>
    </div>
  )
}

// 為什麼這是好的本地狀態？
// ✅ 臨時輸入，尚未提交
// ✅ 只在這個組件內使用
// ✅ 提交後通過 callback 傳遞給父組件
```

### 範例 3：模態框的顯示狀態

```typescript
// ✅ 完美的本地狀態使用
function DeleteButton({ onDelete, itemName }: DeleteButtonProps) {
  const [showConfirm, setShowConfirm] = useState(false)
  
  const handleConfirm = () => {
    onDelete()
    setShowConfirm(false)
  }
  
  return (
    <>
      <button onClick={() => setShowConfirm(true)}>刪除</button>
      {showConfirm && (
        <ConfirmDialog
          message={`確定要刪除 ${itemName}？`}
          onConfirm={handleConfirm}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </>
  )
}

// 為什麼這是好的本地狀態？
// ✅ 只控制這個按鈕的確認對話框
// ✅ 不需要在其他地方知道對話框是否顯示
// ✅ 對話框關閉後狀態重置是合理的
```

### 範例 4：表單的編輯模式

```typescript
// ✅ 完美的本地狀態使用
function EditableField({ value, onSave }: EditableFieldProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editedValue, setEditedValue] = useState(value)
  
  const handleSave = () => {
    onSave(editedValue)
    setIsEditing(false)
  }
  
  if (isEditing) {
    return (
      <div>
        <input 
          value={editedValue} 
          onChange={(e) => setEditedValue(e.target.value)} 
        />
        <button onClick={handleSave}>保存</button>
        <button onClick={() => setIsEditing(false)}>取消</button>
      </div>
    )
  }
  
  return (
    <div>
      <span>{value}</span>
      <button onClick={() => setIsEditing(true)}>編輯</button>
    </div>
  )
}

// 為什麼這是好的本地狀態？
// ✅ 編輯模式只影響這個欄位
// ✅ 臨時編輯值只在編輯時需要
// ✅ 保存後通過 callback 傳遞給父組件
```

---

## 壞的本地狀態範例

### 範例 1：用戶資料（應該是全局）

```typescript
// ❌ 壞：用戶資料應該是全局狀態
function UserProfile() {
  const [user, setUser] = useState(null)
  
  useEffect(() => {
    fetchUser().then(setUser)
  }, [])
  
  return <div>{user?.name}</div>
}

function UserAvatar() {
  const [user, setUser] = useState(null) // 重複！
  
  useEffect(() => {
    fetchUser().then(setUser) // 重複請求！
  }, [])
  
  return <img src={user?.avatar} />
}

// 問題：
// ❌ 用戶資料在兩個組件中重複
// ❌ 發送了兩次相同的請求
// ❌ 狀態不同步

// ✅ 正確做法：使用 Provider
function UserProfile() {
  const { user } = useUser() // 從 Provider 獲取
  return <div>{user?.name}</div>
}

function UserAvatar() {
  const { user } = useUser() // 共享同一個狀態
  return <img src={user?.avatar} />
}
```

### 範例 2：主題設定（應該持久化）

```typescript
// ❌ 壞：主題設定應該持久化
function ThemeToggle() {
  const [theme, setTheme] = useState('light')
  
  return (
    <button onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
      切換主題
    </button>
  )
}

// 問題：
// ❌ 刷新頁面後主題重置
// ❌ 其他組件無法知道當前主題
// ❌ 無法應用到整個應用

// ✅ 正確做法：使用 Provider + localStorage
function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  return <button onClick={toggleTheme}>切換主題</button>
}
```

### 範例 3：過度使用本地狀態

```typescript
// ❌ 壞：太多相關的本地狀態
function ComplexForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [country, setCountry] = useState('')
  const [nameError, setNameError] = useState('')
  const [emailError, setEmailError] = useState('')
  const [phoneError, setPhoneError] = useState('')
  // ... 太多了！
}

// 問題：
// ❌ 狀態管理過於複雜
// ❌ 難以維護
// ❌ 缺乏結構

// ✅ 正確做法：合併相關狀態
function ComplexForm() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    country: ''
  })
  
  const [errors, setErrors] = useState<Record<string, string>>({})
  
  // 或者更好：提取為 custom hook
  const { data, errors, updateField, validate } = useFormState(initialData)
}
```

---

## 決策流程圖

```
開始：我需要一個狀態
    ↓
這個狀態需要在多個不相關的組件間共享嗎？
    ├─ 是 → 使用全局狀態 (Provider)
    └─ 否 ↓
這個狀態需要在路由切換後保持嗎？
    ├─ 是 → 使用全局狀態 (Provider)
    └─ 否 ↓
這個狀態需要持久化（localStorage/sessionStorage）嗎？
    ├─ 是 → 使用全局狀態 (Provider)
    └─ 否 ↓
這個狀態影響全局行為或業務邏輯嗎？
    ├─ 是 → 使用全局狀態 (Provider)
    └─ 否 ↓
這個狀態只是 UI 相關或臨時輸入嗎？
    ├─ 是 → ✅ 使用本地狀態 (useState)
    └─ 否 → 重新評估需求
```

---

## 實際案例分析

### 案例 1：Clinical Insights Feature

```typescript
// ✅ 好的本地狀態
const ClinicalInsightsFeature = () => {
  // 本地 UI 狀態
  const [activeTabId, setActiveTabId] = useState<string>("")
  const [isEditMode, setIsEditMode] = useState(false)
  
  // 全局狀態（從 Provider）
  const { panels } = useClinicalInsightsConfig()
  const { responses } = useInsightGeneration()
  
  // ...
}

// 為什麼這樣分配？
// ✅ activeTabId: 只影響當前顯示的 tab（本地）
// ✅ isEditMode: 只影響當前的編輯模式（本地）
// ✅ panels: 需要持久化和在設定中修改（全局）
// ✅ responses: 需要在多個 panel 間共享（全局）
```

### 案例 2：Medical Chat

```typescript
// ✅ 好的本地狀態
const MedicalChat = () => {
  // 本地 UI 狀態
  const [isAgentMode, setIsAgentMode] = useState(false)
  const [showApiKeyWarning, setShowApiKeyWarning] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  
  // 全局狀態（從 Provider）
  const { chatMessages } = useChatMessages()
  const { model } = useModelSelection()
  
  // ...
}

// 為什麼這樣分配？
// ✅ isAgentMode: 只影響當前聊天的模式（本地）
// ✅ showApiKeyWarning: 只影響警告的顯示（本地）
// ✅ isExpanded: 只影響聊天框的大小（本地）
// ✅ chatMessages: 需要在多個組件間共享（全局）
// ✅ model: 需要在整個應用中使用（全局）
```

### 案例 3：Search Box

```typescript
// ✅ 好的本地狀態
const SearchBox = ({ onSearch }: SearchBoxProps) => {
  // 本地臨時狀態
  const [query, setQuery] = useState('')
  const [isFocused, setIsFocused] = useState(false)
  
  const handleSubmit = () => {
    onSearch(query) // 提交時才傳遞給父組件
  }
  
  return (
    <input
      value={query}
      onChange={(e) => setQuery(e.target.value)}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
    />
  )
}

// 為什麼這樣分配？
// ✅ query: 臨時輸入，提交前不需要共享（本地）
// ✅ isFocused: 只影響輸入框的樣式（本地）
// ✅ 提交後通過 callback 傳遞，讓父組件決定如何處理
```

---

## 最佳實踐

### 1. **優先使用本地狀態**

```typescript
// ✅ 好：從本地開始
function Component() {
  const [isOpen, setIsOpen] = useState(false)
  // 如果後來發現需要共享，再提升到 Provider
}

// 不要一開始就創建 Provider
```

### 2. **狀態提升 (Lifting State Up)**

```typescript
// 當多個子組件需要共享狀態時，提升到共同的父組件

// ❌ 壞：在子組件中重複狀態
function ChildA() {
  const [value, setValue] = useState('')
}
function ChildB() {
  const [value, setValue] = useState('') // 重複！
}

// ✅ 好：提升到父組件
function Parent() {
  const [value, setValue] = useState('')
  return (
    <>
      <ChildA value={value} onChange={setValue} />
      <ChildB value={value} onChange={setValue} />
    </>
  )
}
```

### 3. **使用 Custom Hooks 封裝複雜的本地狀態**

```typescript
// ✅ 好：提取複雜的本地狀態邏輯
function useFormState(initialData: FormData) {
  const [data, setData] = useState(initialData)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isDirty, setIsDirty] = useState(false)
  
  const updateField = (field: string, value: any) => {
    setData(prev => ({ ...prev, [field]: value }))
    setIsDirty(true)
  }
  
  const validate = () => {
    // 驗證邏輯
  }
  
  return { data, errors, isDirty, updateField, validate }
}

// 使用
function Form() {
  const form = useFormState(initialData)
  // 清晰且可重用
}
```

### 4. **避免 Prop Drilling**

```typescript
// ❌ 壞：Prop Drilling
function GrandParent() {
  const [value, setValue] = useState('')
  return <Parent value={value} setValue={setValue} />
}
function Parent({ value, setValue }) {
  return <Child value={value} setValue={setValue} />
}
function Child({ value, setValue }) {
  return <input value={value} onChange={e => setValue(e.target.value)} />
}

// ✅ 好：使用 Context（如果需要深層傳遞）
const ValueContext = createContext()

function GrandParent() {
  const [value, setValue] = useState('')
  return (
    <ValueContext.Provider value={{ value, setValue }}>
      <Parent />
    </ValueContext.Provider>
  )
}
function Child() {
  const { value, setValue } = useContext(ValueContext)
  return <input value={value} onChange={e => setValue(e.target.value)} />
}
```

### 5. **文檔化狀態的用途**

```typescript
// ✅ 好：清楚說明狀態的用途
function Component() {
  // UI State: Controls the visibility of the modal
  const [showModal, setShowModal] = useState(false)
  
  // Temporary Input: User's draft before submission
  const [draft, setDraft] = useState('')
  
  // Loading State: Specific to this component's submit action
  const [isSubmitting, setIsSubmitting] = useState(false)
}
```

---

## 🎓 總結

### 本地狀態的黃金法則

1. **只影響單一組件** → 本地狀態 ✅
2. **需要在多個組件間共享** → 全局狀態 ✅
3. **臨時輸入，尚未提交** → 本地狀態 ✅
4. **需要持久化** → 全局狀態 ✅
5. **純 UI 狀態** → 本地狀態 ✅
6. **業務邏輯狀態** → 全局狀態 ✅

### 記住

- **本地狀態不是壞事** - 它是 React 的核心特性
- **不要過度使用全局狀態** - 會增加複雜度
- **從本地開始，需要時再提升** - 遵循 YAGNI 原則
- **使用 Custom Hooks** - 封裝複雜的本地狀態邏輯

---

## 📚 相關資源

- [SSOT_COMPLIANCE_CHECKLIST.md](./SSOT_COMPLIANCE_CHECKLIST.md) - SSOT 檢查清單
- [STATE_FLOW_DIAGRAM.md](./STATE_FLOW_DIAGRAM.md) - 狀態流程圖
- [React 官方文檔 - State](https://react.dev/learn/state-a-components-memory)
- [React 官方文檔 - Lifting State Up](https://react.dev/learn/sharing-state-between-components)
