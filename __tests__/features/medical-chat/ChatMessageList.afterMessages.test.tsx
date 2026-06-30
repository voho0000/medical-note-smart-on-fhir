/**
 * @jest-environment jsdom
 */
// Locks the follow-up-chips PLACEMENT: the chips live at the bottom of the
// conversation thread (under the last message, scrolling with it like ChatGPT),
// NOT wedged into the composer/toolbar. ChatMessageList exposes an `afterMessages`
// slot rendered after the messages and before the scroll anchor; this test pins
// that DOM order so the chips can never drift back up into the input area.
import { render, screen } from '@testing-library/react'
import { ChatMessageList } from '@/features/medical-chat/components/ChatMessageList'
import { LanguageProvider } from '@/src/application/providers/language.provider'

// jsdom has no ResizeObserver (radix ScrollArea needs it) and react-markdown is
// heavy/irrelevant here — we only assert child ORDER, so stub both to passthroughs.
jest.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children, className }: any) => <div className={className}>{children}</div>,
}))
jest.mock('@/src/shared/components/MarkdownRenderer', () => ({
  MarkdownRenderer: ({ content }: { content: string }) => <div>{content}</div>,
}))

function renderList(afterMessages?: React.ReactNode) {
  const messages = [
    { id: 'u1', role: 'user', content: 'QUESTION_TEXT', timestamp: 0 },
    { id: 'a1', role: 'assistant', content: 'ANSWER_TEXT', timestamp: 0 },
  ] as any[]
  return render(
    <LanguageProvider>
      <ChatMessageList messages={messages} isLoading={false} afterMessages={afterMessages} />
    </LanguageProvider>,
  )
}

describe('ChatMessageList — afterMessages slot (follow-up chips placement)', () => {
  it('renders afterMessages AFTER the last (assistant) message in the thread', () => {
    renderList(<div data-testid="chips">CHIPS</div>)
    const answer = screen.getByText('ANSWER_TEXT')
    const chips = screen.getByTestId('chips')
    // Document-order check: the chips node must follow the answer node — i.e. it
    // sits below the last answer inside the scroll area, not above it.
    const following = answer.compareDocumentPosition(chips) & Node.DOCUMENT_POSITION_FOLLOWING
    expect(following).toBeTruthy()
  })

  it('renders nothing extra when afterMessages is omitted', () => {
    renderList()
    expect(screen.queryByTestId('chips')).toBeNull()
  })
})
