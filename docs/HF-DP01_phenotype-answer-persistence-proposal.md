# HF DP-01：醫師分型判斷的持久化提案（§3.3）

狀態：**提案，等 owner 決定**。寫於 2026-09-10，pilot/hmc。
本文件不改任何程式行為，也**沒有**接上 Firestore、**沒有**修改 Firestore Rules。

現況：`features/clinical-decision-support/stores/phenotype-answer.store.ts` 只有
session-only 記憶體實作，換病人或重整就沒了。介面接縫
（`PhenotypeAnswerRepository` + `setPhenotypeAnswerRepository`）已經在，
持久化實作留空在 `stores/phenotype-answer.firestore.ts`。

需要 owner 拍板三件事：**(1) 路徑、(2) N 天、(3) Rules**。三件都定案前不會接。

---

## 1. 要寫的四個值

都是醫師在 DP-01／DP-01b 卡片上自己輸入的判斷，不是從病歷推導出來的。

| 值 | 目前型別 | 意義 |
|---|---|---|
| `physicianHeartFailureSuspicion` | `'suspected' \| 'not-suspected'` | DP-00：這次看診是不是在問心衰竭。缺值＝還沒問過，**不等於**不懷疑。 |
| `physicianLvefPhenotype` | `'reduced' \| 'preserved' \| 'unknown'` | DP-01：院外／紙本／核醫已知的 LVEF 落在哪一側。 |
| 手輸 `LVEF` ＋檢查日期 | `number` ＋ `YYYY-MM-DD` | 醫師從院外報告讀出來的數值與該次檢查日期。 |
| `physicianConfirmedHfpEf` | `boolean` | DP-01b：醫師走完 §5.2.2 後確認 HFpEF 成立。 |

**這四個都是病人資料。** 手輸 LVEF 與檢查日期尤其明確：它是一次影像檢查的結果。
這也是目前刻意只放在記憶體、連 `localStorage` 都不用的原因
（隔壁 evidence 開關能存，是因為「某一列要不要納入判定」不是病人資料）。

---

## 2. 路徑二選一

### 選項 A — `cdssPhenotypeAnswers/{patientId}`

以**病人**為 key，全院共用一份。

- **臨床意義**：「這個病人的臨床判讀」。A 醫師今天判 HFpEF，B 醫師明天接手同一床，
  看得到 A 的判讀與依據，不必重問病人一次院外超音波做過什麼。
- **有利**：交班連續、同一病人只會有一份判讀、避免同一床出現互相矛盾的分型。
- **代價**：
  - 任何能讀這個病人的登入者都讀得到，寫入者的身分只能靠 `answeredBy` 記錄，
    Rules 擋不住「B 醫師覆蓋 A 醫師的判讀」——除非再加一層寫入規則。
  - 需要一組「誰可以讀寫這個 patientId」的授權模型。**目前 pilot 沒有這層**：
    HMC 是以一般使用者身分連正式 Firebase，Rules 現況是以 UID 為界。
    採 A 就必須先有 patient-level 授權，這是 owner 與 Rules 的工作，不是前端改得動的。
- **風險**：在還沒有 patient-level 授權的情況下開這條路徑，等於把一份病人層級的
  臨床判讀放在一個所有登入者都可能讀寫的位置。**不建議在本 pilot 期程內採用。**

### 選項 B — `users/{uid}/cdssPhenotypeAnswers/{patientId}`

以**登入醫師**為 key，各自一份。

- **臨床意義**：「我對這個病人的判讀」。
- **有利**：
  - 完全落在現行 Rules 的既有模型內（`HMC-AI-AGENT-GUIDE.md`：只能讀寫自己 UID 底下的資料），
    Rules 草稿最單純，**不需要新的授權概念**。
  - 一個醫師不會覆蓋另一個醫師的判讀。
  - 與 pilot 現況一致：spec §3.3 原本寫的就是這條。
- **代價**：**無法交班**。B 醫師接手同一床時看到的是空白，會重問一次；
  同一個病人可能同時存在兩份不一致的分型判讀，而系統不知道它們互相矛盾。
- **風險**：臨床上「同一病人、兩位醫師、兩個分型」是真實的病安議題，
  但它是**看得見**的（各自的畫面各自空白），比 A 的「看不見的覆蓋」容易處理。

### 建議

短期（pilot 期程內）**採 B**，理由是它不需要新的授權模型，落在既有 Rules 內，
而且是 spec §3.3 原本的設計。長期若要交班，A 才是對的臨床答案，
但要先有 patient-level 授權，那是 owner 與 Rules 的工程，不是這個 pilot 的範圍。

**這是建議，不是決定。兩者的臨床意義不同，請 owner 選。**

---

## 3. `answeredAt`／`answeredBy` 與過期策略

### 欄位

在現有 `PhenotypeAnswer` 之外增加兩欄（**目前尚未加入型別，等路徑定案一起改**）：

| 欄位 | 型別 | 用途 |
|---|---|---|
| `answeredAt` | ISO 8601 timestamp | 這份判讀是什麼時候給的。現有的 `answeredOn` 只有日期，跨時區與排序都不夠用。 |
| `answeredBy` | `{ uid: string; displayName?: string }` | 誰給的。選項 A 一定要有（否則無法追誰覆蓋誰）；選項 B 也建議留，方便日後搬到 A。 |

`answeredBy` 只存登入者的 UID 與顯示名稱，**不存**病人任何識別資訊。

### 「超過 N 天視為未作答」

讀取時若 `now - answeredAt > N 天`，把這份判讀當成不存在，卡片重新詢問，
並在卡片上說明「上次判讀為 YYYY-MM-DD，已超過 N 天，請重新確認」。
**舊值不刪**，只是不再拿來驅動分型；醫師要看得到上次填了什麼。

**N = ______ 天（請 owner 填）**

#### 為什麼建議 180 天

醫師對 LVEF 的判讀會過期：下一次超音波就該重問。180 天大致對齊臨床上
穩定心衰竭病人常見的超音波追蹤間隔（半年），也就是「一個判讀最多撐到下一次影像」。

**但必須說清楚這條的性質：**

> 本 pack 的 evidence index（`esc-hf-2026.json`）裡**沒有任何一條**建議是在講
> 重複影像或再評估的時間間隔。我查過全部 26 個 evidence id，沒有一條支持
> 「180 天」或任何其他數字。
>
> 所以 **180 天是營運上的預設值，不是指引門檻，也不會有 citation。**
> 它不能寫成「依 ESC 2026 建議」。若 owner 要別的數字（90／365），
> 同樣是營運決定，不需要文獻依據，但也同樣不能標成指引。

依 `AGENTS.md`／`HMC-AI-AGENT-GUIDE.md`「不得捏造 citation、頁碼、recommendation ID、
evidence grade」，這一段刻意不附引用。

---

## 4. Firestore Rules 草稿（給 owner 貼用）

**未套用。** 依 `CLAUDE.md` 硬性界線，本 pilot 不改 Rules／Functions／IAM。
以下兩份對應上面兩個路徑，請 owner 依選擇擇一，並自行 review 後部署。

### 對應選項 B（`users/{uid}/…`）— 建議

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isSignedIn() {
      return request.auth != null;
    }

    // 只允許本文件預期的欄位，避免前端日後夾帶其他病人資料進來
    function isPhenotypeAnswer(d) {
      return d.keys().hasOnly([
               'hfSuspicion', 'choice', 'lvef', 'measuredOn',
               'hfpEfConfirmed', 'answeredAt', 'answeredBy'
             ])
             && (!('hfSuspicion' in d) || d.hfSuspicion in ['suspected', 'not-suspected'])
             && (!('choice' in d) || d.choice in ['reduced', 'preserved', 'unknown'])
             && (!('lvef' in d) || (d.lvef is number && d.lvef >= 0 && d.lvef <= 100))
             && (!('measuredOn' in d) || d.measuredOn is string)
             && (!('hfpEfConfirmed' in d) || d.hfpEfConfirmed is bool)
             && d.answeredAt is timestamp
             && d.answeredBy.uid == request.auth.uid;
    }

    match /users/{uid}/cdssPhenotypeAnswers/{patientId} {
      allow read: if isSignedIn() && request.auth.uid == uid;
      allow create, update: if isSignedIn()
                            && request.auth.uid == uid
                            && isPhenotypeAnswer(request.resource.data);
      allow delete: if isSignedIn() && request.auth.uid == uid;
    }
  }
}
```

### 對應選項 A（`cdssPhenotypeAnswers/{patientId}`）

**這一份不完整，而且刻意不完整。** 它缺的正是 A 的核心問題：
「誰有權讀寫這個 patientId」。下面用一個假想的 `patientAccess/{patientId}`
授權集合示意，但**那個集合目前不存在**，要由 owner 設計：

```javascript
    // 前提：需要另一個集合說明「哪些 uid 可以碰這個病人」。
    // 這個集合目前不存在，需要 owner 設計並且自行維護。
    function mayAccessPatient(patientId) {
      return exists(/databases/$(database)/documents/patientAccess/$(patientId)/members/$(request.auth.uid));
    }

    match /cdssPhenotypeAnswers/{patientId} {
      allow read:          if isSignedIn() && mayAccessPatient(patientId);
      allow create, update: if isSignedIn()
                            && mayAccessPatient(patientId)
                            && isPhenotypeAnswer(request.resource.data);
      allow delete: if false;   // 交班用的判讀不給刪，只給覆蓋
    }
```

若 owner 選 A，請注意：**在 `patientAccess` 這類授權模型建立之前，
不要把這條路徑上線。** 否則等同把病人層級的臨床判讀開放給所有登入者。

---

## 5. 程式接縫現況

| 項目 | 狀態 |
|---|---|
| `PhenotypeAnswerRepository` 介面（async） | 已存在，本次未改 |
| `createSessionPhenotypeAnswerRepository()` | 已存在，仍是預設 |
| `setPhenotypeAnswerRepository()` 注入點 | 已存在，本次未改 |
| `createFirestorePhenotypeAnswerRepository()` | **本次新增，留空**：呼叫即丟 `PhenotypeAnswerPersistenceNotApprovedError`，不 import Firestore、不開連線 |
| `answeredAt`／`answeredBy` 欄位 | **尚未加入型別**，等路徑定案一起改 |

留空的實作刻意用「丟例外」而不是「靜靜地不存」：一個收下答案卻沒寫進去的
repository 比一個明說自己沒有實作的更危險，因為醫師無從察覺。

---

## 6. 決定之後才會做的事

1. 依選定路徑實作 `createFirestorePhenotypeAnswerRepository()`。
2. 在 `PhenotypeAnswer` 加 `answeredAt`／`answeredBy`，讀取時套用 N 天過期。
3. commit 與 PR 描述必須寫明：**新增資料寫入**、寫到哪條路徑、內容是醫師輸入的
   分型選擇與 LVEF 數值，以及 `Visible behaviour changes:`。
4. **不新增**任何外部 endpoint 或 telemetry。
5. Rules 由 owner 部署；前端不會、也不能自行套用。
