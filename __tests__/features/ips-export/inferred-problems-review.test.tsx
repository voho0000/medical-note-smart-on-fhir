// UI lock for the inference loading state: a live elapsed-seconds counter so
// the user can tell a long-running LLM call (typically 20–60s) from a hang.

import { act, render, screen } from '@testing-library/react'
import { InferredProblemsReview } from '@/features/ips-export/components/InferredProblemsReview'
import { LanguageProvider } from '@/src/application/providers/language.provider'
import type { InferenceStatus } from '@/features/ips-export/hooks/useInferredProblems'

function renderPanel(status: InferenceStatus) {
  return render(
    <LanguageProvider>
      <InferredProblemsReview
        status={status}
        problems={[]}
        confirmedIds={new Set()}
        confirmedCount={0}
        available={true}
        error={null}
        onRun={() => {}}
        onToggle={() => {}}
      />
    </LanguageProvider>,
  )
}

describe('InferredProblemsReview — elapsed-seconds timer', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })
  afterEach(() => {
    jest.useRealTimers()
  })

  it('shows a ticking seconds counter while loading (zh-TW default locale)', () => {
    renderPanel('loading')
    expect(screen.getByText('已等待 0 秒')).toBeTruthy()

    act(() => {
      jest.advanceTimersByTime(3000)
    })
    expect(screen.getByText('已等待 3 秒')).toBeTruthy()

    act(() => {
      jest.advanceTimersByTime(40000)
    })
    expect(screen.getByText('已等待 43 秒')).toBeTruthy()
  })

  it('renders no counter outside the loading state', () => {
    renderPanel('ready')
    expect(screen.queryByText(/已等待/)).toBeNull()
  })
})
