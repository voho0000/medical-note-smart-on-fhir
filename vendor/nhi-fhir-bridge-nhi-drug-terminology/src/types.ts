export const NHI_DRUG_TERMINOLOGY_DATASET = "https://data.gov.tw/dataset/23715";
export const NHI_DRUG_TERMINOLOGY_RESOURCE_ID = "A21030000I-E41001-001";
export const NHI_DRUG_CODE_SYSTEM =
	"https://twcore.mohw.gov.tw/CodeSystem/nhi-drug-code";
export const ATC_CODE_SYSTEM = "http://www.whocc.no/atc";

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
