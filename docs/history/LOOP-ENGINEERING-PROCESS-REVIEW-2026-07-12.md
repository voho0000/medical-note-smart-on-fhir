# Loop Engineering 研究 × 開發流程檢視報告

> **文件性質：2026-07-12 的研究與流程快照。** 引用的數量、流程缺口與外部生態資訊屬當時觀察。到 v0.40.0（2026-07-14），repo 已有 CI typecheck／lint／Jest／static build gate、獨立 Playwright workflow、CodeQL、Dependabot、`scripts/loop/gate.mjs` structured verdict、dashboard／journal，以及供 UI 與 eval 共用的 headless `runDeepModeAgent()`；尚未量化完成的 deep-mode baseline 仍維持 TBD。

寫於 2026-07-12。三部分：(1) 「loop engineering」詞源與定義、(2) agentic coding 社群最佳實踐共識、(3) 本專案過去六週開發流程的量化診斷與改善建議。

---

## Part 1 — 「Loop Engineering」這個詞

### 1.1 定義

**Loop engineering = 設計、運行、改善「讓 AI coding agent 規劃 → 改 code → 觀察結果 → 修正，直到任務完成」的回饋迴圈的工程實踐。**（Kilo, 2026-06-10）

Addy Osmani 的版本更直白：「把『提示 agent 的那個人』換掉——你設計一個系統來取代自己：它找工作、派工作、驗證結果、決定下一步。」

與前兩代 buzzword 的關係是**同心圓、一層包一層**：

| 層 | 工程對象 | 類比技能 |
|---|---|---|
| Prompt engineering | 單輪指令的字句 | UX 寫作 |
| Context engineering | 這一輪模型看到的所有東西（檢索、工具、檔案） | 資訊檢索／資料工程 |
| **Loop engineering** | **工作如何跨輪延續：觸發、驗證、重試、預算、停止條件** | **SRE／控制理論／系統思維** |

核心的價值轉移：「價值單位從單次回應（response）變成整條軌跡（trajectory）」。

### 1.2 詞源時間軸

- **2025-09-30** — Simon Willison〈Designing agentic loops〉：「設計 agentic loop 是一項關鍵的新技能」。概念的正式起點（尚未用這個詞）。
- **2025 年中** — Geoffrey Huntley 的 "Ralph Wiggum" loop（agent 放進無限 bash 迴圈、每輪全新 context、以檔案系統與 git 當記憶）年底爆紅；Dex Horthy 的 12-Factor Agents（"own your control flow"）同為直接前身。
- **2026-06-06~08** — **Boris Cherny**（Claude Code 作者）受訪片段瘋傳：「我不再 prompt Claude 了，我有一些 loop 在跑……我的工作是寫 loop。」**Peter Steinberger**（OpenClaw 作者）幾乎同時發文：「你不該再 prompt coding agent，你該設計會 prompt 你的 agent 的 loop。」
- **2026-06-07~22** — **Addy Osmani〈Loop Engineering〉**一文為這個詞定名、定框架（後轉載於 O'Reilly Radar）；多數後續文章視其為 canonical reference。
- **2026-06-26** — **Andrew Ng** 在 The Batch 提出三層巢狀迴圈：agentic coding loop（分鐘級）→ developer feedback loop（小時級）→ user feedback loop（天～週級），並在 7/1 於 X 上稱之為當前最熱的 buzzphrase。

**結論：沒有單一 coiner。** 概念來自 Willison / Huntley / Horthy（2025），詞的爆發來自 Cherny + Steinberger（2026 年 6 月初），定調靠 Osmani 的文章。

> 有趣的本地註腳：本 repo 的 `docs/LOOP-ENGINEERING-APP-ITERATION.md` 寫於 2026-06-28——詞爆紅後三週就開了自己的 loop-engineering 工作線，算是早期採用者。

### 1.3 這個流派實際主張什麼

1. **決定性驗證閘門**（tests / typecheck / build / lint / screenshot diff）作為迴圈的 observe 步驟——「防止 agent 自己同意自己」。
2. **明確的停止條件與預算**：迭代上限、時間／token 預算、no-progress 偵測。「Loop 是簡單的部分，難的是 context 和停止條件。」
3. **狀態放檔案與 git，不放對話**（Ralph 模式）：每輪可以從 repo 重建狀態。
4. **一輪只做一件事**："One thing per loop. Only one thing."（Huntley）
5. **人類上移一層**：agent 顧分鐘級迴圈，人顧小時級方向與週級的使用者回饋（Ng 的三迴圈）。Osmani 的警語：**驗證仍屬於人**，小心 comprehension debt。

主要出處：[Osmani](https://addyosmani.com/blog/loop-engineering/)、[O'Reilly Radar](https://www.oreilly.com/radar/loop-engineering/)、[Willison](https://simonwillison.net/2025/Sep/30/designing-agentic-loops/)、[Kilo](https://kilo.ai/articles/what-is-loop-engineering)、[puppyone 比較文](https://www.puppyone.ai/en/blog/loop-vs-prompt-vs-context-engineering-2026-map)、[Ralph](https://ghuntley.com/ralph/)、[12-factor agents](https://github.com/humanlayer/12-factor-agents)、[dsebastien 時間軸](https://www.dsebastien.net/loop-engineering-went-mainstream/)。

---

## Part 2 — Agentic coding 最佳實踐共識（2025–2026）

跨 Anthropic 官方（[best practices](https://code.claude.com/docs/en/best-practices)、[long-running harnesses](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)）與社群（Willison、Ronacher、Yegge、Hashimoto、Horthy、Osmani、Fowler/Böckeler、Hamel Husain）整理出的最高共識：

### 2.1 十五條共識實踐

1. **給 agent 一個它自己能跑的驗證器**——這是共識度最高的一條。要求證據（貼測試輸出、截圖），不接受「做完了」的宣稱。
2. **先計畫、計畫寫進檔案、審計畫而非只審 diff**——審 30 行計畫的槓桿高於審 800 行 diff。
3. **儀式感隨任務規模縮放**——一句話能描述的 diff 不用計畫；大功能用「agent 訪談你 → 寫 SPEC → 新 session 執行」。
4. **Red/green TDD，且必須先確認測試會 fail**——跳過 red 步驟的測試可能根本沒測到實作（甚至 assert 到 bug 本身）。
5. **Context 是最稀缺資源**——不相關任務就 `/clear`；同一問題修正失敗兩次就開新 session 重寫 prompt；探索交給 subagent。（Chroma 的 context-rot 研究：200K window 在 50K 就顯著退化。）
6. **CLAUDE.md 要短、每行都要能改變行為**——被反覆違反的規則轉成 hook（決定性），偶爾才需要的知識移進 skill。臃腫導致規則全被無視。
7. **狀態放檔案與 git**——progress ledger、spec、TODO；任何 session 都能冷啟動。
8. **小步 commit、一任務一 commit、平行工作用 worktree**——便宜的 rollback 是 agent 速度的安全網。
9. **出貨前用全新 context 做對抗式審查**——寫 code 的 context 不能審自己的 code；審查範圍限定 correctness，否則 reviewer 一定會發明工作（過度工程風險）。
10. **不出你解釋不了的 code**——像審 junior 的 PR 一樣審 agent 的輸出。
11. **30–40% 的精力固定投資 code health**（Yegge：不花 40% 就會被迫花 60%）。
12. **讓 codebase 對 agent 友善**——快的 test/build 回饋、無聊穩定的依賴、明確勝於巧妙、agent 能觀察的 logging。
13. **按任務類型分配信任**——重構／測試／遷移／周邊功能 → async 放手；架構／核心業務邏輯／安全敏感 → 人盯。
14. **End-to-end 驗證，不只 unit green**——出貨前用真的 UI 跑過（瀏覽器自動化或親手點過）。
15. **LLM 產品功能：error analysis 先於 evals**（Hamel Husain）——定期花 30 分鐘人工看 20–50 筆真實輸出、歸類失敗，只為**觀察到的**失敗模式寫 evaluator；不要憑想像預寫 evals。

### 2.2 八個警告的失敗模式

1. **Context rot／大雜燴 session**（「AI 變笨了」效應）
2. **Reward hacking／測試 assert 到 bug**——agent 硬編期望值、弱化斷言、改 harness
3. **Trust-then-verify gap／「幾乎對」的 code**——demo 很好、真實輸入就掛的 70–80% 天花板
4. **過早宣告完成／長跑貪多**——留下半殘功能
5. **文件／spec／CLAUDE.md 漂移**——指令檔要當 code 維護
6. **Agent 速度的安全債**——研究指 AI 產 code 漏洞率約人寫的 2.7 倍；醫療 app 要有安全視角的審查
7. **Reviewer 誘發的過度工程**——找碴式審查必然找到碴
8. **工具極繁主義**（Ronacher 的親身反例：自建的 slash commands 沒人用、hooks 不可靠）——簡單 prompt + 快回饋 + 少數決定性閘門，勝過功能蔓生；一次採用一個機制並確認它真的改變行為

---

## Part 3 — 本專案過去六週的流程診斷

### 3.1 量化數據（2026-06-01 ~ 07-12）

| 指標 | 數值 | 解讀 |
|---|---|---|
| 總 commits | 377（6 週） | 極高產出（solo + agent） |
| feat : fix | 122 : 85 | **41% 的功能性 commit 是修復** |
| CI 自傷修復 | 7 次（lockfile 不同步佔 3 次） | 可決定性預防卻反覆發生 |
| 凌晨 00–06 的 commits | 92（24%） | 深夜連發模式 |
| 每條 minor 版線的 release 數 | 0.15 線 **21 個**、0.23 線 **19 個**、0.31 線 **11 個** | hotfix 瀑布：0.31.6→0.31.9 在 7/10 凌晨 00:55–02:30 的 95 分鐘內連發 4 個 |
| 單元測試檔 | 147 | 覆蓋扎實 |
| E2E specs | 10（跑但**不擋 deploy**） | 唯一的 end-to-end 閘門是「上線後人工點」 |
| `scripts/loop/` gate | 6/28 建成，**`.loop/` 不存在 = 從未執行** | 迴圈建了沒接電 |
| Deep-mode eval ledger | **全部 TBD，baseline 未跑** | 同上 |
| CLAUDE.md / AGENTS.md | **不存在** | 專案知識只在單一工具的私有 memory |
| 目前 working tree | 37 檔、±900 行、混多條工作線 | 大批次 WIP |

### 3.2 已經做對的事（不少，值得先說）

- **CI 閘門完整且真的擋 deploy**：typecheck + lint + test + build，`gh-pages` deploy `needs: ci`。這正是共識實踐 #1 的骨幹。
- **「狀態放檔案」文化成熟**：docs/ 的 audit（AUDIT-2026-06-12、MEDICAL-SUMMARY-AUDIT-2026-07-12、MOBILE-TABLET-AUDIT）與 handoff 文件（DEEP-MODE-HANDOFF、LOOP-ENGINEERING-APP-ITERATION）完全符合實踐 #7。
- **事故 → 決定性閘門的轉化**：auth-domains 掉出 allowlist 事故 → `check-auth-domains.mjs` + CI guard。教科書級的 loop engineering。
- **決定性防護取代 LLM 判斷**：`enforceSeverityFloor`、abnormal flag 只信來源 interpretation、med-recon 卡走純決定性設計——在醫療域這是正確的信任分配（實踐 #13）。
- **conventional commits + 版本化 release + demo snapshots**。
- **深夜也有紀律的例外**：loop gate 的 no-progress 偵測（failureSignature 連續相同即 abort）設計得比多數社群文章還好。

### 3.3 五個核心差距

**差距 1：驗證迴圈的終點在 production（最大的一個）。**
現行迴圈是「agent 寫 → CI 綠 → deploy → **在 github.io 上人工發現問題** → hotfix」。0.15 線 21 個 release、0.23 線 19 個就是這條迴圈的成本。CI 只驗「會不會編譯、單元邏輯對不對」，**沒有任何出貨前的 end-to-end observe 步驟**——E2E 不擋 deploy、開發時不在本地 preview 驗證（memory 記載：user reviews on github.io, not localhost）。這正是共識實踐 #14 與 Anthropic harness 文指名的「unit-green ≠ working feature」缺口。41% fix ratio 與凌晨 hotfix 瀑布都是它的下游症狀。

**差距 2：迴圈建好了，但沒有在跑。**
`scripts/loop/`（gate + dashboard + goal 協議 + 分層停止條件）設計品質很高，但兩週來 **一次都沒執行**；deep-mode eval ledger 規則嚴謹（禁填估計值），但 **v0 baseline 從未量過**。這是 Ronacher「工具極繁主義」失敗模式的變體：**設計迴圈的樂趣取代了運行迴圈的價值**。一個每天跑的 `npm test` 勝過一個從沒跑過的完美 gate。

**差距 3：沒有 CLAUDE.md——專案的操作知識鎖在單一工具的私有記憶裡。**
「LOINC 必查證」「abnormal flag 只信來源」「push 前列 origin/master..HEAD」「canonical-only in preferredOrder」這些規則現在只存在 Claude Code 的 auto-memory。新 session 冷啟動、換工具（Codex rescue 就在裝置上）、或未來任何協作者，都拿不到。共識實踐 #6：短 CLAUDE.md、每行都可改變行為;被反覆違反的（lockfile！）轉 hook。

**差距 4：大批次、多線混雜的 working tree。**
現在 37 檔未 commit、混著 medical-summary 合併與其他線;memory 裡也記著「ship calculator-only、hold 其他 WIP」的挑檔出貨模式與「don't piggyback pushes」的教訓。這與實踐 #8（小步 commit、worktree 隔離工作線）相反,是 piggyback 事故與 Yegge「Merge Wall」的溫床。

**差距 5：AI 產品功能沒有運行中的品質迴圈。**
App 本身有六個 LLM 功能（chat、summary、safety alerts、insights、report 解讀、IPS export），但沒有定期 error analysis 的儀式,deep-mode eval 迴圈未啟動。值得注意:**你們最好的幾個品質修正（severity floor、citation grounding self-check）正是零星人工 error analysis 的產物**——Hamel Husain 的主張就是把這件事變成固定節奏,而不是靠偶然。

### 3.4 改善建議（按優先序）

#### P0 — 本週，幾乎零成本

1. **把 `loop:gate` 接上電：跑第一次,然後變成 push 前儀式。**
   `npm run loop:gate` 先跑一次 baseline;然後裝成 git pre-push hook（fast checks:typecheck+lint+test,~幾分鐘）或 Claude Code 的 Stop/PreToolUse hook。lockfile 檢查（`npm ci --dry-run` 或比對 lock 同步）加進 gate——直接消滅那 7 次 CI 自傷裡的 3 次。
2. **寫 CLAUDE.md（≤40 行）。** 內容就從 memory 蒸餾:LOINC/SNOMED 查證規則、abnormal-flag 政策、canonical vs display 分離、push 前列 commits、ask-before-commit/release、TZ=Asia/Taipei 跑測試。每行用「拿掉會不會出錯」檢驗。
3. **Deep-mode eval：跑 v0 baseline,把 ledger 第一列從 TBD 變成真數字。** ledger 的紀律規則已經寫好了,缺的只是執行。

#### P1 — 本月

4. **出貨前 end-to-end 驗證,把「在 production 發現問題」移到「在 preview 發現問題」。** 兩個互補手段:
   - 開發時:改到可預覽的 UI 就在本地 preview（或 static build）親自/讓 agent 用瀏覽器點過、留截圖證據,再 release。
   - 部署閘門:挑 3–5 條**最穩定**的 E2E smoke specs 讓它們擋 deploy(全套維持不擋,避免 flaky 綁架出貨——E2E 容易 stale 的歷史 memory 有記載)。
   目標指標:**下一條 minor 版線的 patch release 數 < 5**(對照 0.31 線的 11)。
5. **Bug 修復採 red/green:先讓 agent 寫出會 fail 的測試、show 給你看,再修。** 同時規定「修 bug 的任務不准動既有測試的斷言」。fix 佔 41% 的現況下,這條的複利最高。
6. **Push 前用全新 context 審 diff**(`/code-review`,範圍限 correctness)。solo 無 PR reviewer,這是共識認可的替代品;醫療 app 每隔幾週加一次 security 視角(`/security-review`)。
7. **一條工作線一個 worktree。** medical-summary 這種長線改造隔離出去,master 的 working tree 隨時可乾淨出貨,piggyback 問題結構性消失。

#### P2 — 下一步

8. **AI 功能的 error-analysis 儀式:每週 30 分鐘,看 20–50 筆真實輸出(先從 safety alerts 與 summary 開始),歸類失敗,只為看到的失敗模式加 evaluator 或決定性 guard。** 不要憑想像預寫 evals(Hamel 的反 eval-driven-development 論點)。
9. **Telemetry 種子(工作線 B 的最小版):** feature invoked / adopted / edited / rejected / error,無 PHI。LOOP-ENGINEERING-APP-ITERATION.md 裡已經規劃好欄位,等 user 數起來前先讓資料開始累積。
10. **demo-snapshot citation drift 驗證器升級**:validate 從「引用可解析」升到「引用指到語意正確的資源」(比對 resource 日期/類型指紋)。

#### 原則性提醒(不是行動項)

- **先運行既有迴圈,再建新迴圈。** 在 loop:gate 沒有連續跑滿兩週之前,不要再加任何 loop 基礎設施(Ronacher 教訓)。
- **凌晨不出 release。** 00:55–02:30 連發 4 個 release 的型態,配上「在 production 驗證」,是品質與可持續性的雙重風險;深夜完成的改動留到早上跑 gate + preview 驗證後再 push。
- **臨床判斷永遠不外包。** codes、參考範圍、安全邏輯的 review 是唯一不能委給 agent 的部分——這也是你們現有政策(abnormal flag、severity floor)已經體現的原則,守住它。

### 3.5 用 Ng 的三迴圈總結

| 迴圈 | 現況 | 該做的 |
|---|---|---|
| **Agent loop(分鐘級)** | CI 完整;但 agent 出貨前沒有 e2e observe | loop:gate 接電 + preview 驗證 + red/green |
| **Developer loop(小時級)** | 驗證發生在 deploy 後 → hotfix 瀑布 | 把 observe 前移;smoke E2E 擋 deploy;新 context 審 diff |
| **User loop(天~週級)** | 只有 feedback email;無 telemetry | 種子 telemetry + 每週 error analysis |

一句話版本:**你們的問題從來不是不懂 loop engineering——gate 的 no-progress 偵測、eval ledger 的防造假規則,設計水準高於多數社群文章。問題是三個設計好的迴圈(loop gate、deep-mode eval、E2E)全都停在「建好」而沒有進入「運轉」,於是實際在運轉的唯一 end-to-end 迴圈,是以 production 為 observe 步驟、以 hotfix 瀑布為 retry 的那一條。把 observe 前移、讓建好的迴圈開始轉,是接下來一個月最高槓桿的改變。**
