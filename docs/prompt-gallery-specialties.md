# Prompt gallery specialties

Reviewed 2026-09-03. Gallery filtering and template publishing use the same 37
options in `features/prompt-gallery/constants/prompt-specialties.ts`.

## Sources

- [MOHW, 專科醫師分科及甄審辦法, 2026-05-07 publication](https://www.mohw.gov.tw/cp-7407-86295-1.html),
  article 8: 25 physician specialties, including critical care and infectious
  diseases in the 2026 amendment. All 25 are represented. ENT uses the updated
  耳鼻喉頭頸外科 name.
- [內科專科醫師訓練計畫認定基準, 2024-12-12 amendment, Taiwan Society of Internal Medicine](https://www.tsim.org.tw/ehc-tsim/s/viewArticleFile?articleId=430c4afd613d4a6a8da71956dc00548a),
  §3.1.2 note 1: cardiology, gastroenterology, pulmonology, nephrology,
  rheumatology, immunology, hematology, oncology, endocrinology, and infectious
  diseases. All 10 have distinct options.

## Product behavior

- Both pickers start with five groups. Opening a group replaces the list with
  that group's specialties; a fixed back action returns to the groups. Sharing
  preserves selections across groups and shows each group's selected count.
- Menu groups help navigation; they do not imply a legal certification hierarchy.
  The 10 training subspecialties are not described as 10 separate MOHW boards.
  Infectious diseases has one shared tag even though it appears in both sources.
- Existing general, internal medicine, surgery, pathology, and other tags remain
  valid. Stored templates are not reclassified or migrated automatically.
- Selecting internal medicine includes all 10 subspecialties; selecting pathology
  includes anatomic and clinical pathology. Specific selections match only their
  own tag. The same expansion applies to all templates and the author's templates,
  with or without a type filter.
- Physician specialty filters remain hidden for the patient audience.
