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

- 高血脂看診流程（2026-09-13）：五個分頁區塊（風險與目標／檢驗資料／治療決策／健保條件／追蹤與紀錄）改為與心衰竭同一套五張卡。獨立的「健保條件」分頁移除；它列出的每一句給付判定都改到對應的處置列上，全文收在「條文」裡。版面切換器（新版流程／原版看板）在高血脂路徑也會出現；原版看板與 classic 不變。心衰竭無任何可見變更。

## Dyslipidemia review branch (2026-09-12)

The host additionally lists `hyperlipidemia-cdss` as an unreleased pack. Existing Beta and pilot visibility rules apply; HF remains enabled and the default. On the ordinary and vghtpe routes, Beta exposes the lipid pathway. Other unattended Medcloud routes continue to show released HF only. No existing surface is removed. The app branch requires the matching personalization source build; it is not a production package release.
