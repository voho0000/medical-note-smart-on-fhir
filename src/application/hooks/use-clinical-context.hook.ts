// features/data-selection/hooks/useClinicalContext.ts
"use client";

import { useCallback, useMemo } from "react";
import { useDataSelection } from "@/src/application/providers/data-selection.provider";
import { useClinicalData } from "@/src/application/providers/clinical-data.provider";
import { usePatient } from "@/src/application/providers/patient.provider";
import type { ClinicalContextSection, DataFilters, TimeRange } from "@/src/core/entities/clinical-context.entity";

export type UseClinicalContextReturn = {
  getClinicalContext: () => ClinicalContextSection[];
  formatClinicalContext: (sections: ClinicalContextSection[]) => string;
  getFormattedClinicalContext: () => string;
  supplementaryNotes: string;
  setSupplementaryNotes: (notes: string) => void;
  getFullClinicalContext: () => string;
  editedClinicalContext: string | null;
  setEditedClinicalContext: (context: string | null) => void;
  resetClinicalContextToDefault: () => void;
};

export { ClinicalContextSection };

// Age calculation is now in patient.entity.ts
function calculateAge(birthDate?: string | null): string {
  if (!birthDate) return "Unknown";
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return "Unknown";

  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age >= 0 ? `${age}` : "Unknown";
}

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

interface ProcedureResource {
  code?: {
    text?: string;
    coding?: Array<{ display?: string }>;
  };
  status?: string;
  performedDateTime?: string;
  performedPeriod?: {
    start?: string;
    end?: string;
  };
}

export type ClinicalData = {
  conditions?: Array<{ code?: CodeText }>;
  medications?: Array<{ medicationCodeableConcept?: CodeText }>;
  allergies?: Array<{ code?: CodeText }>;
  diagnosticReports?: DiagnosticReport[];
  observations?: Observation[];
  vitalSigns?: Observation[];
  procedures?: ProcedureResource[];
};

/**
 * Hook
 */
export function useClinicalContext(): UseClinicalContextReturn {
  const {
    selectedData,
    filters,
    supplementaryNotes,
    setSupplementaryNotes,
    editedClinicalContext,
    setEditedClinicalContext,
  } = useDataSelection() as {
    selectedData: {
      patientInfo?: boolean;
      conditions?: boolean;
      medications?: boolean;
      allergies?: boolean;
      diagnosticReports?: boolean;
      observations?: boolean; // includes vitals when true
      procedures?: boolean;
    };
    filters?: DataFilters;
    supplementaryNotes: string;
    setSupplementaryNotes: React.Dispatch<React.SetStateAction<string>>;
    editedClinicalContext: string | null;
    setEditedClinicalContext: React.Dispatch<React.SetStateAction<string | null>>;
  };

  const clinicalData = (useClinicalData() as ClinicalData | null) ?? null;
  const { patient: currentPatient } = usePatient();

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
  const formatClinicalContext = useCallback((sections: ClinicalContextSection[]): string => {
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
  }, []);

  // Core: build clinical context list
  const getClinicalContext = useCallback((): ClinicalContextSection[] => {
    const context: ClinicalContextSection[] = [];

    const patientInfo = currentPatient ?? null;
    if (selectedData.patientInfo && patientInfo) {
      const items: string[] = [];
      const gender = patientInfo.gender ? `${patientInfo.gender.charAt(0).toUpperCase()}${patientInfo.gender.slice(1)}` : null;
      if (gender) {
        items.push(`Gender: ${gender}`);
      }
      const age = calculateAge(patientInfo.birthDate);
      if (age !== "Unknown") {
        items.push(`Age: ${age}`);
      }
      if (items.length > 0) {
        context.push({ title: "Patient Information", items });
      }
    }

    if (!clinicalData) return context;

    const observationIdsInReports = new Set<string>();

    // Small utility to map + filter
    const mapAndFilter = <T,>(
      items: T[] | undefined,
      mapper: (item: T) => string | undefined | null,
    ): string[] => {
      if (!items) return [];
      return items.map(mapper).filter((x): x is string => Boolean(x));
    };

    // Conditions
    if (selectedData.conditions && clinicalData.conditions?.length) {
      const items = mapAndFilter(clinicalData.conditions, (d) => d.code?.text || "Unknown diagnosis");
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

    // Procedures
    if (selectedData.procedures && clinicalData.procedures?.length) {
      const items = mapAndFilter(clinicalData.procedures, (procedure) => {
        const name = procedure.code?.text || procedure.code?.coding?.[0]?.display || "Procedure";
        const performed = procedure.performedDateTime || procedure.performedPeriod?.end || procedure.performedPeriod?.start;
        const datePart = performed ? ` (${new Date(performed).toLocaleDateString()})` : "";
        const status = procedure.status ? ` – ${procedure.status}` : "";
        return `${name}${datePart}${status}`.trim();
      });

      if (items.length) {
        context.push({ title: "Procedures", items });
      }
    }

    // Vital Signs (plus any provided in `vitalSigns`)
    if (selectedData.observations) {
      const allVitalSigns = [
        ...(clinicalData.vitalSigns ?? []),
      ];

      if (allVitalSigns.length === 0) {
        context.push({ title: "Vital Signs", items: ["No vital signs data available."] });
      } else {
        // Deduplicate by id
        const uniqueVitalSigns = Array.from(new Map(allVitalSigns.map((v) => [v.id, v])).values());

        const filteredVitalSigns = uniqueVitalSigns.filter((obs: Observation) =>
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
      ]);

      const standalone = clinicalData.observations.filter(
        (obs) => !vitalIds.has(obs.id) && !observationIdsInReports.has(String(obs.id)),
      );

      if (standalone.length) {
        const filtered = standalone.filter((obs: Observation) =>
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
  }, [clinicalData, filters, selectedData]);

  const getFormattedClinicalContext = useCallback(
    (): string => formatClinicalContext(getClinicalContext()),
    [formatClinicalContext, getClinicalContext],
  );

  const getFullClinicalContext = useCallback((): string => {
    // Use edited version if available, otherwise use generated version
    const baseContext = editedClinicalContext ?? formatClinicalContext(getClinicalContext());
    if (supplementaryNotes.trim()) {
      return `${baseContext}\n\n## Supplementary Notes\n${supplementaryNotes}`;
    }
    return baseContext;
  }, [editedClinicalContext, formatClinicalContext, getClinicalContext, supplementaryNotes]);

  const resetClinicalContextToDefault = useCallback(() => {
    setEditedClinicalContext(null);
  }, [setEditedClinicalContext]);

  // Return the hook API
  return {
    getClinicalContext,
    formatClinicalContext,
    getFormattedClinicalContext,
    supplementaryNotes,
    setSupplementaryNotes,
    getFullClinicalContext,
    editedClinicalContext,
    setEditedClinicalContext,
    resetClinicalContextToDefault,
  };
}
