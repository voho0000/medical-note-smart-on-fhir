# Dyslipidemia board — draft mapping (verify against a real dump first)

Pack: `hyperlipidemia-cdss` (`diseaseCode: 'LIPID'`, `packages/personalized-care/src/guideline-packs/hyperlipidemia-pack.ts`).
Not in `HOST_PACK_ORDER` yet — add it, and decide its position in the switcher.

Modules (catalog order):

| id | group | note |
|---|---|---|
| `dyslipidemia-severe-triglycerides` | monitoring | `domain: 'safety'`, overview `triglycerides` → becomes an **alert** when actionable |
| `dyslipidemia-severe-ldl` | assessment | overview `LDL` |
| `dyslipidemia-risk-and-target` | assessment | overview `LDL`; the risk category + target — candidate **headline** |
| `dyslipidemia-lipid-lowering-therapy` | treatment | overview `statinTherapy`; evidence rows `statinTherapy`, `statinAllergy`, `ezetimibeTherapy`, `pcsk9Therapy`, `bempedoicAcidTherapy`, `medicationListOverview` → **pillars, shape (b)** |
| `dyslipidemia-monitoring-and-markers` | monitoring | overview `LDL` |
| `ascvd-lipid-therapy` | treatment | shared HF/lipid module; check whether the lipid pack emits it |

Proposed sections — confirm each against the dump:

- **Headline**: `dyslipidemia-risk-and-target` `title` (risk category and LDL
  target as the pack words them) + the `LDL` evidence as the big number.
- **Inputs strip** (`kind: 'lab'` unless noted): `LDL`, `nonHDL`,
  `triglycerides`, `HDL`, `totalCholesterol`, `apolipoproteinB`,
  `lipoproteinA`, plus whatever safety facts the therapy module actually
  reads (`eGFR`? `HbA1c`?). Only facts that appear in some module's
  `patientEvidence`. `bloodPressure` / `bodyWeight` if the risk module
  reads them — then they are the clinic-enterable `measure` cells.
- **Alerts**: generic rule; severe TG will land here.
- **Pillars (shape b)**: statin / ezetimibe / PCSK9 inhibitor / bempedoic
  acid from the therapy module's evidence rows; the module's `title`
  (「降脂治療核對：statin 已確認使用；非 statin 1 類」) and badge as the
  group heading; every tile expands the same module detail. `statinAllergy`
  is a row worth showing on the statin tile when present.
- **Strip footer**: `dyslipidemia-monitoring-and-markers` title if it plays
  the "are the inputs fresh" role; otherwise leave the footer out.
- **Remainder**: `severe-ldl`, `monitoring` by status.

Open questions to settle from the dump, not by assumption: whether the
therapy module's `status` distinguishes "on statin, not at goal" from "no
statin"; whether the pack prints a target value anywhere (do not compute
one); which `measure` inputs, if any, the clinic form should offer.
