---
name: ckd-flowchart-doc
description: Build or update the CKD module decision-flow document — the HTML at docs/ckd-module-flowcharts/ and the paginated A4 PDF a clinician reads. Use when asked to regenerate that PDF, add or change a module's flowchart or KDIGO citations, compress a module onto fewer pages, or reconcile the document with what ckd-pack.ts actually does.
---

# CKD module decision-flow document

A hand-written audit document: for each of the 16 modules in `ckd-cdss`, the
decision tree the code actually walks, the status and priority each branch
produces, and the KDIGO statements the pack cites — quoted verbatim.

It is read by clinicians outside this project. It is not a development log.

## Files

```
docs/ckd-module-flowcharts/
  ckd-flowcharts.html   the source; edit this
  build-pdf.mjs         paginates and prints CKD模組決策流程_v<packVersion>.pdf
  check-citations.mjs   compares the quotations with the evidence indexes
```

## Build

```bash
node docs/ckd-module-flowcharts/build-pdf.mjs
```

It refuses to print if the citations have drifted, lays every top-level block
out under print media at the exact content box (718×1046 px = A4 less 10 mm
margins), packs consecutive blocks into pages, writes the page breaks back into
the HTML as a `pb` class, and prints. **Re-run after every content change** —
the grouping is only valid for the heights it was computed from. Its log names
any module that spills past one page.

Publish with the Artifact tool to the existing URL so the link keeps working,
and send the PDF with SendUserFile.

## Rules this document is held to

**Quote KDIGO and only KDIGO.** The reader should need one PDF open. Where the
Taiwan guideline differs, name the difference in prose rather than quoting it.
Verify every quotation against the guideline PDF before writing it — never from
memory.

**The quotations must match the evidence index.** `check-citations.mjs` compares
quotation *text* against `citedStatements` in
`mediprisma-personalization/.../knowledge-packs/evidence-indexes/kdigo-*.json`.
It only catches statements the index has and the document lacks. The reverse —
a card asserting something the index never cited — is not mechanically
detectable; check it by hand when a card's wording makes a claim.

**No development narrative.** No "this card used to…", "已移除", "先前顯示的是…".
State the current design and the reason for it, never the history of the edit.

**Headings carry no numbers.** Not the patient's measurements and not the
guideline's thresholds — a number in a heading reads as this patient's value.
The card body carries the threshold; a heading that needs to name a criterion
uses its short name (see `criterion()` in `ckd-pack.ts`).

**The document tracks the code, not the intention.** Whenever `ckd-pack.ts`
changes behaviour, update the affected decision tree, its `status · priority`
chips, and any coverage table in the same pass. A sweep across many synthetic
profiles is the way to check that every chip drawn is a state the pack can
actually emit.

## Layout notes that cost time to learn

- **Print overrides belong at the end of the stylesheet.** The `@media print`
  block sits mid-document and the general rules follow it; a media query adds no
  specificity, so anything the later rules restate wins back. There is a second
  print block at the very end for typographic tuning — put new print rules there.
- **`.cite .ref` must stay breakable.** Keeping a whole citation entry together
  pushes a 700 px block onto the next sheet and wastes a third of a page. Only
  the individual `blockquote` is unbreakable.
- **`.split` puts a decision tree beside its lookup tables**, and `.duo` pairs
  two tables. Both turn a two-page module into one without deleting anything;
  reach for them before trimming content.
- Root font-size is 12 px, so `42rem` in a container query is 504 px, not 672.

## Recovering the source

If `docs/ckd-module-flowcharts/ckd-flowcharts.html` is ever lost, the published
artifact holds the last version: read it with the Artifact tool, then strip the
injected `…</head><body>` prefix — the document's own source starts at
`<title>`.
