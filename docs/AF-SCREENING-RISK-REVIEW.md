# AF screening risk review — 2026-09-19

Sources: [ESC 2024, Tables 14/16 and screening](https://doi.org/10.1093/eurheartj/ehae176), [ACC/AHA 2023, Table 3](https://doi.org/10.1161/CIR.0000000000001193), [Lin 2015](https://doi.org/10.1161/JAHA.115.002192), [EHRA 2019](https://doi.org/10.1093/europace/euz046), [AHA sleep-disordered breathing 2022](https://doi.org/10.1161/CIR.0000000000001082).

## Implemented behavior

Diagnosis retains independently traceable PAC >76/24 h and >500/24 h prompts, plus echo atrial enlargement and OSA/OSAS. Strict > boundaries; other monitoring durations are not extrapolated. Mortality sensitivity/specificity are never presented as AF diagnostic accuracy. Confirmed AF retains these findings for review without a new screening mandate.

The expanded checklist covers cardiovascular/metabolic disease, lung/renal/thyroid disease, family/genetic history, lifestyle, structural/electrical markers, acute triggers and less established associations. Available positive facts or clinician-confirmed answers generate a screening review with evidence and next actions. Missing values remain unknown. Confirmed AF changes the action to follow-up and risk-factor management.

ESC pathway: age >=65 routine rhythm assessment; age >=75 or >=65 with additional CHA2DS2-VA factors prompts consideration of prolonged non-invasive ECG screening. Other individual risk markers prompt individualized assessment, not an invented universal Holter duration or an anticoagulation indication.

## Data coverage and limitations

Automatic inputs: existing structured diagnoses (HTN, diabetes, HF, CAD/MI, vascular/stroke, CKD, obesity, OSA), added ICD groups for valve disease, cardiomyopathy, congenital heart disease, hyperthyroidism, COPD, WPW/sick sinus and selected inflammatory disease; age, BMI and sex; existing PAC counts/duration. Explicit atrial-enlargement and OSA/OSAS text is extracted from available diagnostic reports and document narratives, with source/date and conservative negation/uncertainty/future filtering.

Available supported diagnoses, report text and measurements prefill the checklist directly. Physician input is optional correction, not a prerequisite. Only missing/ambiguous factors remain pending. Additional explicit report phrases cover smoking, heavy alcohol, inactivity, endurance exercise, family AF history, LVH, atrial dysfunction and selected diagnoses; no AF diagnosis is inferred from family history. Report scanning is conservative rule-based extraction, not exhaustive language understanding. LA values are now read automatically from explicit report/Observation labels and units. Prefer 2D LAVI >34 mL/m²; fallback AP dimension >40 mm for men or >38 mm for women is a secondary risk signal. Explicit 3D, missing units/sex, absent or ambiguous measurements remain pending. An AP dimension within range does not exclude volumetric enlargement. Same-date LAVI takes priority; newer evidence precedes older reports. Source: ASE/EACVI 2015 Table 4, Section 9, Supplemental Table 9 (https://asecho.org/wp-content/uploads/2016/02/2015_ChamberQuantificationREV.pdf). A remote infection or operation does not automatically become a current trigger.

Biomarkers (natriuretic peptides, troponin, inflammation; exploratory Lp(a)), body size/height, heart-rate variability, environmental/psychological and socioeconomic associations have no universal screening cutoff. The clinician can flag a reviewed association; arbitrary lab cutoffs, racial profiling, or inferred genetic risk are not used. This is a guideline-based clinical catalogue, not a claim that every published association is proven causal or exhaustively covered.

## Review

Preview uses localhost:3001 and the integrated HF/lipid/AF packages. No commit or push. Clinical copy is owned by the rules package; the host only adds the expandable checklist group.

## Checklist data map

| Risk category | Automatic facts when available | Optional correction |
|---|---|---|
| 高血壓 | hypertensionDiagnosis, afRisk_hypertension | hypertension |
| 糖尿病 | type1DiabetesDiagnosis, type2DiabetesDiagnosis, afRisk_diabetes | diabetes |
| 心衰竭 | heartFailureDiagnosis, afRisk_heartFailure | heartFailure |
| 冠心病／心肌梗塞 | coronaryArteryDiagnosis, myocardialInfarctionDiagnosis, priorMyocardialInfarction, coronaryArteryDisease | screening_cad |
| 瓣膜性心臟病 | afRiskValve, rheumaticMitralStenosis | screening_valve |
| 心肌病（含 HCM／心臟類澱粉沉積） | afRiskCardiomyopathy | screening_cardiomyopathy |
| 先天性心臟病（含 ASD） | afRiskCongenital | screening_congenital |
| 周邊血管病／動脈粥樣硬化 | peripheralArteryDiagnosis, ascvdDiagnosis, carotidStenosisDiagnosis | screening_vascular |
| 缺血性中風／TIA／動脈栓塞病史 | priorStrokeTiaEmbolism, ischemicStrokeDiagnosis, strokeOrTiaDiagnosis | stroke |
| 不明原因中風／ESUS（核對病因） | afRisk_esus | screening_esus |
| 慢性腎臟病 | ckdDiagnosis, afRisk_ckd | screening_ckd |
| 過重／肥胖 | obesityDiagnosis, afRisk_obesity | screening_obesity |
| 甲狀腺功能亢進（含亞臨床） | afRiskThyroid | screening_thyroid |
| 慢性阻塞性肺病 | afRiskCopd | screening_copd |
| 吸菸／菸草暴露 | afRisk_smoking | screening_smoking |
| 飲酒（尤其大量／暴飲） | afRisk_alcohol | screening_alcohol |
| 久坐／缺乏運動 | afRisk_inactive | screening_inactive |
| 長期高強度耐力運動 | afRisk_endurance | screening_endurance |
| AF 家族史／已知遺傳易感性 | afRisk_family | screening_family |
| 左心室肥厚 | afRisk_lvh, ecgLeftVentricularHypertrophy | screening_lvh |
| 心房功能異常／心房心肌病 | afRisk_atrialFunction | screening_atrialFunction |
| PR 延長／病竇症候群／WPW／短 QT | afRiskElectrical | screening_electrical |
| 近期心臟／胸腔／其他重大手術 | afRisk_surgery | screening_surgery |
| 近期感染／肺炎／敗血症 | afRisk_infection | screening_infection |
| 急性肺栓塞／心肌炎／心包炎／重症 | afRisk_acute | screening_acute |
| 自體免疫／慢性發炎疾病 | afRiskImmune | screening_immune |
| 癌症／可能致心律不整的癌症治療 | afRisk_cancer | screening_cancer |
| 興奮劑／非法藥物或其他致心律不整藥物暴露 | afRisk_substances | screening_substances |
| 已判讀異常的 BNP／NT-proBNP、troponin 或發炎指標 | afRisk_biomarkers | screening_biomarkers |
| 其他已確認風險線索（體型、環境、心理或社會因素） | afRisk_otherAssociation | screening_otherAssociation |

AF local launcher: `1-開工-atrial-fibrillation.cmd` calls `start-af-local.ps1`, preserving the current AF branch and all uncommitted changes. It does not invoke the pilot branch-switch/install/overlay workflow.

## 2026-09-19 介面確認

保留原本有／無／依病歷（待確定）按鈕，依病歷證據預填並可直接修正。PAC/APC 的兩個文獻門檻整合為 af-pac-screening 單一卡片；以可用 24 h 紀錄最高符合層級提示，展開保留所有量測、日期及兩篇文獻。
