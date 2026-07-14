# Deep-mode harness ledger

> 狀態：尚無可公開重現的 baseline｜app 基準：v0.40.0｜最後核對：2026-07-14

成績單:每做一次 harness 改善,就在「迭代紀錄」加一列,量化「改了什麼層、正確率從多少 → 多少」。
配套設計見 [DEEP-MODE-EVAL-LOOP.md](DEEP-MODE-EVAL-LOOP.md) 的 teacher-student 自動 eval 迴圈。真實 app loop 已抽成 `runDeepModeAgent()`，但公開 repo 尚未含完整 runner 與 baseline artifacts。

紀錄規則:**只有「主指標上升」且「回歸數 ≤ 門檻」才保留 patch**,否則回退並照實記 reverted。數字一律來自實跑 eval,**禁止填估計值或編造**;尚未量到的填 `TBD`。

---

## 追蹤指標

| 指標 | 定義 | 方向 |
|---|---|---|
| **Gold-match accuracy(主指標)** | judge 判定 student 答案對上 gold 事實的題數 ÷ 總題數 | ↑ |
| Per-layer error rate | 失敗題按 ETCLOVG 分層(Tooling / Context / Lifecycle / Verification…)的佔比 | ↓ |
| Tool precision / recall | 該叫的工具有沒有叫對、參數對不對 | ↑ |
| Hallucination rate | 答案出現「不在 bundle 裡」的 code / citation 的題數佔比 | ↓ |
| Empty / incomplete rate | 叫了工具卻沒產生文字、或答不完整(Lifecycle) | ↓ |
| Avg steps used | 平均實際用幾步(上限 10);偵測無效繞圈 | ↓ |
| p95 latency | 第 95 百分位回應時間;盯 Nano 大 context 變慢 | ↓ |
| Timeout / error-chunk rate | idle watchdog 觸發或 error chunk 的題數佔比 | ↓ |
| **Regressions** | 上一版會過、這版變不過的題數(HarnessFix 的回歸門檻;預設門檻 = 0) | =0 |
| Tokens / question | 每題平均 token,看修補的成本代價 | ↓ |

eval 集大小、judge 模型、student 模型每次都記在列上,因為換模型會讓數字不可比。

---

## 迭代紀錄

| # | 日期 | 改的層 | 改了什麼 | 主指標 before→after | 受影響子指標 before→after | Regressions | 決定 |
|---|---|---|---|---|---|---|---|
| v0 | TBD | — | baseline(首次跑 eval,未改 harness) | — → TBD | — | — | baseline |
| v1 | TBD | _e.g. Tooling_ | _e.g. 候選 terminology tool A/B；填入 dataset/model/commit_ | TBD → TBD | tool precision TBD→TBD | TBD | kept / reverted |

> 每列必填：commit、fixture／eval-set hash、題數、judge model、student models、prompt/tool schema identity 與 artifact 位置；否則跨列不可比。

---

## 圖表(累積後手動更新或腳本生成)

```
Gold-match accuracy 趨勢
v0 ▁▁▁▁  TBD%
v1 ▁▁▁▁  TBD%
...
```

累積幾圈後可考慮用 `scripts/` 加一支小腳本,從 eval 結果 JSON 自動算指標並 append 到本表(對齊本專案「冪等 Node 腳本」慣例)。
