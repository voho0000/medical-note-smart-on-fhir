import { create } from 'zustand'
import type { AiExecutionDiagnosticRecord } from '@/src/shared/utils/ai-execution-diagnostics'

export type {
  AiExecutionDiagnosticRecord,
  AiExecutionStatus,
} from '@/src/shared/utils/ai-execution-diagnostics'

interface AiExecutionDiagnosticsState {
  records: AiExecutionDiagnosticRecord[]
  addRecord: (record: AiExecutionDiagnosticRecord) => void
  markLatestOperationFeatureError: (
    operationKey: string,
    feature: string,
    errorMessage: string,
  ) => void
  clearOperation: (operationKey: string) => void
  clearOperationFeature: (operationKey: string, feature: string) => void
  clearFeature: (feature: string) => void
  clearAll: () => void
}

// Diagnostics may contain the complete clinical prompt and model output. Keep
// only the two newest requests in volatile tab memory; this store deliberately
// has no persistence middleware and never writes diagnostics to web storage.
const MAX_SESSION_RECORDS = 2

/**
 * Session-only AI diagnostics. Clinical inputs are deliberately never
 * persisted: the user must explicitly download them from a visible control.
 */
export const useAiExecutionDiagnosticsStore = create<AiExecutionDiagnosticsState>()((set) => ({
  records: [],
  addRecord: (record) => set((state) => ({
    records: [...state.records, record].slice(-MAX_SESSION_RECORDS),
  })),
  markLatestOperationFeatureError: (operationKey, feature, errorMessage) => set((state) => {
    let index = -1
    for (let candidate = state.records.length - 1; candidate >= 0; candidate -= 1) {
      const record = state.records[candidate]
      if (record.operationKey === operationKey && record.feature === feature) {
        index = candidate
        break
      }
    }
    if (index < 0) return state
    const records = [...state.records]
    records[index] = {
      ...records[index],
      hasError: true,
      errorMessage,
      status: 'error',
    }
    return { records }
  }),
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
