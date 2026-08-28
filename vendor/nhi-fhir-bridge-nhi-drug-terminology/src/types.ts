export const NHI_DRUG_TERMINOLOGY_DATASET = "https://data.gov.tw/dataset/23715";
export const NHI_DRUG_TERMINOLOGY_RESOURCE_ID = "A21030000I-E41001-001";
export const NHI_DRUG_CODE_SYSTEM =
	"https://twcore.mohw.gov.tw/CodeSystem/nhi-drug-code";
export const ATC_CODE_SYSTEM = "http://www.whocc.no/atc";

export type AtcLevel2HierarchyManifest = {
	snapshotId: string;
	schemaVersion: "atc-level2-hierarchy-v1";
	release: string;
	sourceTitle: string;
	sourceUrl: string;
	sourceUpdatedDate: string;
	retrievedDate: string;
	categoryCount: number;
	officialEnglishCanonicalSha256: string;
	englishNameAuthority: string;
	chineseNameAuthority: string;
	chineseNamePolicy: string;
	copyrightNotice: string;
};

export type AtcLevel2CategoryRow = readonly [
	code: string,
	nameEn: string,
	nameZh: string,
];

export type AtcLevel2HierarchySnapshot = {
	manifest: AtcLevel2HierarchyManifest;
	categories: readonly AtcLevel2CategoryRow[];
};

export type AtcLevel2Category = {
	code: string;
	nameEn: string;
	nameZh?: string;
	hierarchySnapshotId: string;
};

export type AtcHierarchyManifest = {
	snapshotId: string;
	schemaVersion: "atc-hierarchy-v1";
	release: string;
	sourceTitle: string;
	sourceUrl: string;
	sourceUpdatedDate: string;
	retrievedDate: string;
	categoryCount: number;
	level2Count: number;
	level3Count: number;
	level4Count: number;
	officialEnglishCanonicalSha256: string;
	englishNameAuthority: string;
	chineseNameAuthority: string;
	chineseNamePolicy: string;
	copyrightNotice: string;
};

export type AtcHierarchyCategoryRow = readonly [
	code: string,
	nameEn: string,
	nameZh: string,
];

export type AtcHierarchySnapshot = {
	manifest: AtcHierarchyManifest;
	level2: readonly AtcHierarchyCategoryRow[];
	level3: readonly AtcHierarchyCategoryRow[];
	level4: readonly AtcHierarchyCategoryRow[];
};

export type AtcHierarchyCategory = AtcLevel2Category & {
	level: 2 | 3 | 4;
};

export type NhiDrugSnapshotManifest = {
	snapshotId: string;
	schemaVersion: "nhi-drug-terminology-snapshot-v1";
	sourceDatasetId: string;
	sourceDatasetUrl: string;
	sourceResourceId: string;
	sourceDownloadUrl: string;
	sourceUpdatedDate: string;
	generatedAt: string;
	sourceSha256: string;
	canonicalSha256: string;
	sourceRowCount: number;
	acceptedSourceRowCount: number;
	rejectedSourceRowCount: number;
	semanticRecordCount: number;
	drugCodeCount: number;
	atcRecordCount: number;
	atcLabelCount: number;
	earliestEffectiveDate: string;
	latestCoveredDate: string;
	license: string;
};

/**
 * Compact generated tuple:
 * code, validFrom, validTo, zh, en, ingredient, strength value, strength unit,
 * dose form, ATC, ATC English, ATC Chinese, official URL, single/compound.
 */
export type NhiDrugSnapshotRow = readonly [
	nhiDrugCode: string,
	validFrom: string,
	validTo: string,
	officialNameZh: string,
	officialNameEn: string,
	ingredientText: string,
	strengthValue: string,
	strengthUnit: string,
	doseForm: string,
	atcCode: string,
	atcNameEn: string,
	atcNameZh: string,
	officialProductUrl: string,
	compoundType: string,
];

export type NhiDrugTerminologySnapshot = {
	manifest: NhiDrugSnapshotManifest;
	rows: readonly NhiDrugSnapshotRow[];
};

export type NhiDrugTerminologyRecord = {
	nhiDrugCode: string;
	validFrom: string;
	validTo?: string;
	officialNameZh?: string;
	officialNameEn?: string;
	ingredientText?: string;
	strengthValue?: string;
	strengthUnit?: string;
	doseForm?: string;
	atcCode?: string;
	atcNameEn?: string;
	atcNameZh?: string;
	atcLevel2?: AtcLevel2Category;
	atcLevel3?: AtcHierarchyCategory;
	atcLevel4?: AtcHierarchyCategory;
	officialProductUrl?: string;
	compoundType?: string;
	snapshotId: string;
	recordId: string;
};

export type NhiDrugTerminologyResolutionStatus =
	| "resolved"
	| "date-required"
	| "unsupported-code"
	| "not-found"
	| "date-not-covered"
	| "snapshot-out-of-range"
	| "conflict";

export type NhiDrugTerminologyResolution = {
	status: NhiDrugTerminologyResolutionStatus;
	nhiDrugCode: string;
	prescriptionDate: string;
	snapshotId: string;
	record?: NhiDrugTerminologyRecord;
	candidates?: NhiDrugTerminologyRecord[];
};

export type NhiDrugTerminologyCoverageReport = {
	snapshotId: string;
	sourceCount: number;
	resolvedCount: number;
	atcResolvedCount: number;
	unresolvedCount: number;
	byStatus: Record<NhiDrugTerminologyResolutionStatus, number>;
};

export type NhiDrugTerminologyResolver = {
	readonly snapshot: NhiDrugTerminologySnapshot;
	readonly atcLevel2Hierarchy: AtcLevel2HierarchySnapshot;
	readonly atcHierarchy: AtcHierarchySnapshot;
	resolve(
		nhiDrugCode: string,
		prescriptionDate: string,
	): NhiDrugTerminologyResolution;
	resolveMany(
		inputs: readonly {
			nhiDrugCode: string;
			prescriptionDate: string;
		}[],
	): {
		resolutions: NhiDrugTerminologyResolution[];
		report: NhiDrugTerminologyCoverageReport;
	};
};
