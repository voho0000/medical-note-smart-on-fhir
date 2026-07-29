import generatedHierarchy from "../data/atc-level2-2026.json";
import type { AtcLevel2Category, AtcLevel2HierarchySnapshot } from "./types";

const LEVEL_2_CODE_RE = /^[A-Z]\d{2}$/;
const FULL_ATC_CODE_RE = /^[A-Z]\d{2}[A-Z]{2}\d{2}$/;

export const ATC_LEVEL_2_HIERARCHY =
	generatedHierarchy as unknown as AtcLevel2HierarchySnapshot;

export const ATC_LEVEL_2_HIERARCHY_MANIFEST = ATC_LEVEL_2_HIERARCHY.manifest;

function hierarchyIndex(
	hierarchy: AtcLevel2HierarchySnapshot,
): Map<string, AtcLevel2Category> {
	return new Map(
		hierarchy.categories.map(([code, nameEn, nameZh]) => [
			code,
			{
				code,
				nameEn,
				...(nameZh ? { nameZh } : {}),
				hierarchySnapshotId: hierarchy.manifest.snapshotId,
			},
		]),
	);
}

const DEFAULT_INDEX = hierarchyIndex(ATC_LEVEL_2_HIERARCHY);

export function resolveAtcLevel2(
	atcCodeInput: string,
	hierarchy: AtcLevel2HierarchySnapshot = ATC_LEVEL_2_HIERARCHY,
): AtcLevel2Category | undefined {
	const atcCode = atcCodeInput.trim().toUpperCase();
	if (!LEVEL_2_CODE_RE.test(atcCode) && !FULL_ATC_CODE_RE.test(atcCode)) {
		return undefined;
	}
	const code = atcCode.slice(0, 3);
	const index =
		hierarchy === ATC_LEVEL_2_HIERARCHY
			? DEFAULT_INDEX
			: hierarchyIndex(hierarchy);
	return index.get(code);
}
