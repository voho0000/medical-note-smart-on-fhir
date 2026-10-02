# Launch-route gates — what the app hides or suppresses, and why

Every place the app behaves differently because of *how it was opened* is
listed here. A gate is one of two kinds, and the kind decides how strict the
review is:

- **不打斷（silence）** — the route must not stop to ask anything. Suppressing a
  dialog, a tour, a prompt, or an automatic action is this kind. It never hides
  a clinical surface.
- **不顯示（hide）** — a clinical surface (a tab, a care pack, a card, a switch)
  is not shown on this route. This kind needs the owner's explicit yes, stated
  in the commit message under `Visible behaviour changes`, and a row here.

The 2026-09-08 incident this page exists for: the Medcloud launch was made
silent on 2026-08-20 (kind 1), and on 2026-09-05 the same route test was
reused to hide the Beta tab and the held-back care packs (kind 2) — nobody
asked for that, and the hospital's own launch lost the personalized guidance
until it was noticed. Kind 2 must never ride along on a kind-1 rule again.

## Routes

| Route | Meaning |
|---|---|
| `?medcloud2=auto` | Unattended Medcloud hand-off: the 雲端懷爾抓抓 extension opens the app, hands the patient over, runs the summary. No one is at the keyboard. `isMedcloudLaunchRoute()`. |
| `?medcloud2=auto&site=vghtpe` (`/app/` or `/app-hmc/` on the app origin) | The hospital's own hand-off. Same silence; the Beta switch is offered and honoured like a plain visit. `isVghtpeUnattendedLaunch()`. |
| `?site=vghtpe` alone | Hospital routing only; not a launch route. |

## Gates in force

| Where | Kind | Behaviour on the route | Owner decision |
|---|---|---|---|
| `features/clinical-summary/document-summary/DocumentSummaryCard.tsx` | 不顯示 | All routes: remove the unshipped standalone 歷史 B/C 肝篩檢 section from 文件, restoring the original document-only layout. Source-authored Composition chapters and the existing reports flow remain available. | Owner explicitly requested removal in chat, 2026-09-11 |
| `app/page.tsx` (tour launcher) | 不打斷 | Guided-tour offer never opens | e5374e97, 2026-08-20 |
| `app/_components/FirstRunOnboardingDialog.tsx` | 不打斷 | First-run onboarding never opens on either `/app/` or `/app-hmc/` when `medcloud2=auto`; the vghtpe hospital hand-off is covered on both paths | e5374e97; `/app-hmc/` confirmed by owner, 2026-09-09 |
| `src/application/providers/ai-demographics-gate.provider.tsx` | 不打斷 | Demographics prompt is not raised; the hand-off decides | e5374e97 |
| `src/application/providers/audience.provider.tsx` | 不打斷 | Opens in clinician mode; a stored 民眾 choice is not restored (storage untouched) | e5374e97 |
| `src/application/hooks/ai-generation/use-ai-slot-generation.hook.ts` | 不打斷 | The launch owns the automatic summary run; the browser's auto-generate switch does not fire a second one | e5374e97 |
| `src/application/telemetry/launch-context.ts` | — | Telemetry labels the launch source `medcloud2`; nothing changes for the user | e5374e97 |
| `features/clinical-decision-support/guideline-packs/pilot-gate.ts` | 不顯示 | `?pilotPacks=` is ignored and stored pilot ids do not apply (a tester's per-pack switch must not follow a clinician into a hand-off) | 90a3938c, 2026-09-05 — **stands**; the Beta switch is the way in |
| `features/settings/components/DisplaySettings.tsx` (pilot-pack checkboxes) | 不顯示 | The per-pack 試辦 checkboxes are not shown | 90a3938c — stands, same reason |
| `src/application/hooks/use-beta-features.hook.ts` | 不顯示 | Beta switch not offered and Beta tabs hidden — **except** on the vghtpe hand-off, where the switch is offered and honoured (never turned on by itself) | dab86c39 hid it without being asked; corrected 0dbe966b → 8a3b564d, 2026-09-08 |
| `features/clinical-decision-support/guideline-packs/registry.ts` | 不顯示 | Held-back care packs hidden — **except** on the vghtpe hand-off, which follows the Beta switch | 8d47985d hid them without being asked; corrected 8a3b564d |

## Prompt Gallery visibility

| Where | Kind | Behaviour | Owner decision |
|---|---|---|---|
| `features/prompt-gallery/` | 不顯示 | A template marked private is omitted from「所有範本」and from other accounts; its author can still find and edit it under「我的範本」. | Explicit chat approval, 2026-09-08 |

## Overview display rules (all launch routes)

These are owner-requested presentation rules on the Overview tab at `/` and
its launch-query variants; they do not depend on site, role, or sign-in state.

| Surface | Compact presentation | Where the full content remains | Owner decision |
|---|---|---|---|
| Laboratory dates | The card shows only the newest dates that fit, without horizontal scrolling. Common mode omits dates with no matching common results. | Expanded list retains all eligible dates; All mode retains every collection day in the selected window. | Explicit chat approval, 2026-09-10 |
| Medication duration | The 2×2 card omits prescribed supply days. | Stacked rows, expanded list, and medication hover details retain supply days. | Explicit chat approval, 2026-09-10 |
| Report, medication, and visit rows | Stacked layouts also use single-line records; long text may be truncated. | Existing report dialogs, row tooltips, and destination tabs retain details. | Explicit chat approval, 2026-09-10 |

## Medical calculator display rules (all launch routes)

| Surface | Behaviour | Owner decision |
|---|---|---|
| 國健署五項慢性病風險 at `/`, `/app/`, `/app-hmc/` and their launch-query variants | Autofilled laboratory dates more than 7 days apart produce the existing source-date warning only; they no longer hide eligible risk percentages or grades. Known disease, diagnostic thresholds, missing inputs and validation-range checks remain unchanged. | Explicit owner request to remove the date-based blocker, 2026-09-16 |

## Medical Summary display rules (all launch routes)

| Surface | Compact presentation | Where the full recovery action remains | Owner decision |
|---|---|---|---|
| Care reminders and safety card | Do not render an empty card for a failed first scan, and do not repeat its error or retry action inside a card that still has prior successful content. | The Medical Summary error banner lists the safety failure with other failed cards and offers one retry action; that action reruns only failed cards and preserves successful cards. | Explicit Before/After approval in chat, 2026-09-15 |

## HF visit action list (all launch routes)

| Surface | Behaviour | Owner decision |
|---|---|---|
| HF「今日處置」at `/` and launch-query variants | Omit the `heart-failure-monitoring` row when its first action is the generic reminder to retrieve institutional notes and complete patient-reported/measurement data (Chinese or English). It adds no decision or pending count. Concrete testing/follow-up recommendations remain. The pack output and safety modules are unchanged. | Explicit screenshot-based removal request, 2026-09-12 |
| HF「今日處置」at `/` and launch-query variants | Omit `cardiac-rehabilitation-safety` and its decision count: exercise clearance is outside this HF visit workflow. Keep `cardiac-rehabilitation` referral and other HF safety alerts. | Explicit owner request, 2026-09-12 |
| HF「今日處置」at `/` and launch-query variants | Remove the persistent paragraph explaining rule order, record persistence and claim behaviour; retain action ordering, decisions and counts. | Explicit owner request, 2026-09-12 |
| HF SGLT2i decision reasons at `/` and launch-query variants | Do not show potassium or bradycardia as SGLT2i contraindications. Show serious hypersensitivity under contraindication, and drug-specific temporary-hold reasons under deferral. | Explicit owner clinical review, 2026-09-12 |

| HF「本次評估」at `/` and launch-query variants | Remove the introductory workflow paragraph in both languages; retain all questions and their behaviour. | Explicit owner request, 2026-09-12 |

| HF record values at `/` and launch-query variants | Remove the explanatory footer and its current-time stamp in both languages; retain values, dates and edit controls. | Explicit owner request, 2026-09-12 |

| HF assessment at `/` and launch-query variants | Remove the duplicate clinic-measurement question; the ten-value clinical-information card above is the single display and editing entry point. Renumber compensation to question 5 and HFpEF confirmation to question 6. | Explicit owner request, 2026-09-12 |

| HF clinical values dialog at `/` and launch-query variants | After restoring defaults, show the explanation once in the dialog header rather than repeating it below every field; retain each field's undo control. | Explicit owner request, 2026-09-12 |

| HF views at `/` and launch-query variants | Hide the duplicate read-only `HFpEF 治療` card from both the new visit flow and original board; retain the HFpEF diagnosis panel, question 6, probability calculator, diagnostic evidence and confirmation controls. The source care-pack recommendation remains available internally to select the appropriate treatment pathway. | Explicit owner request, 2026-09-12 |

## Dyslipidemia views (all launch routes)

| Surface | Behaviour | Owner decision |
|---|---|---|
| 高血脂畫面切換 at `/` and launch-query variants | Hide「新版流程」for dyslipidemia because it rendered the same generic module list as「原版看板」. Keep「三區塊」and「原版看板」, and add the distinct「健保表一」review for NHI tier criteria, supporting evidence and treatment response. Heart-failure layout choices are unchanged. | Explicit owner request in chat, 2026-09-20 |

## 決策地圖 v2 — the decision map (all launch routes)

Since 2026-10-01 the HF and AF layout switch offers two faces: 「決策地圖 v2」,
the default, and 「三區塊」. The first decision map — 今天要決定 over the three
sections drawn as the map's three columns — is retired on every route, and a
browser that had stored it (or v2, offered beside it as `book`) opens v2. v2
stays in the CDSS panel, or opens over the whole window from its 全螢幕 or by
`?visit=book`; nothing depends on site, role or sign-in state. It draws the
pack's model in the prototype's layout (the Artifact 「CDSS 小麻式版面原型」);
where it redraws an input, the new entry writes the same store. It asks only
what the Artifact asks: the inputs 三區塊 asks beyond that are not shown on v2,
by the owner's decision, and each such row below is marked **不顯示** with where
the input stays.

| Surface on the other layouts | On 決策地圖 v2 | Where the original stays | Owner decision | Tests |
|---|---|---|---|---|
| The first 決策地圖 as a whole: 今天要決定, the three columns with their steps, 01's 診斷／追蹤 views, the status line with its 臨床數值 fold and editor, the map's question folds, cards and column footers | **不顯示 on every route**: the switch offers 決策地圖 v2 and 三區塊 only; a stored 決策地圖 or 決策地圖 v2 opens v2 | 三區塊 (every input the first map placed — the questions, the editors, the diagnosis confirmation, the HFpEF calculator, the AF question groups, the prognosis models, the handoff card) | Owner, in chat 2026-10-01: 「決策地圖v2 心臟科醫師看了喜歡，那原本的決策地圖就可以整個拿掉了，留著v2跟三區塊」 | `visit-map-wiring` (the switch, the stored choice), `layout-preference.store`; 三區塊: `HeartFailureVisitFlow`, `af-visit-flow`, `cdss-sections` |
| HF 01 「診斷」 view: 懷疑 HF？／HFrEF 還是 HFpEF？ question card and the diagnosis confirmation | DP-01's phenotype table, tagged 「DP-01 · DP-34」 with no heading above it (as the Artifact): 選 HFrEF／選 HFpEF／還不確定 (確認 HFrEF where the LVEF decides), written as the same phenotype answer; one DP-01, no question card. ESC 2026 classes (no HFmrEF, owner choice 2026-09-30). The table is only read, as the Artifact's; the choice is one segmented row under it, 「你的判斷 [HFrEF] [HFpEF] [還不確定]」, drawn as the page's other answers. **不顯示 on 決策地圖 v2**: the 你的判斷 row inside the table, the 還不確定 pill beside it and the grey 「ESC 2026 取消 HFmrEF…」 note | 三區塊 | Chat 2026-09-30: 「這樣兩個DP01耶，留新的…但新的可能要讓醫師可以點」「原本的UI跟問題那些都廢棄了，包含DP03」; the row and the note: Owner, in chat 2026-09-30: 「都照著CDSS小麻式版面原形，不要使用任何原本的外觀」 | `visit-book-layout` DP-01 cases (both modes), 「draws nothing of the other layouts' look」 |
| HF DP-34 HFpEF criteria in 01's 診斷 view: symptom and sign questions, HFA-PEFF／H₂FPEF calculator, 確認 HFpEF | **不顯示 on 決策地圖 v2**, as the prototype: DP-34 has no row and no inputs of its own; DP-01's table stands for it (tag 「DP-01 · DP-34」), and its 確認 HFpEF／選 HFpEF settles DP-01 and DP-34 together. The symptom and sign questions and the calculator are not on this layout | 三區塊 (symptoms, signs, criteria, calculator, confirmation) | Owner, in chat 2026-09-30: 「Prototype 的DP34不用填症狀，完全照著prototype」 — after the #219 review asked for the input; the owner's call on this layout | `visit-book-layout` 「DP-34 is DP-01's table…」 (P1: no DP-34 inputs, the table's HFpEF settles both) |
| HF DP-03 asks card and 「其他症狀、徵象與 NYHA」 (symptoms, signs, NYHA, compensation, chief-complaint and weight follow-up) | The pack's asks as segmented rows, as the Artifact prototype. **不顯示 on 決策地圖 v2**: the fuller questions 「其他症狀、徵象與 NYHA」 | 三區塊 | Owner, in chat 2026-09-30, asked 「決策地圖 v2 上次補回的摺疊（AF DP-07/08 下的中風／血管病史、目前活動性出血、血流動力學不穩定、抗凝不可逆禁忌；DP-13 其餘 HAS-BLED 項；DP-17 心率／節律策略題組；兩頁 DP-03 的「其他症狀…」摺疊），Artifact 裡都沒有。要照 Artifact 拿掉嗎？（原版決策地圖和三區塊都保留）」, answered 「照 Artifact 拿掉」 | `visit-book-layout` 「DP-03 asks the pack's every-visit questions and nothing of the old cards」 |
| AF DP-03 「其他症狀、出血與副作用」 | **不顯示 on 決策地圖 v2**: only the pack's asks, as the Artifact | 三區塊 | Owner, in chat 2026-09-30, asked 「決策地圖 v2 上次補回的摺疊（AF DP-07/08 下的中風／血管病史、目前活動性出血、血流動力學不穩定、抗凝不可逆禁忌；DP-13 其餘 HAS-BLED 項；DP-17 心率／節律策略題組；兩頁 DP-03 的「其他症狀…」摺疊），Artifact 裡都沒有。要照 Artifact 拿掉嗎？（原版決策地圖和三區塊都保留）」, answered 「照 Artifact 拿掉」 | `visit-book-layout` 「asks only what the Artifact asks there…」 |
| AF question groups under DP-07, DP-08, DP-13, DP-17, DP-21 (血栓風險病史, 抗栓適應症, 瓣膜與當下安全, HAS-BLED 因子, 心率與節律, 共病與生活型態) and the rate-or-rhythm choice | The pack's own questions on the point's row, in the Artifact's style (DP-07 HCM; DP-08 valves; DP-13 NSAID／抗血小板, 飲酒; DP-17 靜息量測; DP-21 打鼾, 飲酒, 吸菸). **不顯示 on 決策地圖 v2**: the rest of those groups (stroke／vascular history, active bleeding, instability, the OAC contraindication, the other HAS-BLED items) and the rate-or-rhythm choice with its questions | 三區塊 | Owner, in chat 2026-09-30, asked 「決策地圖 v2 上次補回的摺疊（AF DP-07/08 下的中風／血管病史、目前活動性出血、血流動力學不穩定、抗凝不可逆禁忌；DP-13 其餘 HAS-BLED 項；DP-17 心率／節律策略題組；兩頁 DP-03 的「其他症狀…」摺疊），Artifact 裡都沒有。要照 Artifact 拿掉嗎？（原版決策地圖和三區塊都保留）」, answered 「照 Artifact 拿掉」; the pack's questions on the rows: chat 2026-09-30 「抗凝畫面設計要長得跟prototype一樣」 | `visit-book-layout` 「asks only what the Artifact asks there…」, 「AF chapters 4–6…」 |
| HF／AF status line: rhythm and the record's other values (Na, Hb, SpO₂, BMI) with per-value edit, the LVEF echo-report link, and 「補填／修改」 with the clinical-values editor (AF: the clinic-vitals form) | The pack's key values in the header, as the Artifact's, only to read. **不顯示 on 決策地圖 v2**: 「補填／修改」 and the editor it opens, the per-value links and the echo-report link | 三區塊; the report in the 報告 tab | Header: chat 2026-09-30, 「請你逐dp檢查有沒有樣式長得跟prototype一樣」; 補填／修改: Owner, in chat 2026-09-30: 「都照著CDSS小麻式版面原形，不要使用任何原本的外觀」 | `visit-book-layout` 「draws nothing of the other layouts' look」 (both modes) |
| 看依據's 「原文與完整卡片」 fold: the guideline quotes and each module's full card | 看依據 opens the Artifact's panel alone: 本病人（紀錄）, the criteria, 「什麼會改變答案」, 指引重點 and the sources. **不顯示 on 決策地圖 v2**: the quotes and the module cards | 三區塊 | Owner, in chat 2026-09-30: 「都照著CDSS小麻式版面原形，不要使用任何原本的外觀」 | `visit-book-layout` 「draws nothing of the other layouts' look」 (no `cdss-visit-detail-module-*`, no `details`, after 看依據 is opened) |
| The chapter footers: HF 病程時間軸; AF 病歷與本次量測 and 其他問答; the outlook cards and HF 預後模型; 其他已完成檢查 and the clinical handoff card under the page | **不顯示 on 決策地圖 v2**: the page ends with 「今天的計畫」, as the Artifact | 三區塊 | Owner, in chat 2026-09-30: 「都照著CDSS小麻式版面原形，不要使用任何原本的外觀」 | `visit-book-layout` 「draws nothing of the other layouts' look」 (no `cdss-visit-hf-record-foot`, `cdss-visit-af-record`, `cdss-visit-prognosis`, `cdss-visit-completed-checks`, `cdss-visit-outlook-module-*`) |
| AF 「完整 AF 篩檢風險檢核」 under DP-04／05／06, and any other question group a point's card carries beyond the pack's own questions | **不顯示 on 決策地圖 v2**: a point asks only the pack's own questions on its row | 三區塊 | Owner, in chat 2026-09-30: 「都照著CDSS小麻式版面原形，不要使用任何原本的外觀」 | `visit-book-layout` 「draws nothing of the other layouts' look」 (no `[data-af-question-group]`) |
| 「複製的病歷文字」 fold under 今天的計畫 | **不顯示 on 決策地圖 v2**: 「複製到病歷」 stays and copies the same text | 三區塊 | Owner, in chat 2026-09-30: 「都照著CDSS小麻式版面原形，不要使用任何原本的外觀」 | `visit-book-layout` 「draws nothing of the other layouts' look」 (no `cdss-visit-summary`) |
| A point's decision buttons (the map's button row, its 「其他」 menu, the recorded-decision card) | The Artifact's: the recommendation as the one filled button, the rest beside it or behind 「其他」 opening in place when there are three or more; once recorded, ✓ the choice, 「改」, and what to recheck. The same actions and the same record | — (layout only; the first 決策地圖 is retired) | Layout only: Owner, in chat 2026-09-30: 「都照著CDSS小麻式版面原形，不要使用任何原本的外觀」 | `visit-book-layout` 「draws nothing of the other layouts' look」 (no `[data-slot="button"]`), the decision cases in both modes |
| 決策地圖's 「今天要決定」 queue and 01's 診斷／追蹤 switch | Each point decides on its own row or box; the decision-map rail marks what is open; 「今天的計畫」 lists what was decided | — (layout only; the first 決策地圖 is retired) | Layout only; owner added 決策地圖 v2 to the switch in 8273f5cb, 2026-09-30 | `visit-book-layout` 「records a chain in its box and marks it settled in the map」 |

## Adding or changing a gate

HF new-flow clinical information card: owner requested replacing the height tile with calculated BMI on 2026-09-12. Height remains editable in the shared clinical-values dialog; BMI is only displayed when positive height and weight are available, and its tooltip includes both measurement dates. Other values use two rows beside LVEF on desktop.

1. Decide the kind. If it is 不顯示, stop and ask the owner before writing code.
2. Put a `Visible behaviour changes:` section in the commit message that says,
   in one line per surface, what a user on which route can no longer see or
   do — or write `Visible behaviour changes: none`.
3. Add or update the row above in the same commit.
4. A test must cover the route where the surface is *kept*, not only the route
   where it is hidden (`__tests__/features/clinical-decision-support/pilot-pack-registry.test.ts`
   and `__tests__/application/hooks/use-beta-features.test.tsx` are the pattern).

- HF 門診流程：依使用者要求移除重複的「補完心超數值」按鈕；仍可點擊 HFA-PEFF／H₂FPEF 名稱開啟相同計算機並補填資料。

## HMC dyslipidemia pilot

2026-09-16: owner explicitly authorized the two pilot/hmc branches and preview overlay. The disease list now includes heart failure and dyslipidemia. Dyslipidemia retains its existing Beta/pilot visibility rule; the vghtpe hand-off honours Beta, while other unattended Medcloud routes continue to show released packs only. No existing clinical surface is removed.

## AF pilot preview

AF is listed alongside HF and lipid in the HMC host, including production builds for `/app-hmc/`. The existing Beta and unattended launch rules apply; HF remains the default. Owner authorized AF integration and deployment on 2026-09-19.

## Optional private integrations (all routes)

| Surface | Behaviour | Owner decision |
|---|---|---|
| CDSS「個人化照護指引」與 CDSS 試辦 pack 控制，在 `/`、`/app/`、`/app-hmc/` 及各啟動參數 | Build without the complete CDSS package group: omit the tab and pack controls. With the packages installed: retain all existing Beta, audience and hospital-launch rules. Main clinical reports, AI summary, calculators and FHIR imports remain available. | Explicit owner clarification in chat, 2026-09-30 |
| 健康存摺 SDK JSON 匯入，在 `/`、`/app/`、`/app-hmc/` 及各啟動參數 | Missing SDK browser artifact or declaration: advertise FHIR Bundle import only and reject SDK JSON with a clear message. With the vendored artifact: retain SDK conversion without requiring the private source repo. | Explicit owner clarification in chat, 2026-09-30 |
| 民眾模式（patient）＋ Beta「個人化衛教」，在 `/`、`/app/`、`/app-hmc/` 及各啟動參數 | Build without the complete education package group: retain the existing patient/Beta entry and show「此部署尚未安裝個人化衛教內容。」; personalized education content is unavailable. With the packages installed: retain the original education content and all existing audience/Beta launch rules. | Owner explicitly approved the unavailable-content notice on these three routes in chat, 2026-09-30 |
