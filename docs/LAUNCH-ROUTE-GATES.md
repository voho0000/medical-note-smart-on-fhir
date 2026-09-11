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

## Adding or changing a gate

1. Decide the kind. If it is 不顯示, stop and ask the owner before writing code.
2. Put a `Visible behaviour changes:` section in the commit message that says,
   in one line per surface, what a user on which route can no longer see or
   do — or write `Visible behaviour changes: none`.
3. Add or update the row above in the same commit.
4. A test must cover the route where the surface is *kept*, not only the route
   where it is hidden (`__tests__/features/clinical-decision-support/pilot-pack-registry.test.ts`
   and `__tests__/application/hooks/use-beta-features.test.tsx` are the pattern).
