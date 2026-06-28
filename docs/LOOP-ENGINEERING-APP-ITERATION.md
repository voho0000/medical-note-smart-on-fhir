# Loop engineering — app 自我迭代工作線(交接用)

寫於 2026-06-28。這份給**接手此工作線的新 session/agent** 冷啟動。

## 一句話目標
用 **loop engineering**(設計會自動 reason→act→observe→重跑、有可驗證 /goal 與停止條件的迴圈)讓 `medical-note-smart-on-fhir` 這個 app **自己迭代改善**。本工作線只處理「app/產品本身的改善」,不負責醫療回答品質本身的評估——那由一條獨立工作線處理,本工作線只把它當一道**外部閘門**接上(見下)。

## 專案現況(接手前要知道)
- app **已上線**,但 **user 還很少**。
- 同時**持續在開發新功能**。
- 這兩點直接決定下面 A 做、B 緩。

## 兩個子工作線

### A. 開發期自動迭代(現在做)
正在持續開發新功能,這是 loop engineering 回報最高的地方。核心:定義 **/goal + 停止條件 + verifier(驗證器)**,讓 agent 自己 reason→act→observe→重跑直到通過驗證。要有分層退出:verifier 通過、硬性最大迭代次數、token/時間預算、no-progress 偵測。

**現成的 verifier(品質閘門):**
- 測試套件、type-check、build、lint
- **外部閘門(out-of-repo verifier)**——由另一條獨立工作線維護,內部方法不在本 repo。它只回傳一道 pass/fail 判定,本工作線把它當其中一道閘門呼叫即可,不需也不該複製它的內部方法。透過 `scripts/loop/gate.mjs` 的 `LOOP_EXTERNAL_GATE_CMD` hook 接上。

### B. 執行期自我改善(現在先別全做,只埋種子)
讓上線後的 app 依使用情況自我調整。**現在做是過早,且醫療場景要特別小心:**
1. **訊號不足**:runtime 自我改善要靠使用情況(錯誤率、user 滿意度、哪些答案被採納)當燃料;user 少 = 在雜訊上亂調。
2. **醫療安全**:會「自己在線上改行為」的醫療 app 風險高(可能悄悄改壞臨床判讀)。B 必須有**人類審核閘門**,不是全自動。

→ **現在該做的是埋 telemetry/observability**(記錄功能使用、錯誤、user 回饋)。等 user 多、訊號夠,B 才有東西可學。B = 後期階段,依賴現在開始收的資料。

## 三條工作線的關係
```
A：改善整個 app 的自動迭代迴圈(本 repo)
   └─ 用多個 verifier,其中一道是 ↓
外部閘門(另一條獨立工作線維護,內部不在本 repo)
B：runtime 自我改善(後期;先埋 telemetry;需人類閘門)
```
這道外部閘門既是獨立議題,也是 A 的一道品質閘門。

## 接手後建議的下一步
1. 盤點現有 verifier:`package.json` 的 test / lint / type-check / build script、CI 設定。
2. 設計 A 的迴圈骨架:/goal 格式、停止條件、把上述 verifier 串成一道 gate。
3. 規劃 B 的 telemetry:功能使用/錯誤/回饋要記哪些欄位、存哪。
4. 與外部閘門工作線對接「閘門介面」(它怎麼被呼叫、回傳什麼判定)——見 `scripts/loop/`。

## 注意
- 本工作線文件放公開 app repo;外部閘門背後工作線的方法與結果不在本 repo,**不要把那邊的內部細節複製進這裡**。
- push 前慣例:列 `origin/master..HEAD`、別把不相干變更(如 npm install 改的 `package-lock.json`)一起帶進 commit。
