import { ATC_LEVEL_2_HIERARCHY, resolveAtcLevel2 } from "./atc-level2";
import {
	ATC_HIERARCHY,
	resolveAtcLevel3,
	resolveAtcLevel4,
} from "./atc-hierarchy";
import { NHI_DRUG_TERMINOLOGY_SNAPSHOT } from "./snapshot";
import type {
	AtcHierarchySnapshot,
	AtcLevel2HierarchySnapshot,
	NhiDrugSnapshotRow,
	NhiDrugTerminologyCoverageReport,
	NhiDrugTerminologyRecord,
	NhiDrugTerminologyResolution,
	NhiDrugTerminologyResolutionStatus,
	NhiDrugTerminologyResolver,
	NhiDrugTerminologySnapshot,
} from "./types";

const NHI_WESTERN_DRUG_CODE_RE = /^[A-Z][A-Z0-9]{9}$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function normalizedDrugCode(value: string): string {
	return value.trim().toUpperCase();
}

function isValidIsoDate(value: string): boolean {
	if (!ISO_DATE_RE.test(value)) return false;
	const parsed = new Date(`${value}T00:00:00Z`);
	return (
		!Number.isNaN(parsed.valueOf()) &&
		parsed.toISOString().slice(0, 10) === value
	);
}

function rowToRecord(
	row: NhiDrugSnapshotRow,
	snapshotId: string,
	rowIndex: number,
	atcLevel2Hierarchy: AtcLevel2HierarchySnapshot,
	atcHierarchy: AtcHierarchySnapshot,
): NhiDrugTerminologyRecord {
	const [
		nhiDrugCode,
		validFrom,
		validTo,
		officialNameZh,
		officialNameEn,
		ingredientText,
		strengthValue,
		strengthUnit,
		doseForm,
		atcCode,
		atcNameEn,
		atcNameZh,
		officialProductUrl,
		compoundType,
	] = row;
	const atcLevel2 = atcCode
		? resolveAtcLevel2(atcCode, atcLevel2Hierarchy)
		: undefined;
	const atcLevel3 = atcCode ? resolveAtcLevel3(atcCode, atcHierarchy) : undefined;
	const atcLevel4 = atcCode ? resolveAtcLevel4(atcCode, atcHierarchy) : undefined;
	return {
		nhiDrugCode,
		validFrom,
		...(validTo ? { validTo } : {}),
		...(officialNameZh ? { officialNameZh } : {}),
		...(officialNameEn ? { officialNameEn } : {}),
		...(ingredientText ? { ingredientText } : {}),
		...(strengthValue ? { strengthValue } : {}),
		...(strengthUnit ? { strengthUnit } : {}),
		...(doseForm ? { doseForm } : {}),
		...(atcCode ? { atcCode } : {}),
		...(atcNameEn ? { atcNameEn } : {}),
		...(atcNameZh ? { atcNameZh } : {}),
		...(atcLevel2 ? { atcLevel2 } : {}),
		...(atcLevel3 ? { atcLevel3 } : {}),
		...(atcLevel4 ? { atcLevel4 } : {}),
		...(officialProductUrl ? { officialProductUrl } : {}),
		...(compoundType ? { compoundType } : {}),
		snapshotId,
		recordId: `${snapshotId}:${nhiDrugCode}:${rowIndex}`,
	};
}

function emptyStatusCounts(): Record<
	NhiDrugTerminologyResolutionStatus,
	number
> {
	return {
		resolved: 0,
		"date-required": 0,
		"unsupported-code": 0,
		"not-found": 0,
		"date-not-covered": 0,
		"snapshot-out-of-range": 0,
		conflict: 0,
	};
}

export function createNhiDrugTerminologyResolver(
	snapshot: NhiDrugTerminologySnapshot,
	atcLevel2Hierarchy: AtcLevel2HierarchySnapshot = ATC_LEVEL_2_HIERARCHY,
	atcHierarchy: AtcHierarchySnapshot = ATC_HIERARCHY,
): NhiDrugTerminologyResolver {
	const rowsByCode = new Map<
		string,
		Array<{ row: NhiDrugSnapshotRow; rowIndex: number }>
	>();
	for (const [rowIndex, row] of snapshot.rows.entries()) {
		const rows = rowsByCode.get(row[0]) ?? [];
		rows.push({ row, rowIndex });
		rowsByCode.set(row[0], rows);
	}

	const resolve = (
		nhiDrugCodeInput: string,
		prescriptionDateInput: string,
	): NhiDrugTerminologyResolution => {
		const nhiDrugCode = normalizedDrugCode(nhiDrugCodeInput);
		const prescriptionDate = prescriptionDateInput.trim();
		const base = {
			nhiDrugCode,
			prescriptionDate,
			snapshotId: snapshot.manifest.snapshotId,
		};
		if (!NHI_WESTERN_DRUG_CODE_RE.test(nhiDrugCode)) {
			return { ...base, status: "unsupported-code" };
		}
		if (!isValidIsoDate(prescriptionDate)) {
			return { ...base, status: "date-required" };
		}
		if (prescriptionDate > snapshot.manifest.latestCoveredDate) {
			return { ...base, status: "snapshot-out-of-range" };
		}
		const rows = rowsByCode.get(nhiDrugCode);
		if (!rows) return { ...base, status: "not-found" };
		const matches = rows.filter(
			({ row }) =>
				row[1] <= prescriptionDate && (!row[2] || prescriptionDate <= row[2]),
		);
		if (matches.length === 0) {
			return { ...base, status: "date-not-covered" };
		}
		const candidates = matches.map(({ row, rowIndex }) =>
			rowToRecord(
				row,
				snapshot.manifest.snapshotId,
					rowIndex,
					atcLevel2Hierarchy,
					atcHierarchy,
				),
		);
		if (candidates.length !== 1) {
			return { ...base, status: "conflict", candidates };
		}
		return { ...base, status: "resolved", record: candidates[0] };
	};

	return {
		snapshot,
		atcLevel2Hierarchy,
		atcHierarchy,
		resolve,
		resolveMany(inputs) {
			const resolutions = inputs.map(({ nhiDrugCode, prescriptionDate }) =>
				resolve(nhiDrugCode, prescriptionDate),
			);
			const byStatus = emptyStatusCounts();
			let atcResolvedCount = 0;
			for (const resolution of resolutions) {
				byStatus[resolution.status] += 1;
				if (resolution.record?.atcCode) atcResolvedCount += 1;
			}
			const resolvedCount = byStatus.resolved;
			const report: NhiDrugTerminologyCoverageReport = {
				snapshotId: snapshot.manifest.snapshotId,
				sourceCount: resolutions.length,
				resolvedCount,
				atcResolvedCount,
				unresolvedCount: resolutions.length - resolvedCount,
				byStatus,
			};
			return { resolutions, report };
		},
	};
}

export const DEFAULT_NHI_DRUG_TERMINOLOGY_RESOLVER =
	createNhiDrugTerminologyResolver(NHI_DRUG_TERMINOLOGY_SNAPSHOT);

export function resolveNhiDrugTerminology(
	nhiDrugCode: string,
	prescriptionDate: string,
): NhiDrugTerminologyResolution {
	return DEFAULT_NHI_DRUG_TERMINOLOGY_RESOLVER.resolve(
		nhiDrugCode,
		prescriptionDate,
	);
}

export function resolveManyNhiDrugTerminologies(
	inputs: readonly {
		nhiDrugCode: string;
		prescriptionDate: string;
	}[],
): ReturnType<NhiDrugTerminologyResolver["resolveMany"]> {
	return DEFAULT_NHI_DRUG_TERMINOLOGY_RESOLVER.resolveMany(inputs);
}
