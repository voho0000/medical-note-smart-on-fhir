import generatedHierarchy from "../data/atc-hierarchy-2026.json";
import type {
	AtcHierarchyCategory,
	AtcHierarchyCategoryRow,
	AtcHierarchySnapshot,
} from "./types";

const FULL_ATC_CODE_RE = /^[A-Z]\d{2}[A-Z]{2}\d{2}$/;

export const ATC_HIERARCHY =
	generatedHierarchy as unknown as AtcHierarchySnapshot;

export const ATC_HIERARCHY_MANIFEST = ATC_HIERARCHY.manifest;

function hierarchyIndex(
	rows: readonly AtcHierarchyCategoryRow[],
	level: 2 | 3 | 4,
	hierarchy: AtcHierarchySnapshot,
): Map<string, AtcHierarchyCategory> {
	return new Map(
		rows.map(([code, nameEn, nameZh]) => [
			code,
			{
				code,
				nameEn,
				...(nameZh ? { nameZh } : {}),
				level,
				hierarchySnapshotId: hierarchy.manifest.snapshotId,
			},
		]),
	);
}

const DEFAULT_LEVEL_3_INDEX = hierarchyIndex(
	ATC_HIERARCHY.level3,
	3,
	ATC_HIERARCHY,
);
const DEFAULT_LEVEL_4_INDEX = hierarchyIndex(
	ATC_HIERARCHY.level4,
	4,
	ATC_HIERARCHY,
);

function resolveAtcLevel(
	atcCodeInput: string,
	level: 3 | 4,
	hierarchy: AtcHierarchySnapshot,
): AtcHierarchyCategory | undefined {
	const atcCode = atcCodeInput.trim().toUpperCase();
	if (!FULL_ATC_CODE_RE.test(atcCode)) return undefined;
	const code = atcCode.slice(0, level === 3 ? 4 : 5);
	const index = hierarchy === ATC_HIERARCHY
		? level === 3
			? DEFAULT_LEVEL_3_INDEX
			: DEFAULT_LEVEL_4_INDEX
		: hierarchyIndex(
			level === 3 ? hierarchy.level3 : hierarchy.level4,
			level,
			hierarchy,
		);
	return index.get(code);
}

export function resolveAtcLevel3(
	atcCodeInput: string,
	hierarchy: AtcHierarchySnapshot = ATC_HIERARCHY,
): AtcHierarchyCategory | undefined {
	return resolveAtcLevel(atcCodeInput, 3, hierarchy);
}

export function resolveAtcLevel4(
	atcCodeInput: string,
	hierarchy: AtcHierarchySnapshot = ATC_HIERARCHY,
): AtcHierarchyCategory | undefined {
	return resolveAtcLevel(atcCodeInput, 4, hierarchy);
}
