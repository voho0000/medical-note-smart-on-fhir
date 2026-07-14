# Prompt Gallery 功能說明

> 現行規格｜基準版本：v0.40.0｜最後核對：2026-07-14

Prompt Gallery 是 Firestore-backed 的共享提示詞目錄。相同 prompt 可用於 Medical Chat、Medical Summary 的自訂摘要模組，或同時支援兩者；Gallery 本身不執行 AI。

## 目前能力

- 瀏覽全部範本與「我的範本」。
- 依用途、類別、專科、受眾、關鍵字與標籤篩選。
- 依最新或 usage count 排序，前端每頁顯示 8 筆。
- 預覽 prompt 後加入 chat template 或 custom summary module。
- 分享個人範本；可設定作者顯示或匿名。
- 編輯／刪除自己分享的範本，並追蹤使用次數。
- Medical／patient audience 自動套用到查詢。
- 相容舊資料的 `insight` type，讀取時正規化成 `summary`。

讀取上限目前為 100 筆；關鍵字、tags、audience 與部分複合 filter 在 client 端完成。

## 資料模型

```ts
type PromptType = 'chat' | 'summary'
type PromptAudience = 'medical' | 'patient'

interface SharedPrompt {
  id: string
  title: string
  description?: string
  prompt: string
  types: PromptType[]
  category: PromptCategory
  specialty: PromptSpecialty[]
  audience: PromptAudience[]
  tags: string[]
  createdAt: Date
  updatedAt: Date
  authorId?: string
  authorName?: string
  isAnonymous?: boolean
  usageCount?: number
}
```

用途：

- `chat`：加入／套用 Medical Chat template。
- `summary`：加入 Medical Summary 的自訂摘要模組。
- 同時包含兩者：使用者在目標不明時選擇用途。

分類 `category`：`soap`、`admission`、`discharge`、`safety`、`summary`、`progress`、`consult`、`procedure`、`other`。

專科 `specialty` 支援 general、內外科、急診、小兒、婦產、精神、神經、復健、麻醉、眼科、皮膚、泌尿、骨科、耳鼻喉、放射診斷／腫瘤、病理、核醫、整外、家醫與 other。

## Firestore

Collection：

```text
sharedPrompts/{promptId}
```

寫入時使用 Firestore `Timestamp`，usage 以 atomic `increment(1)` 增加。Gallery service 提供：

- `getSharedPrompts(filter?, sort?)`
- `getMySharedPrompts(userId, filter?, sort?)`
- `getSharedPrompt(id)`
- `createSharedPrompt(prompt)`
- `updateSharedPrompt(id, updates)`
- `deleteSharedPrompt(id)`
- `incrementPromptUsage(id)`

`usePromptGallery()` 管理 loading、error、filter、sort、refetch 與本地 usage count 更新。

## 查詢限制與相容層

Firestore 一個 query 只能使用一個 `array-contains`。目前策略：

- 一般 type 優先在 server filter。
- `summary` 為了相容舊 `insight` 與 upgraded built-ins，先廣泛讀取再 client filter。
- type 已占用 `array-contains` 時，specialty 在 client filter。
- audience、search、tags 在 client filter。

舊資料規則：

- `types: ['insight']` 讀成 `summary`。
- 缺少／空的 audience 讀成 `['medical']`。
- 一組早期內建 patient prompts 會依 id 補上 `summary`，不需先做 production migration。

新的文件只寫 `chat`／`summary`，不得再寫 `insight`。

## UI 整合

### Medical Chat

`PromptGalleryDialog` 以 `mode="chat"` 開啟。選取後可立即插入或加入個人 template；template 的 Firestore／localStorage 行為見 [MEDICAL_CHAT.md](MEDICAL_CHAT.md)。

### Medical Summary

自訂摘要管理 drawer 以 `mode="summary"` 開啟。選取 prompt 後建立 custom module，使用者可控制名稱、順序、auto-generate 與是否顯示在 summary。

Gallery 的 shared prompt 與使用者自己的 module 是不同資料：前者是公開目錄，後者儲存在使用者 collection／localStorage，修改 module 不會回寫 shared prompt。

## 權限與安全

前端 login guard 只改善 UX，不是存取控制。正式 Firestore Rules 必須：

- 公開 read 的範圍符合產品政策。
- create 時 `authorId == request.auth.uid`。
- update／delete 僅允許原作者或管理者。
- 限制可寫欄位、型別、字串長度、array 大小與 usageCount 變更方式。
- 禁止在 prompt／description 放入病人識別資訊。

Rules 位於獨立 `firebase-smart-on-fhir` repo；本 app repo 的 TypeScript 型別不能取代 server-side validation。

## 新增整合點

```tsx
<PromptGalleryDialog
  open={open}
  onOpenChange={setOpen}
  mode="chat"
  onSelectPrompt={(prompt, useAs) => {
    // 將 prompt.prompt 轉成目標 feature 的本地資料
  }}
/>
```

整合時：

1. 明確指定 `mode`，避免不相容 prompt。
2. 用目前 audience 初始化 filter。
3. 在真正採用 prompt 時呼叫 `trackUsage()`，不是只在 preview 時增加。
4. 若目標需要登入，顯示 `LoginRequiredDialog`，不要讓 Firestore error 當流程控制。

## 主要檔案

| 檔案 | 責任 |
|---|---|
| `types/prompt.types.ts` | schema type 與 legacy normalization |
| `services/prompt-gallery.service.ts` | Firestore CRUD／query |
| `hooks/usePromptGallery.ts` | UI state 與 service facade |
| `components/PromptGalleryDialog.tsx` | tabs、filter、sort、pagination |
| `components/PromptPreviewDialog.tsx` | 預覽與使用 |
| `components/SharePromptDialog.tsx` | 分享表單 |

## 測試重點

- legacy `insight` 與 missing audience normalization。
- type + specialty 的 client/server filter 組合。
- audience 切換後結果更新。
- 搜尋涵蓋 title、description、prompt、author、tags。
- 未登入時「我的範本」與分享流程正確受限。
- 同時支援 chat／summary 的 prompt 使用目標正確。
- usage increment 失敗不阻斷主要使用流程。

## 疑難排解

### Gallery 空白

檢查 Firebase public config、Firestore Rules、collection 名稱與瀏覽器 console。若只有 summary 空白，確認舊資料 types 是否可由 normalization 讀取。

### Compound query 需要 index

依 Firebase 回傳連結在後端 repo 建立 index；不要移除必要 filter 來繞過權限或資料隔離。

### 新分享沒有出現在目前頁面

確認目前 audience／type／category／specialty filter，並呼叫 `fetchPrompts()`；Gallery 不是 `onSnapshot` 即時 subscription。

## 相關文件

- [Medical Chat](MEDICAL_CHAT.md)
- [Feature modules](FEATURES.md)
- [Security](SECURITY.md)
