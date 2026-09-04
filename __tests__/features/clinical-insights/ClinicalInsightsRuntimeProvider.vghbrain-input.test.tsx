// The Clinical Insights runtime fits the SAME clinical selection as Medical
// Summary, so it must ask useClinicalAiInput for the same VGHBrain policy:
// a 100K clinical-token cap and no text truncation.
import { render } from "@testing-library/react"
import { ClinicalInsightsRuntimeProvider } from "@/features/clinical-insights/ClinicalInsightsRuntimeProvider"
import { VGHBRAIN_CLINICAL_TOKEN_LIMIT } from "@/src/shared/utils/vghbrain-context-policy"
import type { OpenAiCompatibleProfile } from "@/src/shared/types/openai-compatible.types"

const mockUseClinicalAiInput = jest.fn()
let mockModelId = "gpt-5.6-luna"
let mockProfiles: OpenAiCompatibleProfile[] = []

jest.mock("@/src/application/hooks/ai-generation/use-clinical-ai-input.hook", () => ({
  useClinicalAiInput: (...args: unknown[]) => {
    mockUseClinicalAiInput(...args)
    return {
      clinicalContext: "",
      piiLiterals: [],
      inputSignature: "",
      dataReady: false,
      contextAdaptation: null,
    }
  },
}))

jest.mock("@/src/application/hooks/clinical-data/use-clinical-data-query.hook", () => ({
  useClinicalData: () => ({
    isLoading: false,
    isFetching: false,
    error: null,
    hasBlockingQueryIssues: false,
  }),
}))

jest.mock("@/src/application/hooks/patient/use-patient-query.hook", () => ({
  usePatient: () => ({ patient: { id: "patient-1" } }),
}))

jest.mock("@/src/application/providers/audience.provider", () => ({
  useAudience: () => ({ audience: "clinician" }),
}))

jest.mock("@/src/application/providers/auth.provider", () => ({
  useAuth: () => ({ user: null, isAnonymous: true, loading: false }),
}))

jest.mock("@/src/application/providers/language.provider", () => ({
  useLanguage: () => ({ locale: "zh-TW" }),
}))

jest.mock("@/src/application/stores/ai-config.store", () => ({
  useAllApiKeys: () => ({
    apiKey: null,
    geminiKey: null,
    claudeKey: null,
    openAiCompatibleProfiles: mockProfiles,
  }),
}))

jest.mock("@/src/application/stores/model-prefs.store", () => ({
  useEffectiveModel: () => mockModelId,
}))

jest.mock("@/src/application/providers/clinical-insights-config.provider", () => ({
  useClinicalInsightsConfig: () => ({ panels: [] }),
}))

jest.mock("@/features/clinical-insights/hooks/useInsightGeneration", () => ({
  useInsightGeneration: () => ({
    runPanel: jest.fn(),
    runPanels: jest.fn(),
    stopPanel: jest.fn(),
    stopAll: jest.fn(),
    responses: {},
    panelStatus: {},
    setResponses: jest.fn(),
  }),
}))

jest.mock("@/features/clinical-insights/hooks/useInsightPanels", () => ({
  useInsightPanels: () => ({ prompts: {}, handlePromptChange: jest.fn() }),
}))

jest.mock("@/features/clinical-insights/hooks/useAutoGenerate", () => ({
  useAutoGenerate: () => undefined,
}))

jest.mock("@/src/application/hooks/ai-generation/ai-data-source", () => ({
  useAiDataSource: () => ({ source: "fhir", importId: null }),
}))

jest.mock("@/src/infrastructure/cache/encrypted-session-cache", () => ({
  aiResultCacheKey: (scope: string, id: string) => `${scope}:${id}`,
  contentSignature: (text: string) => `sig:${text.length}`,
  loadEncryptedCache: jest.fn(async () => null),
  removeEncryptedCache: jest.fn(),
  saveEncryptedCache: jest.fn(async () => undefined),
}))

const VGHBRAIN_PROFILE: OpenAiCompatibleProfile = {
  profileId: "vghtpe-tvghbrain",
  enabled: true,
  baseUrl: "https://whisper.vghtpe.gov.tw:30001/v1",
  modelId: "tvghbrain3.5",
  apiKey: "runtime-secret",
  transport: "direct",
}

describe("ClinicalInsightsRuntimeProvider clinical input policy", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockModelId = "gpt-5.6-luna"
    mockProfiles = []
  })

  it("caps clinical tokens at 100K and forbids text truncation for VGHBrain", () => {
    mockModelId = "openai-compatible-custom:vghtpe-tvghbrain"
    mockProfiles = [VGHBRAIN_PROFILE]
    render(<ClinicalInsightsRuntimeProvider><div /></ClinicalInsightsRuntimeProvider>)

    const [contextLimit, consumer, fraction, allowTextTruncation, maxClinicalTokens] =
      mockUseClinicalAiInput.mock.calls[0]
    expect(contextLimit).toBe(154_000)
    expect(consumer).toBe("insights")
    expect(fraction).toBe(1)
    expect(allowTextTruncation).toBe(false)
    expect(maxClinicalTokens).toBe(VGHBRAIN_CLINICAL_TOKEN_LIMIT)
  })

  it("leaves other models on the existing truncating fit", () => {
    render(<ClinicalInsightsRuntimeProvider><div /></ClinicalInsightsRuntimeProvider>)

    const [, consumer, fraction, allowTextTruncation, maxClinicalTokens] =
      mockUseClinicalAiInput.mock.calls[0]
    expect(consumer).toBe("insights")
    expect(fraction).toBe(1)
    expect(allowTextTruncation).toBe(true)
    expect(maxClinicalTokens).toBeUndefined()
  })
})
