import generatedSnapshot from "../data/nhi-drug-terminology-20260728.json";
import type { NhiDrugTerminologySnapshot } from "./types";

/**
 * Immutable official snapshot bundled for deterministic, offline app-side
 * lookup. The raw 97 MB NHI CSV and patient data are never shipped.
 */
export const NHI_DRUG_TERMINOLOGY_SNAPSHOT =
	generatedSnapshot as unknown as NhiDrugTerminologySnapshot;

export const NHI_DRUG_TERMINOLOGY_MANIFEST =
	NHI_DRUG_TERMINOLOGY_SNAPSHOT.manifest;
