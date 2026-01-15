# Prompt Gallery 功能說明

## 概述

Prompt Gallery 是一個統一的 Prompt 範本庫，讓使用者可以瀏覽和使用預先建立的 Prompt。此功能整合了 Chat Prompts 和 Clinical Insights，提供一致的使用體驗。

## 功能特色

### 1. 統一的資料結構
- **類型區分**：Chat（對話）、Insight（洞察）、Both（兩者皆可）
- **分類系統**：SOAP、入院、出院、安全警示、臨床摘要等
- **科別標籤**：內科、外科、急診、小兒科等
- **自訂標籤**：支援多個自訂標籤

### 2. 強大的搜尋和篩選
- **關鍵字搜尋**：搜尋標題、描述和標籤
- **類型篩選**：依 Chat/Insight/Both 篩選
- **分類篩選**：依臨床分類篩選
- **科別篩選**：依專科篩選

### 3. 使用統計
- 追蹤每個 Prompt 的使用次數
- 顯示建立時間
- 未來可擴展評分和評論功能

## 使用方式

### 從 Chat 開啟

1. 在 Medical Chat 的工具列中
2. 點擊「設定」下拉選單
3. 選擇「瀏覽範本庫」
4. 瀏覽並選擇 Prompt
5. Prompt 內容會自動插入到輸入框

### 從 Settings 開啟

1. 進入 Settings > Prompt Templates
2. 點擊「瀏覽範本庫」按鈕
3. 選擇 Prompt
4. 會自動建立一個新的範本

## 資料結構

### SharedPrompt 類型

```typescript
interface SharedPrompt {
  id: string
  title: string
  description?: string
  prompt: string
  
  // 分類
  type: 'chat' | 'insight' | 'both'
  category: 'soap' | 'admission' | 'discharge' | 'safety' | 'summary' | ...
  specialty: ('general' | 'internal' | 'surgery' | 'emergency' | ...)[]
  tags: string[]
  
  // 元資料
  createdAt: Date
  updatedAt: Date
  usageCount?: number
}
```

## Firestore 結構

### Collection: `sharedPrompts`

```
sharedPrompts/
  {promptId}/
    title: string
    description?: string
    prompt: string
    type: 'chat' | 'insight' | 'both'
    category: string
    specialty: string[]
    tags: string[]
    createdAt: Timestamp
    updatedAt: Timestamp
    usageCount: number
```

## 元件架構

```
features/prompt-gallery/
├── types/
│   └── prompt.types.ts          # 類型定義
├── services/
│   └── prompt-gallery.service.ts # Firestore CRUD 操作
├── hooks/
│   └── usePromptGallery.ts      # 狀態管理 Hook
├── components/
│   ├── PromptCard.tsx           # Prompt 卡片
│   ├── PromptFilters.tsx        # 篩選控制
│   ├── PromptPreviewDialog.tsx  # 預覽對話框
│   └── PromptGalleryDialog.tsx  # 主對話框
└── index.ts                     # 匯出
```

## API 說明

### Service Functions

#### `getSharedPrompts(filter?, sort?)`
取得所有符合條件的 Prompts

#### `getSharedPrompt(id)`
取得單一 Prompt

#### `createSharedPrompt(prompt)`
建立新的 Prompt

#### `updateSharedPrompt(id, updates)`
更新 Prompt

#### `deleteSharedPrompt(id)`
刪除 Prompt

#### `incrementPromptUsage(id)`
增加使用次數

### Hook: usePromptGallery

```typescript
const {
  prompts,           // Prompt 列表
  loading,           // 載入狀態
  error,             // 錯誤訊息
  filter,            // 目前篩選條件
  sort,              // 目前排序
  updateFilter,      // 更新篩選
  clearFilter,       // 清除篩選
  updateSort,        // 更新排序
  fetchPrompts,      // 重新取得
  trackUsage,        // 追蹤使用
} = usePromptGallery(initialFilter?)
```

## 整合說明

### 整合到新的元件

```typescript
import { PromptGalleryDialog } from '@/features/prompt-gallery'
import type { SharedPrompt } from '@/features/prompt-gallery'

function MyComponent() {
  const [showGallery, setShowGallery] = useState(false)
  
  const handleSelectPrompt = (prompt: SharedPrompt) => {
    // 處理選擇的 Prompt
    console.log(prompt.prompt)
  }
  
  return (
    <>
      <Button onClick={() => setShowGallery(true)}>
        開啟 Prompt Gallery
      </Button>
      
      <PromptGalleryDialog
        open={showGallery}
        onOpenChange={setShowGallery}
        mode="chat" // 或 "insight" 或 "all"
        onSelectPrompt={handleSelectPrompt}
      />
    </>
  )
}
```

## 未來擴展

目前實作不包含社群功能，但架構已預留擴展空間：

### Phase 2: 社群功能（未實作）
- 使用者分享 Prompt
- 評分和評論系統
- 點讚和收藏
- 檢舉機制

### Phase 3: 進階功能（未實作）
- Prompt 版本控制
- 協作編輯
- AI 推薦相似 Prompts
- 使用分析和統計

## 注意事項

1. **隱私保護**：確保分享的 Prompt 不包含病患資訊
2. **權限控制**：目前所有登入使用者都可以讀取 Prompts
3. **資料驗證**：建立 Prompt 時應驗證必填欄位
4. **效能考量**：使用 Firestore 查詢限制（limit: 100）

## 測試

建議測試項目：

1. ✅ 開啟 Gallery Dialog
2. ✅ 搜尋功能
3. ✅ 篩選功能
4. ✅ 預覽 Prompt
5. ✅ 選擇 Prompt（Chat 模式）
6. ✅ 選擇 Prompt（Settings 模式）
7. ✅ 使用次數追蹤
8. ✅ 響應式設計（手機、平板、桌面）

## 疑難排解

### Firestore 權限錯誤
確保 Firestore 規則允許讀取 `sharedPrompts` collection

### 無法載入 Prompts
檢查 Firebase 配置和網路連線

### 類型錯誤
確保 TypeScript 版本和相依套件版本正確
