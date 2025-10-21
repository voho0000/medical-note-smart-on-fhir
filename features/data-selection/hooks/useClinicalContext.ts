// features/data-selection/hooks/useClinicalContext.ts
"use client";

import { useDataSelection } from "@/features/data-selection/hooks/useDataSelection";
import { useClinicalData } from "@/lib/providers/ClinicalDataProvider";

/**
 * TYPES
 */
export interface ClinicalContextSection {
  title: string;
  items: string[];
}

export type TimeRange =
  | "24h"
  | "3d"
  | "1w"
  | "1m"
  | "3m"
  | "6m"
  | "1y"
  | "all";

export interface DataFilters {
  reportTimeRange?: TimeRange;
  vitalSignsTimeRange?: TimeRange;
  labReportVersion?: "latest" | "all";
}

export type UseClinicalContextReturn = {
  getClinicalContext: () => ClinicalContextSection[];
  formatClinicalContext: (sections: ClinicalContextSection[]) => string;
  getFormattedClinicalContext: () => string;
};

// ---- Minimal FHIR-ish shapes we actually use in this hook ----
interface CodeText { text?: string }
interface ValueQuantity { value?: number | string; unit?: string }
interface Observation {
  id?: string;
  code?: CodeText;
  valueQuantity?: ValueQuantity;
  valueString?: string;
  effectiveDateTime?: string;
}
interface DiagnosticReport {
  id?: string;
  code?: CodeText; // panel/test name
  result?: Array<{ reference?: string }>; // references to Observation
  conclusion?: string;
  effectiveDateTime?: string;
}

export type ClinicalData = {
  diagnoses?: Array<{ code?: CodeText }>;
  medications?: Array<{ medicationCodeableConcept?: CodeText }>;
  allergies?: Array<{ code?: CodeText }>;
  diagnosticReports?: DiagnosticReport[];
  observations?: Observation[];
  vitalSigns?: Observation[];
  vitals?: Observation[]; // some sources use this name
};

/**
 * Hook
 */
export function useClinicalContext(): UseClinicalContextReturn {
  const { selectedData, filters } = useDataSelection() as {
    selectedData: {
      conditions?: boolean;
      medications?: boolean;
      allergies?: boolean;
      diagnosticReports?: boolean;
      observations?: boolean; // includes vitals when true
    };
    filters?: DataFilters;
  };

  const clinicalData = (useClinicalData() as ClinicalData | null) ?? null;

  // Helper: check if a date is within the specified time range
  const isWithinTimeRange = (dateString: string | undefined, range: TimeRange): boolean => {
    if (!dateString) return false;
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return false;

    if (range === "all") return true;

    const now = new Date();
    const startDate = new Date(now);

    switch (range) {
      case "24h":
        startDate.setDate(now.getDate() - 1);
        break;
      case "3d":
        startDate.setDate(now.getDate() - 3);
        break;
      case "1w":
        startDate.setDate(now.getDate() - 7);
        break;
      case "1m":
        startDate.setMonth(now.getMonth() - 1);
        break;
      case "3m":
        startDate.setMonth(now.getMonth() - 3);
        break;
      case "6m":
        startDate.setMonth(now.getMonth() - 6);
        break;
      case "1y":
        startDate.setFullYear(now.getFullYear() - 1);
        break;
      default:
        return true;
    }

    return date >= startDate;
  };

  // Helper: format sections to a single string
  const formatClinicalContext = (sections: ClinicalContextSection[]): string => {
    if (!sections || sections.length === 0) return "No clinical data available.";

    return sections
      .filter((section) => section?.items?.length > 0)
      .map((section) => {
        const title = section.title || "Untitled";
        const items = section.items.map((item) => `- ${item}`).join("\n");
        return `${title}:\n${items}`;
      })
      .filter(Boolean)
      .join("\n\n");
  };

  // Core: build clinical context list
  const getClinicalContext = (): ClinicalContextSection[] => {
    const context: ClinicalContextSection[] = [];
    const observationIdsInReports = new Set<string>();

    if (!clinicalData) return context;

    // Small utility to map + filter
    const mapAndFilter = <T,>(
      items: T[] | undefined,
      mapper: (item: T) => string | undefined | null,
    ): string[] => {
      if (!items) return [];
      return items.map(mapper).filter((x): x is string => Boolean(x));
    };

    // Conditions
    if (selectedData.conditions && clinicalData.diagnoses?.length) {
      const items = mapAndFilter(clinicalData.diagnoses, (d) => d.code?.text || "Unknown diagnosis");
      if (items.length) context.push({ title: "Patient's Conditions", items });
    }

    // Medications
    if (selectedData.medications && clinicalData.medications?.length) {
      const items = mapAndFilter(
        clinicalData.medications,
        (m) => m.medicationCodeableConcept?.text || "Unknown medication",
      );
      if (items.length) context.push({ title: "Patient's Medications", items });
    }

    // Allergies
    if (selectedData.allergies && clinicalData.allergies?.length) {
      const items = mapAndFilter(clinicalData.allergies, (a) => a.code?.text || "Unknown allergy");
      if (items.length) context.push({ title: "Patient's Allergies", items });
    }

    // Diagnostic Reports
    if (selectedData.diagnosticReports && clinicalData.diagnosticReports?.length) {
      const reportObservations = new Map<string, Observation[]>();

      const filteredReports = clinicalData.diagnosticReports.filter((report) =>
        isWithinTimeRange(report.effectiveDateTime, filters?.reportTimeRange ?? "1m"),
      );

      if (filteredReports.length === 0) {
        context.push({ title: "Diagnostic Reports", items: ["No reports found within the selected time range."] });
      } else {
        // Build reportId -> observations[] map and collect obs ids
        filteredReports.forEach((report) => {
          const observations: Observation[] = [];
          report.result?.forEach((result) => {
            const id = result.reference?.split("/").pop();
            if (!id) return;
            observationIdsInReports.add(id);
            const obs = clinicalData.observations?.find((o) => o.id === id);
            if (obs) observations.push(obs);
          });
          if (report.id) reportObservations.set(report.id, observations);
        });

        // Latest per panel name
        const reportsByPanel = new Map<string, DiagnosticReport>();
        const sortedReports = [...filteredReports].sort((a, b) => (b.effectiveDateTime || "").localeCompare(a.effectiveDateTime || ""));

        sortedReports.forEach((report) => {
          const panelName = report.code?.text;
          if (!panelName) return;
          if (!reportsByPanel.has(panelName)) {
            reportsByPanel.set(panelName, report);
            // console.debug("Selected report for panel", { panelName, id: report.id, date: report.effectiveDateTime });
          }
        });

        const latestReports = filters?.labReportVersion === "latest" ? Array.from(reportsByPanel.values()) : sortedReports;

        const items: string[] = [];
        latestReports.forEach((report) => {
          const observations = (report.id ? reportObservations.get(report.id) : undefined) ?? [];
          const observationTexts = observations
            .map((obs) => {
              const value = obs.valueQuantity?.value ?? obs.valueString;
              const unit = obs.valueQuantity?.unit ? ` ${obs.valueQuantity.unit}` : "";
              return value !== undefined && value !== null ? `${obs.code?.text || "Test"}: ${value}${unit}` : null;
            })
            .filter(Boolean) as string[];

          const datePart = report.effectiveDateTime
            ? ` (${new Date(report.effectiveDateTime).toLocaleDateString()})`
            : "";

          if (observationTexts.length) {
            items.push(`${report.code?.text}${datePart}`);
            observationTexts.forEach((t) => items.push(`  • ${t}`));
          } else if (report.conclusion) {
            items.push(`${report.code?.text || "Report"}: ${report.conclusion}${datePart}`);
          }
        });

        if (items.length) {
          context.push({
            title: `Diagnostic Reports${filters?.labReportVersion === "latest" ? " (Latest Versions Only)" : ""}`,
            items,
          });
        }
      }
    }

    // Vital Signs (plus any provided in `vitals`)
    if (selectedData.observations) {
      const allVitalSigns = [
        ...(clinicalData.vitalSigns ?? []),
        ...(clinicalData.vitals ?? []),
      ];

      if (allVitalSigns.length === 0) {
        context.push({ title: "Vital Signs", items: ["No vital signs data available."] });
      } else {
        // Deduplicate by id
        const uniqueVitalSigns = Array.from(new Map(allVitalSigns.map((v) => [v.id, v])).values());

        const filteredVitalSigns = uniqueVitalSigns.filter((obs) =>
          isWithinTimeRange(obs.effectiveDateTime, filters?.vitalSignsTimeRange ?? "1m"),
        );

        if (filteredVitalSigns.length === 0) {
          context.push({ title: "Vital Signs", items: ["No vital signs found within the selected time range."] });
        } else {
          // Group by type
          const byType = new Map<string, Observation[]>();
          filteredVitalSigns.forEach((obs) => {
            const type = obs.code?.text || "Unknown";
            if (!byType.has(type)) byType.set(type, []);
            byType.get(type)!.push(obs);
          });

          byType.forEach((observations, type) => {
            const latest = [...observations].sort((a, b) => (b.effectiveDateTime || "").localeCompare(a.effectiveDateTime || ""))[0];
            const value = latest.valueQuantity?.value ?? latest.valueString;
            const unit = latest.valueQuantity?.unit ?? "";
            if (value !== undefined && value !== null) {
              context.push({ title: type, items: [`${String(value)} ${unit}`.trim()] });
            }
          });
        }
      }
    }

    // Additional (standalone) observations (exclude vitals & those attached to reports)
    if (selectedData.observations && clinicalData.observations?.length) {
      const vitalIds = new Set<string | undefined>([
        ...(clinicalData.vitalSigns ?? []).map((v) => v.id),
        ...(clinicalData.vitals ?? []).map((v) => v.id),
      ]);

      const standalone = clinicalData.observations.filter(
        (obs) => !vitalIds.has(obs.id) && !observationIdsInReports.has(String(obs.id)),
      );

      if (standalone.length) {
        const filtered = standalone.filter((obs) =>
          isWithinTimeRange(obs.effectiveDateTime, filters?.vitalSignsTimeRange ?? "1m"),
        );

        if (filtered.length === 0) {
          context.push({ title: "Additional Observations", items: ["No observations found within the selected time range."] });
        } else {
          const latestByCode = new Map<string, Observation>();
          filtered.forEach((obs) => {
            const code = obs.code?.text || "Unknown";
            const existing = latestByCode.get(code);
            if (!existing || (obs.effectiveDateTime || "") > (existing.effectiveDateTime || "")) {
              latestByCode.set(code, obs);
            }
          });

          const items = Array.from(latestByCode.values())
            .map((obs) => {
              const value = obs.valueQuantity?.value ?? obs.valueString;
              const unit = obs.valueQuantity?.unit ? ` ${obs.valueQuantity.unit}` : "";
              return value !== undefined && value !== null ? `${obs.code?.text || "Observation"}: ${value}${unit}` : null;
            })
            .filter(Boolean) as string[];

          if (items.length) context.push({ title: "Additional Observations", items });
        }
      }
    }

    return context;
  };

  const getFormattedClinicalContext = (): string => formatClinicalContext(getClinicalContext());

  // Return the hook API
  return {
    getClinicalContext,
    formatClinicalContext,
    getFormattedClinicalContext,
  };
}
