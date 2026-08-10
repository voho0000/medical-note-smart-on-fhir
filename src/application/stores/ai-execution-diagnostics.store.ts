import { create } from 'zustand'
import type { AiExecutionDiagnosticRecord } from '@/src/shared/utils/ai-execution-diagnostics'

export type {
  AiExecutionDiagnosticRecord,
  AiExecutionStatus,
} from '@/src/shared/utils/ai-execution-diagnostics'

interface AiExecutionDiagnosticsState {
  records: AiExecutionDiagnosticRecord[]
  addRecord: (record: AiExecutionDiagnosticRecord) => void
  clearOperation: (operationKey: string) => void
  clearOperationFeature: (operationKey: string, feature: string) => void
  clearFeature: (feature: string) => void
  clearAll: () => void
}

const MAX_SESSION_RECORDS = 100

/**
 * Session-only AI diagnostics. Clinical inputs are deliberately never
 * persisted: the user must explicitly download them from a visible control.
 */
export const useAiExecutionDiagnosticsStore = create<AiExecutionDiagnosticsState>()((set) => ({
  records: [],
  addRecord: (record) => set((state) => ({
    records: [...state.records, record].slice(-MAX_SESSION_RECORDS),
  })),
  clearOperation: (operationKey) => set((state) => ({
    records: state.records.filter((record) => record.operationKey !== operationKey),
  })),
  clearOperationFeature: (operationKey, feature) => set((state) => ({
    records: state.records.filter((record) => (
      record.operationKey !== operationKey || record.feature !== feature
    )),
  })),
  clearFeature: (feature) => set((state) => ({
    records: state.records.filter((record) => record.feature !== feature),
  })),
  clearAll: () => set({ records: [] }),
}))
