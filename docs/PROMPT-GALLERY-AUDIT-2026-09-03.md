# Prompt Gallery 與分享功能 audit

日期：2026-09-03。範圍：目前工作目錄中的 Gallery、篩選、預覽、發布、對話／自訂摘要套用，以及相鄰 Firebase 專案的分享規則。初次稽核只使用程式碼與本機重現；同日已另行驗證並部署 Prompt Gallery 所需的正式 Firestore 規則，未讀寫正式分享資料。

使用情境：醫療人員或民眾尋找可重用的範本，閱讀完整內容，再套用或分享；範本的內容、用途、作者顯示與完成狀態應可靠且清楚。

## 修正結果（同日）

以下 10 項缺陷已在本機程式與相鄰 Firebase 專案完成修正。Prompt 沒有新增字數上限，也不會為了儲存而截斷全文。Firestore 規則已部署；前端已納入本文件所在的發布提交，由 `master` 的自動流程發佈。

| 項目 | 已完成的修正 |
|---|---|
| F01 | 分享建立／更新驗證資料結構；列表逐筆隔離既存錯誤資料，避免一筆資料使整個搜尋失敗。 |
| F02 | 移除 email 補作公開作者名稱的行為；沒有顯示名稱時使用匿名，有名稱時顯示實際公開署名。 |
| F03 | 公開分享與個人對話／摘要範本皆支援分塊儲存及完整讀回；全文準備完成才更新父文件。讀取失敗可重試，尚未取得全文時不能套用。 |
| F04 | 長單行會換行，預覽文字區固定高度且可獨立捲動；手機、桌機的關閉／使用按鈕維持可見。 |
| F05 | 使用游標讀完符合伺服器條件的所有頁面，再做完整篩選／排序；搜尋可比對長文後段，不再限於前 100 筆。 |
| F06 | 忽略過期請求的結果、錯誤與完成狀態；搜尋延遲 250 ms 合併輸入。Gallery 關閉或分頁未作用時不查詢。 |
| F07 | 成功後立即關閉並顯示通知，移除可能關掉下一份草稿的延遲計時器；失敗保留當次完整草稿。 |
| F08 | 從摘要 Gallery 建立分享時，預設用途改為摘要。 |
| F09 | 規則將作者內容修改與使用計數分開；作者也只能透過既有計數流程增加 1，不能直接任意設定數值。 |
| F10 | 卡片支援 Tab、Enter、Space 及可見焦點；關閉預覽返回原卡片。補上文字捲動區、篩選移除與分頁按鈕的無障礙名稱。 |

### 長文儲存與相容性

- 新增不可變的 `templateBodies/{bodyId}` 全文版本與 `chunks` 子集合。每塊 200,000 UTF-8 bytes、每批最多 20 塊是傳輸大小，並非整份 Prompt 的上限；Unicode 字元不會在分塊邊界被切斷。
- 新版仍能讀取既有內嵌全文文件。超過單塊大小的公開文件只保留 180 字元列表摘要與全文參照；預覽、套用及全文搜尋會讀取全文。個人對話／摘要同步也使用相同儲存方式。
- 先寫分塊、再標記完成、最後更新父文件；中途失敗保留原版本。規則禁止刪除仍被公開或私人父文件引用的內容，即使寫入已成功、回覆卻遺失，也不會被失敗清理刪掉。
- 未公開的內容只供擁有者讀取，私人匯入內容一直維持私人。失敗清理會盡力移除暫存分塊；若網路持續中斷，可能留下未公開的暫存文件，日後可另設清理工作。
- 列表目前會讀完整 metadata 集合，因此資料規模很大時仍有讀取成本；完整關鍵字搜尋亦可能需要下載全文。這次先確保搜尋完整，專用全文索引可在資料量增加後另行導入。

### 上線順序

1. 先部署相鄰 `firebase-smart-on-fhir` 專案的 Prompt Gallery 規則，保留既有正式規則中的其他功能。此步驟已於 2026-09-03 完成。
2. 再發布本次前端，並要求舊頁面重新載入。此步驟由本文件所在的 `master` 提交觸發。舊前端不認識分塊參照，不能正確讀取新格式；新版可讀舊格式，反向不相容。舊頁面也不應在發布後繼續編輯個人範本。
3. 以測試帳號驗證登入分享、匿名署名、長文預覽、對話／摘要匯入及重新登入後的完整讀回。

本輪沒有讀寫正式分享資料或遷移既存作者名稱。正式環境的索引與舊資料品質仍需在前端上線後以測試帳號確認。

### 修正後驗證

- 11 組、84 項前端／資料服務／個人同步測試通過。包含同名但不同 ID 的獨立操作、101 筆資料的完整搜尋與熱門排序、過期請求、分享時序、匿名作者、摘要入口、鍵盤與焦點、讀取重試、超過 1 MiB 的中英／emoji／HTML 全文及分批寫入失敗復原。
- 42 項 Firestore 規則測試通過，使用獨立本機 `demo-gallery-sharing` 模擬環境；涵蓋資料驗證、作者權限、計數、完整長文讀回、公開前保密與私人內容保護。
- 相關檔案 ESLint、前端 `git diff --check` 及 production build（含 TypeScript）通過。
- 真實瀏覽器確認 320、390、430、768、1024、1440 px 六種寬度，以及 740 × 390 手機橫向。約 10 萬字元的無空白單行不再撐寬版面，捲動可到尾端；鍵盤 PageDown／End 也能捲動。
- 分享編輯器以 540,000 字元合成內容展開編輯，增加文字後共 540,009 字元；在 320 px 收合返回表單仍完整保留，輸入框沒有 `maxLength`。本機驗證頁面已移除，不包含在正式建置中。
- 本輪使用淺色介面；未重跑深色主題的完整六尺寸矩陣。

作者編輯／另存副本入口，以及一般關閉後仍保留未發布草稿，仍屬後續產品改善；這次修正的是前次分享計時器導致的新草稿遺失與提交失敗保留。使用計數仍採用目前的每次 +1 模式，尚未加入每帳號防重複計數。

### 使用者要求再次測試（2026-09-03）

- 重新執行上述 11 組、84 項功能／資料服務／同步測試：全部通過。分科分組、純文字／Markdown／HTML、長文展開與收合、提交失敗保留、搜尋完整性、同名範本的獨立 ID 及鍵盤操作均包含在內。
- 重新執行相關 ESLint、`git diff --check` 與 production build（含 TypeScript）：全部通過。
- 本輪第一次申請本機監聽時，權限審查服務回傳 HTTP 404；取得權限後，以即將部署的規則重新執行 15 項 Prompt Gallery 專屬規則測試，全部通過。
- 正式部署目標為 Firebase 專案 `smart-on-fhir-ac97d`、Firestore 資料庫 `mediprisma`。部署前先下載正式現行規則，只合併 Prompt Gallery 區段，排除工作目錄中未相關的 memberships／tenants 規則變更。
- 部署後規則集為 `f65f1855-f1c0-4e3e-9bd3-8edc066076d3`；重新下載的規則與測試版本 SHA-256 均為 `8b8838bc6d6900ded3f38a46ca2aa229192b2277afdc12c5d5544194cdba5c2b`。
- 本輪未讀寫正式分享資料；前端已完成完整測試、型別檢查、程式規範、靜態正式建置與瀏覽器檢查，並由本文件所在的 `master` 提交觸發發佈。

## 修正前稽核紀錄

以下保留修正前的重現結果及建議，程式行號是當時位置；不代表上述問題仍未修正。

修正前確認 10 項缺陷。P1 為應優先處理的公開資料／隱私問題；P2 為需排入修正的功能、資料保存或操作問題。保留「prompt 不設字數上限」要求，長文改善應處理儲存與顯示方式。

| 順序 | 優先度 | 問題 | 驗證方式 |
|---|---|---|---|
| F01 | P1 | 公開範本缺少資料結構驗證，錯誤資料可讓搜尋失敗 | 規則模擬器＋真實 service 測試 |
| F02 | P1 | 沒有顯示名稱時，email 會成為公開作者名稱 | 分享元件＋真實 service 測試 |
| F03 | P2 | 不限輸入長度，但單文件儲存仍讓超長 prompt 分享失敗 | 規則模擬器＋官方容量規格 |
| F04 | P2 | 長單行預覽把「使用」按鈕推到畫面外 | 320／1280 px 實際瀏覽器 |
| F05 | P2 | 先取 100 筆再篩選，造成漏搜與不完整熱門排序 | 101 筆資料案例＋程式碼 |
| F06 | P2 | 舊查詢回應會覆蓋新篩選結果 | 控制回應順序的 hook 測試 |
| F07 | P2 | 上一次分享的延遲關閉會丟失下一份草稿 | 假時鐘＋真實分享表單 |
| F08 | P2 | 從摘要 Gallery 分享，預設卻存成對話範本 | Gallery→分享→service 測試 |
| F09 | P2 | 作者能任意修改使用次數 | 規則模擬器 |
| F10 | P2 | 範本卡片無法用鍵盤開啟 | 實際瀏覽器＋DOM 檢查 |

## F01：公開範本需要結構驗證與逐筆容錯

位置：[firestore.rules](</Users/kuoyihsin/My Drive/2工作/VGH/FHIR/50cases/firebase-smart-on-fhir/firestore.rules:91>)、[資料轉換](</Users/kuoyihsin/My Drive/2工作/VGH/FHIR/50cases/medical-note-smart-on-fhir/features/prompt-gallery/services/prompt-gallery.service.ts:39>)、[搜尋](</Users/kuoyihsin/My Drive/2工作/VGH/FHIR/50cases/medical-note-smart-on-fhir/features/prompt-gallery/services/prompt-gallery.service.ts:130>)。

建立規則只檢查登入、authorId 與 usageCount。模擬器接受 `title: 42`、物件型別的 `prompt`，且未登入者可讀取。前端直接信任這些欄位；重現測試中，一筆數字型別的 title 讓整次搜尋拋出 `toLowerCase` 錯誤，正常資料也無法回傳。若物件內容進入卡片或預覽，亦無法作為一般文字呈現。

建議：建立與更新都驗證必要欄位、型別、用途／格式的合法值及允許修改的欄位；讀取時逐筆驗證並隔離錯誤紀錄。prompt 驗證為文字，不加任意字數上限。

驗收：格式錯誤的 create/update 被拒絕；既存錯誤紀錄不影響其他正常範本的搜尋與預覽。

## F02：不要自動把 email 當公開作者名稱

位置：[SharePromptDialog.tsx](</Users/kuoyihsin/My Drive/2工作/VGH/FHIR/50cases/medical-note-smart-on-fhir/features/prompt-gallery/components/SharePromptDialog.tsx:196>)、[公開讀取規則](</Users/kuoyihsin/My Drive/2工作/VGH/FHIR/50cases/firebase-smart-on-fhir/firestore.rules:87>)。

匿名開關預設關閉。當 Firebase 帳號沒有 displayName 時，表單會把 email 寫入公開的 authorName；畫面只說「將顯示您的名稱作為作者」。測試用 `displayName: null` 與合成 email，確認寄件內容包含該 email。

建議：分享前顯示實際公開署名，沒有名稱時使用使用者明確填寫的名稱或匿名選項。不要默認以 email 補值。

驗收：沒有 displayName 的帳號，未明確選擇公開 email 時，公開文件中不會出現 email。

## F03：長文需要拆開儲存

位置：[createSharedPrompt](</Users/kuoyihsin/My Drive/2工作/VGH/FHIR/50cases/medical-note-smart-on-fhir/features/prompt-gallery/services/prompt-gallery.service.ts:198>)、[單次文件寫入](</Users/kuoyihsin/My Drive/2工作/VGH/FHIR/50cases/medical-note-smart-on-fhir/features/prompt-gallery/services/prompt-gallery.service.ts:229>)。

前端已移除 prompt 長度限制，但完整文字仍與 metadata 存在同一個 Firestore 文件。Firestore 每文件上限是 1 MiB；這是位元組與整份文件的限制，不能以固定中文字數換算。詳見 [Firebase 官方規格](https://firebase.google.com/docs/firestore/quotas)。

模擬器重現：40 萬個「中」為 1,200,000 UTF-8 bytes，寫入遭 `invalid-argument` 拒絕。現有 10 萬字測試驗證內容能完整交到資料庫邊界，但 addDoc 使用 mock，不涵蓋真實儲存容量。

建議：metadata 與全文分開，採用分塊文件或獨立全文儲存；列表只載入 metadata，開啟預覽／套用時讀全文。設計寫入完成標記與失敗重試，確保只公開完整範本，並檢查對話／摘要匯入後的個人儲存也能保留同樣長度。不要截斷文字或重新加字數上限。

驗收：超過單文件容量的中英文／HTML prompt 能完整發布、讀回、套用與再次儲存；分塊失敗時保留草稿且不出現半份公開範本。

## F04：長單行預覽破壞版面與操作

位置：[預覽 ScrollArea](</Users/kuoyihsin/My Drive/2工作/VGH/FHIR/50cases/medical-note-smart-on-fhir/features/prompt-gallery/components/PromptPreviewDialog.tsx:178>)、[pre 文字容器](</Users/kuoyihsin/My Drive/2工作/VGH/FHIR/50cases/medical-note-smart-on-fhir/features/prompt-gallery/components/PromptPreviewDialog.tsx:240>)。

`whitespace-pre-wrap` 會保留換行，但目前沒有處理超長無空白字串的斷行與容器最小寬度。用約 10 萬字的連續英文／數字重現：在 1280 px 畫面，對話框寬 894 px，文字容器卻寬約 842,955 px，「使用」按鈕出現在 x≈843,160。320 px 畫面也一樣，對話框寬 286 px，但主要操作仍遠在畫面外。

建議：限制每層內容的可縮小寬度，明確指定長字串斷行；保持 footer 操作在可視範圍，文字區獨立捲動。分享表單的固定高度 textarea 已改善，預覽需要同樣覆蓋。

驗收：多行與無空白單行的超長文字都可完整閱讀，關閉／使用按鈕在手機與桌機維持可見可點；補實際瀏覽器 layout 測試，JSDOM 無法驗證此問題。

## F05：篩選與熱門排序只處理取回的 100 筆

位置：[limit 與後置篩選](</Users/kuoyihsin/My Drive/2工作/VGH/FHIR/50cases/medical-note-smart-on-fhir/features/prompt-gallery/services/prompt-gallery.service.ts:110>)、[熱門排序](</Users/kuoyihsin/My Drive/2工作/VGH/FHIR/50cases/medical-note-smart-on-fhir/features/prompt-gallery/components/PromptGalleryDialog.tsx:153>)。

服務先依伺服器可處理的條件排序、取 100 筆，再處理摘要相容類型、關鍵字、受眾等條件。重現案例：最新 100 筆是 chat，第 101 筆才是 summary；摘要篩選回傳空集合。熱門排序也只是把原先按建立時間取得的資料在前端重排，因此較舊但熱門的範本不會出現。畫面的總筆數與分頁只反映這個子集合。

建議：整理舊 `insight` 資料相容策略，讓可索引的篩選／排序在查詢端一致處理，並實作游標分頁；全文搜尋採完整索引或明確的持續載入流程。只把 limit 調大仍然會漏資料，也會加重長文下載。

驗收：超過 100 筆資料時，較舊但符合條件的範本能被找到；切到熱門排序可找到整個符合條件集合中使用次數最高的範本。

## F06：快切篩選時會顯示過期結果

位置：[usePromptGallery.ts](</Users/kuoyihsin/My Drive/2工作/VGH/FHIR/50cases/medical-note-smart-on-fhir/features/prompt-gallery/hooks/usePromptGallery.ts:35>)。

每個 fetch 完成後都直接更新 prompts／error／loading，沒有判斷是否仍是最新請求。測試先發 old，再發 new，先讓 new 完成、再讓 old 完成，畫面狀態最後是「篩選 new，但資料 old」。

建議：用請求序號或 effect cleanup 忽略失效的回應，所有結果／錯誤／loading 都遵守同一規則；對文字搜尋加適當 debounce，另移除 Gallery 與 hook 的重複 refresh。

驗收：所有回應順序都只顯示目前篩選條件的結果；舊回應不會提早結束新請求的 loading。

## F07：前一次分享的計時器會關掉下一份草稿

位置：[分享完成計時器](</Users/kuoyihsin/My Drive/2工作/VGH/FHIR/50cases/medical-note-smart-on-fhir/features/prompt-gallery/components/SharePromptDialog.tsx:205>)、[依開啟狀態重建表單](</Users/kuoyihsin/My Drive/2工作/VGH/FHIR/50cases/medical-note-smart-on-fhir/features/prompt-gallery/components/SharePromptDialog.tsx:81>)。

發布成功後的 1 秒計時器沒有清除或綁定開啟場次。重現：發布成功→立即取消關閉→重新開啟並編輯另一份→舊計時器到期，新的表單被關閉；再次打開只剩初始內容，新草稿消失。

建議：由當次分享流程控制關閉，離開該場次時取消計時器，或改為成功後立即關閉並顯示完成通知。另可增加草稿保留，降低誤按 Escape／點背景的損失。

驗收：前次分享完成不會關閉新表單；長文草稿不受前次非同步動作影響。

## F08：摘要 Gallery 的新增分享預設用途錯誤

位置：[SharePromptDialog initialType](</Users/kuoyihsin/My Drive/2工作/VGH/FHIR/50cases/medical-note-smart-on-fhir/features/prompt-gallery/components/PromptGalleryDialog.tsx:426>)。

標題列「分享範本」先清空 sharePrompt；initialType 隨即固定退回 chat，即使 Gallery 的 mode 是 summary。整合測試確認：從摘要 Gallery 開始分享，只填標題與內容，最後寫入 `types: ['chat']`、`category: 'other'`。原本摘要篩選因此看不到剛建立的範本。

建議：新增分享以目前入口 mode 決定預設用途，all 模式再採產品預設；來源範本則保留來源用途。

驗收：摘要入口預選摘要與合理分類，發布後在該入口可找到並套用。

## F09：作者可任意灌高使用次數

位置：[作者更新規則](</Users/kuoyihsin/My Drive/2工作/VGH/FHIR/50cases/firebase-smart-on-fhir/firestore.rules:99>)。

作者的通用 update 規則只固定 authorId，沒有排除 usageCount。因此後面的「只能 +1」規則並不能限制作者；模擬器確認作者可直接把 usageCount 改成 999999，公開讀取也會得到此值。熱門排序失去可信度。

建議：把內容修改與使用計數分開，內容更新明確排除計數等系統欄位；若此數值要作為可信排名，使用受控的記錄流程與合理防重複策略。

驗收：作者不能藉一般內容更新設定使用次數；允許的計數流程仍可正常增加。

## F10：卡片需要真正可用的鍵盤入口

位置：[PromptCard.tsx](</Users/kuoyihsin/My Drive/2工作/VGH/FHIR/50cases/medical-note-smart-on-fhir/features/prompt-gallery/components/PromptCard.tsx:63>)。

卡片是只有 onClick 的 div，沒有可聚焦元素與鍵盤啟動行為。實際瀏覽器的無障礙樹只有文字；Tab 會跳過卡片。使用鍵盤者可操作篩選，卻無法開啟搜尋結果。

建議：使用語意正確的按鈕／明確「檢視範本」入口，保留可見焦點與 Enter／Space 操作；一起檢查篩選刪除圖示及分頁按鈕的名稱。

驗收：不使用滑鼠即可搜尋、選擇卡片、預覽、套用，關閉後焦點回到來源卡片。

## 另外值得安排的操作改善

1. **關閉的 Gallery 不應先抓完整列表。** 每個 Gallery 都建立全部／我的兩個 hook；測試確認 `open=false` 仍有兩次查詢。開啟條件與作用中分頁應控制載入，分享完成後只更新必要列表。位置：[PromptGalleryDialog.tsx](</Users/kuoyihsin/My Drive/2工作/VGH/FHIR/50cases/medical-note-smart-on-fhir/features/prompt-gallery/components/PromptGalleryDialog.tsx:81>)。
2. **補足已分享範本的維護流程。** 預覽接收 onShare prop 卻未使用；updateSharedPrompt 也沒有接到編輯 UI。可提供作者編輯，以及其他人「另存副本」，保留用途、格式與來源資訊。這是目前未完成的入口，不代表現有按鈕會成功執行再分享。位置：[PromptPreviewDialog.tsx](</Users/kuoyihsin/My Drive/2工作/VGH/FHIR/50cases/medical-note-smart-on-fhir/features/prompt-gallery/components/PromptPreviewDialog.tsx:51>)。
3. **長文草稿保留。** 目前關閉分享表單就重新建立狀態；除了 F07 的計時器缺陷，一般誤關也會失去尚未發布的編輯。建議當次工作保留草稿，並提供明確捨棄操作；若要跨重整保留，需選擇適合長文的儲存方式。

格式流程的現況：純文字／Markdown／HTML 已寫入分享資料，預覽有格式標示，自訂摘要套用保留 outputFormat 與 languagePolicy。分享提示也明確寫出此格式用於自訂摘要。對話範本目前只保留標題與 prompt，因此不把「對話沒有獨立 HTML 顯示格式」列為本次確定缺陷；若要擴大至對話，需另外定義顯示行為。

## 修正前驗證紀錄與範圍

- 既有相關測試：41 項通過，涵蓋分科群組、舊類型相容、格式、展開編輯與最高 10 萬字的內容傳遞。
- 本次暫時重現測試：7 項通過；這些測試的斷言用來確認缺陷存在，已移除，不把錯誤行為固定成正式測試規格。
- Firestore 1.19.8 模擬器：使用獨立 `demo-gallery-audit` 測試環境與本機規則；確認錯誤資料可建立、作者可改計數、大文件被拒絕。對照驗證：未登入建立與非作者刪除都被拒絕。
- 真實瀏覽器：用合成範本重現 320／1280 px 長單行 overflow 與卡片鍵盤入口問題；本次沒有修改渲染程式，因此未重跑完整六尺寸／主題矩陣。
- 相關檔案 ESLint、`git diff --check` 與 production build（含 TypeScript）皆通過；正式輸出不含暫時稽核頁面。
- 本次沒有修改產品程式、後端規則或正式資料。暫時頁面、重現測試與模擬器已清理／停止。
- 正式環境目前的規則、索引、既有資料品質與部署版本尚未確認；本報告的後端結論針對本機規則版本。

修正順序建議：先處理 F01／F02；長文儲存 F03 與預覽 F04 一起列為下一個完整交付；接著完成搜尋正確性 F05／F06、分享流程 F07／F08，以及 F09／F10。每項修正後，再將上面的驗收條件補成保護正確行為的測試。
