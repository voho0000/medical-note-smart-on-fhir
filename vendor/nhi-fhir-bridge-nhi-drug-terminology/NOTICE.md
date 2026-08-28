# Data notice

The generated snapshot in this package is derived from Taiwan National Health
Insurance Administration and Taiwan Food and Drug Administration open data.

- NHI dataset: 健保用藥品項查詢項目檔
- Dataset page: https://data.gov.tw/dataset/23715
- Resource ID: `A21030000I-E41001-001`
- TFDA dataset: 藥品藥理治療分類 ATC 碼資料集
- TFDA dataset page: https://data.gov.tw/dataset/9119
- License: Government Open Data License, Taiwan, Version 1.0
- License URL: https://data.gov.tw/license

The 97 MB source CSV and TFDA source archive are not redistributed. The
runtime snapshot contains normalized terminology fields, effective periods,
source metadata, and cryptographic hashes. It contains no patient data.

The package also contains the ATC level 2-4 hierarchy from:

- WHO Collaborating Centre for Drug Statistics Methodology
- ATC classification index with DDDs, 2026
- https://atcddd.fhi.no/atc_ddd_index/

The WHO source copyright notice requires attribution and does not allow
commercial copying or distribution. The bundled hierarchy is therefore part
of this private module and must not be republished as a commercial terminology
dataset. The English hierarchy names are official. The zh-TW labels are
NHI-FHIR-BRIDGE display translations and are not official WHO or TFDA
translations. All 921 level 4 categories have an application-maintained
Taiwan clinical display label, retaining familiar English abbreviations where
appropriate; level 3 Chinese labels remain selective. The official WHO
English text is retained for provenance and user-facing original-text help.
