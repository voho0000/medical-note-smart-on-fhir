import { sha1 } from "js-sha1";
import { ATC_LEVEL_2_HIERARCHY_MANIFEST } from "./atc-level2";
import { NHI_DRUG_TERMINOLOGY_MANIFEST } from "./snapshot";
import {
	ATC_CODE_SYSTEM,
	NHI_DRUG_CODE_SYSTEM,
	NHI_DRUG_TERMINOLOGY_DATASET,
	type NhiDrugTerminologyRecord,
} from "./types";

const SNAPSHOT_TAG_SYSTEM =
	"https://nhi-fhir-bridge.github.io/CodeSystem/drug-terminology-snapshot";
const EFFECTIVE_PERIOD_TAG_SYSTEM =
	"https://nhi-fhir-bridge.github.io/CodeSystem/drug-master-effective-period";
const ATC_HIERARCHY_TAG_SYSTEM =
	"https://nhi-fhir-bridge.github.io/CodeSystem/atc-hierarchy-snapshot";
const RECORD_IDENTIFIER_SYSTEM =
	"https://nhi-fhir-bridge.github.io/IdentifierSystem/drug-terminology-record";
const OFFICIAL_URL_IDENTIFIER_SYSTEM =
	"https://nhi-fhir-bridge.github.io/IdentifierSystem/nhi-drug-official-url";

function knowledgeId(record: NhiDrugTerminologyRecord): string {
	return sha1(["MedicationKnowledge", record.recordId].join("|")).slice(0, 32);
}

/**
 * Build a standard FHIR R4 MedicationKnowledge resource without custom
 * extensions. The source MedicationRequest remains unchanged and authoritative.
 */
export function buildMedicationKnowledge(
	record: NhiDrugTerminologyRecord,
): Record<string, unknown> {
	const display =
		record.officialNameEn || record.officialNameZh || record.nhiDrugCode;
	const text = record.officialNameZh || display;
	const identifiers: Array<Record<string, string>> = [
		{ system: RECORD_IDENTIFIER_SYSTEM, value: record.recordId },
	];
	if (record.officialProductUrl) {
		identifiers.push({
			system: OFFICIAL_URL_IDENTIFIER_SYSTEM,
			value: record.officialProductUrl,
		});
	}
	const synonyms = [record.officialNameZh, record.officialNameEn]
		.filter((value): value is string => Boolean(value))
		.filter((value, index, values) => values.indexOf(value) === index)
		.filter((value) => value !== text);
	const tags: Array<Record<string, string>> = [
		{
			system: SNAPSHOT_TAG_SYSTEM,
			code: record.snapshotId,
			display: "NHI drug terminology snapshot",
		},
		{
			system: EFFECTIVE_PERIOD_TAG_SYSTEM,
			code: `from:${record.validFrom}`,
			display: "Official drug record effective start",
		},
		{
			system: ATC_HIERARCHY_TAG_SYSTEM,
			code: ATC_LEVEL_2_HIERARCHY_MANIFEST.snapshotId,
			display: "ATC level 2 hierarchy snapshot",
		},
	];
	if (record.validTo) {
		tags.push({
			system: EFFECTIVE_PERIOD_TAG_SYSTEM,
			code: `to:${record.validTo}`,
			display: "Official drug record effective end",
		});
	}
	const resource: Record<string, unknown> = {
		resourceType: "MedicationKnowledge",
		id: knowledgeId(record),
		meta: {
			source: NHI_DRUG_TERMINOLOGY_DATASET,
			tag: tags,
		},
		identifier: identifiers,
		code: {
			coding: [
				{
					system: NHI_DRUG_CODE_SYSTEM,
					version: record.snapshotId,
					code: record.nhiDrugCode,
					display,
				},
			],
			text,
		},
	};
	if (synonyms.length > 0) resource.synonym = synonyms;
	if (record.doseForm) resource.doseForm = { text: record.doseForm };
	if (record.ingredientText) {
		resource.ingredient = [
			{
				itemCodeableConcept: { text: record.ingredientText },
			},
		];
	}
	if (record.atcCode) {
		const classifications: Array<Record<string, unknown>> = [
			{
				coding: [
					{
						system: ATC_CODE_SYSTEM,
						code: record.atcCode,
						...(record.atcNameEn ? { display: record.atcNameEn } : {}),
					},
				],
				text: record.atcNameZh || record.atcNameEn || record.atcCode,
			},
		];
		if (record.atcLevel2) {
			classifications.push({
				coding: [
					{
						system: ATC_CODE_SYSTEM,
						version: record.atcLevel2.hierarchySnapshotId,
						code: record.atcLevel2.code,
						display: record.atcLevel2.nameEn,
					},
				],
				text:
					record.atcLevel2.nameZh ||
					record.atcLevel2.nameEn ||
					record.atcLevel2.code,
			});
		}
		resource.medicineClassification = [
			{
				type: {
					text: "Anatomical Therapeutic Chemical classification",
				},
				classification: classifications,
			},
		];
	}
	return resource;
}

/**
 * Return a copy linked to MedicationKnowledge using the standard R4
 * supportingInformation field. Existing references are preserved.
 */
export function linkMedicationRequestToKnowledge(
	medicationRequest: Record<string, unknown>,
	medicationKnowledge: Record<string, unknown>,
): Record<string, unknown> {
	if (
		medicationRequest.resourceType !== "MedicationRequest" ||
		medicationKnowledge.resourceType !== "MedicationKnowledge" ||
		typeof medicationKnowledge.id !== "string"
	) {
		throw new Error(
			"Expected a MedicationRequest and an identified MedicationKnowledge.",
		);
	}
	const reference = `MedicationKnowledge/${medicationKnowledge.id}`;
	const existing = Array.isArray(medicationRequest.supportingInformation)
		? [...medicationRequest.supportingInformation]
		: [];
	if (
		!existing.some(
			(candidate) =>
				candidate &&
				typeof candidate === "object" &&
				(candidate as { reference?: unknown }).reference === reference,
		)
	) {
		existing.push({ reference });
	}
	return {
		...medicationRequest,
		supportingInformation: existing,
	};
}

/**
 * Build one audit resource for a batch of derived MedicationKnowledge
 * resources. The snapshot manifest is the provenance anchor; no patient data
 * is included in the terminology package or its source entity.
 */
export function buildDrugTerminologyProvenance(
	medicationKnowledgeResources: readonly Record<string, unknown>[],
	recorded: string,
): Record<string, unknown> | null {
	const timestamp = new Date(recorded);
	if (Number.isNaN(timestamp.valueOf())) {
		throw new Error("Provenance recorded time must be ISO 8601.");
	}
	const targetReferences = [
		...new Set(
			medicationKnowledgeResources
				.filter(
					(resource) =>
						resource.resourceType === "MedicationKnowledge" &&
						typeof resource.id === "string" &&
						resource.id.length > 0,
				)
				.map((resource) => `MedicationKnowledge/${resource.id}`),
		),
	].sort();
	if (targetReferences.length === 0) return null;
	const manifest = NHI_DRUG_TERMINOLOGY_MANIFEST;
	return {
		resourceType: "Provenance",
		id: sha1(
			[
				"drug-terminology-provenance",
				manifest.snapshotId,
				ATC_LEVEL_2_HIERARCHY_MANIFEST.snapshotId,
				...targetReferences,
			].join("|"),
		).slice(0, 32),
		target: targetReferences.map((reference) => ({ reference })),
		recorded: timestamp.toISOString().replace(/\.\d{3}Z$/, "Z"),
		policy: [manifest.sourceDatasetUrl, manifest.license],
		activity: {
			coding: [
				{
					system:
						"https://nhi-fhir-bridge.github.io/CodeSystem/drug-terminology-activity",
					code: "official-drug-master-lookup",
					display:
						"Resolve NHI drug code against a date-effective official snapshot",
				},
			],
		},
		agent: [
			{
				type: {
					coding: [
						{
							system:
								"http://terminology.hl7.org/CodeSystem/provenance-participant-type",
							code: "assembler",
							display: "Assembler",
						},
					],
				},
				who: {
					display: `@nhi-fhir-bridge/nhi-drug-terminology ${manifest.snapshotId}`,
				},
			},
		],
		entity: [
			{
				role: "source",
				what: {
					identifier: {
						system:
							"https://nhi-fhir-bridge.github.io/IdentifierSystem/open-data-resource",
						value: manifest.sourceResourceId,
					},
					display: `健保用藥品項查詢項目檔 (${manifest.sourceUpdatedDate}, SHA-256 ${manifest.sourceSha256})`,
				},
			},
			{
				role: "source",
				what: {
					identifier: {
						system:
							"https://nhi-fhir-bridge.github.io/IdentifierSystem/terminology-snapshot",
						value: ATC_LEVEL_2_HIERARCHY_MANIFEST.snapshotId,
					},
					display: ATC_LEVEL_2_HIERARCHY_MANIFEST.sourceTitle,
				},
			},
		],
	};
}
