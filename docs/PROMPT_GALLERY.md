# Prompt Gallery 功能說明

## 概述

Prompt Gallery 是一個完整的 Prompt 範本分享平台，讓使用者可以分享、瀏覽和使用 Prompt 範本。此功能整合了 Chat Templates 和 Clinical Insights，提供一致且友善的使用體驗。

## 功能特色

### 1. 完整的分享功能
- **匿名分享**：可選擇匿名或實名分享
- **多類型支援**：Chat、Insight 或兩者皆可
- **豐富的分類**：SOAP、入院、出院、安全警示、臨床摘要等
- **科別標籤**：內科、外科、急診、小兒科等
- **自訂標籤**：支援多個自訂標籤
- **作者管理**：作者可刪除自己分享的 Prompt

### 2. 強大的搜尋和篩選
- **全文搜尋**：搜尋標題、描述、內容、作者和標籤
- **類型篩選**：依 Chat/Insight 篩選
- **分類篩選**：依臨床分類篩選
- **科別篩選**：依專科篩選
- **排序功能**：最新優先或熱門優先（依使用次數）

### 3. 智能使用邏輯
- **多類型選擇**：當 Prompt 有多個類型時，可選擇使用方式
- **自動整合**：選擇後自動加入 Chat Templates 或 Clinical Insights
- **使用統計**：追蹤每個 Prompt 的使用次數
- **即時更新**：列表自動更新

### 4. 登入保護機制
- **分享功能**：需要登入才能分享 Prompt
- **儲存功能**：需要登入才能儲存模板到帳號
- **友善提示**：未登入時顯示鎖圖示和說明
- **無縫登入**：一鍵導航到登入對話框
- **瀏覽開放**：所有人都可以瀏覽範本庫（包括未登入使用者）

## 使用方式

### 分享 Prompt

#### 從 Chat Templates 分享
1. 進入 Settings > Chat Templates
2. 編輯您的模板
3. 點擊「分享」按鈕（需要登入）
4. 填寫標題、描述、選擇類型和分類
5. 選擇是否匿名分享
6. 點擊「分享」完成

#### 從 Clinical Insights 分享
1. 進入 Settings > Clinical Insights 或 Clinical Insights 頁面
2. 點擊「分享模板」按鈕（需要登入）
3. 填寫相關資訊並分享

### 瀏覽和使用 Prompt

#### 從 Chat Templates 瀏覽
1. 進入 Settings > Chat Templates
2. 點擊「瀏覽範本庫」按鈕
3. 使用搜尋和篩選找到合適的 Prompt
4. 點擊「預覽」查看詳細內容
5. 點擊「使用」，會自動建立一個新的 Chat Template

#### 從 Clinical Insights 瀏覽
1. 進入 Settings > Clinical Insights 或 Clinical Insights 頁面
2. 點擊「瀏覽範本庫」
3. 選擇 Prompt 後會自動更新當前標籤的內容

#### 多類型 Prompt 的使用
當 Prompt 同時支援 Chat 和 Insight 時：
1. 點擊「使用」按鈕會顯示下拉選單
2. 選擇「使用為 Chat Template」或「使用為 Clinical Insight」
3. 系統會根據您的選擇自動整合到對應位置

## 資料結構

### SharedPrompt 類型

```typescript
interface SharedPrompt {
  id: string
  title: string
  description?: string
  prompt: string
  
  // 分類
  types: ('chat' | 'insight')[]  // 支援多類型
  category: 'soap' | 'admission' | 'discharge' | 'safety' | 'summary' | ...
  specialties: ('general' | 'internal' | 'surgery' | 'emergency' | ...)[]
  tags: string[]
  
  // 作者資訊
  authorId: string
  authorName: string
  isAnonymous: boolean  // 是否匿名分享
  
  // 元資料
  createdAt: Date
  updatedAt: Date
  usageCount: number
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
    types: string[]  // ['chat', 'insight']
    category: string
    specialties: string[]
    tags: string[]
    authorId: string
    authorName: string
    isAnonymous: boolean
    createdAt: Timestamp
    updatedAt: Timestamp
    usageCount: number
```

## 元件架構

```
features/prompt-gallery/
├── types/
│   └── prompt.types.ts              # 類型定義
├── services/
│   └── prompt-gallery.service.ts    # Firestore CRUD 操作
├── hooks/
│   └── usePromptGallery.ts          # 狀態管理 Hook
├── components/
│   ├── PromptCard.tsx               # Prompt 卡片元件
│   ├── PromptFilters.tsx            # 篩選和排序控制
│   ├── PromptPreviewDialog.tsx      # 預覽對話框
│   ├── PromptGalleryDialog.tsx      # 主對話框（整合所有功能）
│   ├── SharePromptDialog.tsx        # 分享 Prompt 對話框
│   ├── LoginRequiredDialog.tsx      # 登入提示對話框
│   └── index.ts                     # 元件匯出
└── index.ts                         # 功能匯出
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

## Firestore 安全規則

```javascript
match /sharedPrompts/{promptId} {
  // 所有人可以讀取（包括未登入使用者）
  allow read: if true;
  
  // 只有登入使用者可以建立
  allow create: if request.auth != null;
  
  // 只有作者可以更新
  allow update: if request.auth != null && request.auth.uid == resource.data.authorId;
  
  // 只有作者可以刪除
  allow delete: if request.auth != null && request.auth.uid == resource.data.authorId;
}
```

## 注意事項

1. **隱私保護**：確保分享的 Prompt 不包含病患資訊
2. **權限控制**：
   - 所有人都可以瀏覽範本庫（包括未登入使用者）
   - 只有登入使用者可以分享 Prompt
   - 只有作者可以修改或刪除自己的 Prompt
3. **資料驗證**：建立 Prompt 時應驗證必填欄位
4. **效能考量**：使用 Firestore 查詢限制（limit: 100）
5. **匿名分享**：即使匿名分享，仍保留 authorId 用於刪除權限

## 測試

建議測試項目：

1. ✅ 開啟 Gallery Dialog
2. ✅ 搜尋功能（標題、描述、內容、作者、標籤）
3. ✅ 篩選功能（類型、分類、科別）
4. ✅ 排序功能（最新優先、熱門優先）
5. ✅ 預覽 Prompt
6. ✅ 分享 Prompt（匿名/實名）
7. ✅ 選擇 Prompt（Chat 模式）
8. ✅ 選擇 Prompt（Insight 模式）
9. ✅ 多類型 Prompt 的使用選擇
10. ✅ 使用次數追蹤
11. ✅ 作者刪除功能
12. ✅ 未登入鎖定功能（分享、儲存）
13. ✅ 登入對話框導航
14. ✅ 響應式設計（手機、平板、桌面）

## 疑難排解

### Firestore 權限錯誤
確保 Firestore 規則允許讀取 `sharedPrompts` collection

### 無法載入 Prompts
檢查 Firebase 配置和網路連線

### 類型錯誤
確保 TypeScript 版本和相依套件版本正確
