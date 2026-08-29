import { render, screen } from "@testing-library/react"

import { ChatInputArea } from "@/features/medical-chat/components/ChatInputArea"

const mockUseSlashMenu = jest.fn()

jest.mock("@/src/application/providers/language.provider", () => ({
  useLanguage: () => ({
    t: {
      chat: {
        placeholder: "Ask a clinical question",
        clearInput: "Clear",
        characters: "characters",
        cloudAiNotice: "Cloud AI",
        cloudAiNoticeLink: "Privacy",
      },
      common: { stop: "Stop", send: "Send" },
    },
  }),
}))

jest.mock("@/features/medical-chat/hooks/useSlashTemplates", () => ({
  useSlashTemplates: () => [],
}))

jest.mock("@/features/medical-chat/hooks/useSlashMenu", () => ({
  useSlashMenu: () => mockUseSlashMenu(),
}))

jest.mock("@/features/medical-chat/hooks/useMediaConsent", () => ({
  useMediaConsent: () => ({
    dialogOpen: false,
    accept: jest.fn(),
    decline: jest.fn(),
    withConsent: (callback: () => void) => callback(),
  }),
}))

jest.mock("@/features/medical-chat/components/MediaConsentDialog", () => ({
  MediaConsentDialog: () => null,
}))

jest.mock("@/features/medical-chat/components/VoiceRecorder", () => ({
  VoiceRecorder: () => null,
}))

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const baseProps = {
  textareaRef: { current: null },
  isLoading: false,
  onSend: jest.fn(async () => undefined),
  onStopGeneration: jest.fn(),
  voice: {
    isRecording: false,
    isAsrLoading: false,
    toggleRecording: jest.fn(),
    onRecordingStart: jest.fn(),
    onRecordingStop: jest.fn(async () => undefined),
    startRecordingRef: { current: jest.fn() },
    stopRecordingRef: { current: jest.fn() },
  },
}

describe("ChatInputArea mobile visual viewport", () => {
  beforeAll(() => {
    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      value: ResizeObserverMock,
    })
  })

  beforeEach(() => {
    mockUseSlashMenu.mockReturnValue({
      open: false,
      matches: [],
      active: 0,
      choose: jest.fn(),
      setActive: jest.fn(),
      syncCaret: jest.fn(),
      onKeyDown: jest.fn(() => false),
    })
  })

  it("caps a long template by the keyboard-safe viewport while preserving its value", () => {
    const template = "A complete clinical summary template that must not be truncated in state"
    render(
      <ChatInputArea
        input={{
          input: template,
          setInput: jest.fn(),
          handleKeyDown: jest.fn(),
        }}
        {...baseProps}
      />,
    )

    const input = screen.getByPlaceholderText("Ask a clinical question")
    expect(input).toHaveValue(template)
    expect(input).toHaveStyle({
      maxHeight: "min(200px, calc(var(--app-viewport-height, 100svh) * 0.16))",
    })
    expect(document.querySelector('[data-keyboard-collapsible="true"]')).toHaveClass(
      '[html[data-keyboard-open=true]_&]:hidden',
    )
  })

  it("portals the slash menu outside the clipping composer container", () => {
    mockUseSlashMenu.mockReturnValue({
      open: true,
      matches: [{ id: 'safety', label: 'Safety check', body: 'Check safety', shortcut: 'safety' }],
      active: 0,
      choose: jest.fn(),
      setActive: jest.fn(),
      syncCaret: jest.fn(),
      onKeyDown: jest.fn(() => false),
    })

    const { container } = render(
      <ChatInputArea
        input={{
          input: "/",
          setInput: jest.fn(),
          handleKeyDown: jest.fn(),
        }}
        {...baseProps}
      />,
    )

    const input = screen.getByPlaceholderText("Ask a clinical question")
    const menu = screen.getByRole('listbox')

    expect(document.body).toContainElement(menu)
    expect(container).not.toContainElement(menu)
    expect(input).toHaveAttribute('aria-expanded', 'true')
    expect(input).toHaveAttribute('aria-controls', menu.id)
    expect(input).toHaveAttribute('aria-activedescendant', `${menu.id}-option-0`)
  })
})
