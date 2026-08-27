/**
 * The phone workspace stacks temporary layers over the clinical browser. Before
 * this hook, Android's hardware back and iOS' edge swipe left the app outright
 * and every in-memory piece of clinical state went with it, so the behaviour
 * these tests pin down is a data-loss guard, not a navigation nicety.
 */
import { act, render } from '@testing-library/react'
import { useBackDismissibleLayer } from '@/src/shared/hooks/layout/use-back-dismissible-layer.hook'

const LAYER_KEY = '__mpLayer'

/**
 * jsdom runs history traversal as a task. Wait for the traversal itself rather
 * than guessing how many milliseconds the CI runner needs to dispatch it.
 */
const runAndWaitForPopState = async (action: () => void) => {
  const traversed = new Promise<void>((resolve) => {
    window.addEventListener('popstate', () => resolve(), { once: true })
  })

  action()
  await act(async () => {
    await traversed
  })
}

const currentToken = () =>
  (window.history.state as Record<string, unknown> | null)?.[LAYER_KEY] ?? null

/**
 * `history.length` counts entries and does NOT shrink when you go back, so it
 * cannot express "the entry was rewound". Position can: each test sits on a
 * baseline entry with one identifiable entry behind it, and a single back()
 * that lands on the sentinel proves the stack held exactly the baseline —
 * no dead layer entries piled up in between.
 */
const SENTINEL = 'behind-the-baseline'
const onSentinel = () =>
  (window.history.state as Record<string, unknown> | null)?.__probe === SENTINEL

const goBack = async () => {
  await runAndWaitForPopState(() => {
    window.history.back()
  })
}

function Layer({
  active,
  onDismiss,
  enabled = true,
}: {
  active: boolean
  onDismiss: () => void
  enabled?: boolean
}) {
  useBackDismissibleLayer(active, onDismiss, enabled)
  return null
}

/** Outer mounts (and therefore registers) before inner, as in the real stack. */
function NestedLayers({
  outerActive,
  innerActive,
  onOuterDismiss,
  onInnerDismiss,
}: {
  outerActive: boolean
  innerActive: boolean
  onOuterDismiss: () => void
  onInnerDismiss: () => void
}) {
  useBackDismissibleLayer(outerActive, onOuterDismiss)
  useBackDismissibleLayer(innerActive, onInnerDismiss)
  return null
}

describe('useBackDismissibleLayer', () => {
  beforeEach(() => {
    // jsdom keeps one session history for the whole file. Pushing truncates
    // anything a previous test left ahead of us, so these two pushes always
    // produce the same shape: [ … , sentinel, baseline ] with the cursor on
    // baseline and no layer tag anywhere.
    window.history.pushState({ __probe: SENTINEL }, '')
    window.history.pushState({}, '')
    window.history.replaceState({}, '')
  })

  it('pushes a tagged history entry when the layer opens', async () => {
    const view = render(<Layer active={false} onDismiss={jest.fn()} />)
    expect(currentToken()).toBeNull()

    view.rerender(<Layer active onDismiss={jest.fn()} />)
    expect(currentToken()).toEqual(expect.any(String))

    // Exactly one entry: a single back lands on the baseline, not the sentinel.
    await goBack()
    expect(currentToken()).toBeNull()
    expect(onSentinel()).toBe(false)
  })

  it('dismisses the layer instead of leaving the app when the platform goes back', async () => {
    const onDismiss = jest.fn()
    render(<Layer active onDismiss={onDismiss} />)
    expect(currentToken()).toEqual(expect.any(String))

    await goBack()

    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(currentToken()).toBeNull()
  })

  it('rewinds its own entry when the app closes the layer from the inside', async () => {
    const onDismiss = jest.fn()
    const view = render(<Layer active onDismiss={onDismiss} />)

    await runAndWaitForPopState(() => {
      view.rerender(<Layer active={false} onDismiss={onDismiss} />)
    })

    // Closing in-app is not a dismissal request coming back at us — the app
    // already did the closing; the entry just has to disappear with it.
    expect(onDismiss).not.toHaveBeenCalled()
    expect(currentToken()).toBeNull()
    await goBack()
    expect(onSentinel()).toBe(true)
  })

  it('does not accumulate dead entries across repeated open/close cycles', async () => {
    const onDismiss = jest.fn()
    const view = render(<Layer active={false} onDismiss={onDismiss} />)

    for (let cycle = 0; cycle < 3; cycle += 1) {
      view.rerender(<Layer active onDismiss={onDismiss} />)
      await runAndWaitForPopState(() => {
        view.rerender(<Layer active={false} onDismiss={onDismiss} />)
      })
    }

    expect(onDismiss).not.toHaveBeenCalled()
    // One back reaches the sentinel: three open/close cycles left nothing.
    await goBack()
    expect(onSentinel()).toBe(true)
  })

  it('dismisses only the innermost layer on a platform back', async () => {
    const onOuterDismiss = jest.fn()
    const onInnerDismiss = jest.fn()
    const props = { onOuterDismiss, onInnerDismiss }
    const view = render(
      <NestedLayers outerActive={false} innerActive={false} {...props} />,
    )
    view.rerender(<NestedLayers outerActive innerActive={false} {...props} />)
    const outerToken = currentToken()
    view.rerender(<NestedLayers outerActive innerActive {...props} />)
    expect(currentToken()).not.toBe(outerToken)

    await goBack()

    expect(onInnerDismiss).toHaveBeenCalledTimes(1)
    expect(onOuterDismiss).not.toHaveBeenCalled()
    expect(currentToken()).toBe(outerToken)
  })

  it('does not collapse the outer layer when the inner one rewinds itself', async () => {
    const onOuterDismiss = jest.fn()
    const onInnerDismiss = jest.fn()
    const props = { onOuterDismiss, onInnerDismiss }
    const view = render(
      <NestedLayers outerActive={false} innerActive={false} {...props} />,
    )
    view.rerender(<NestedLayers outerActive innerActive={false} {...props} />)
    const outerToken = currentToken()
    view.rerender(<NestedLayers outerActive innerActive {...props} />)

    // Inner closed from inside the app: its cleanup calls history.back(), and
    // the outer listener must recognise the resulting popstate as its own
    // entry rather than treating it as its own dismissal.
    await runAndWaitForPopState(() => {
      view.rerender(<NestedLayers outerActive innerActive={false} {...props} />)
    })

    expect(onInnerDismiss).not.toHaveBeenCalled()
    expect(onOuterDismiss).not.toHaveBeenCalled()
    expect(currentToken()).toBe(outerToken)
  })

  it('stays out of session history when disabled', async () => {
    const onDismiss = jest.fn()
    render(<Layer active onDismiss={onDismiss} enabled={false} />)

    expect(currentToken()).toBeNull()
    await goBack()
    expect(onSentinel()).toBe(true)
  })

  it('calls the latest handler without re-pushing an entry', async () => {
    const first = jest.fn()
    const second = jest.fn()
    const view = render(<Layer active onDismiss={first} />)
    const token = currentToken()

    view.rerender(<Layer active onDismiss={second} />)
    // A new callback identity must not tear the layer down and push again.
    expect(currentToken()).toBe(token)

    await goBack()

    expect(second).toHaveBeenCalledTimes(1)
    expect(first).not.toHaveBeenCalled()
    // Still exactly one entry — the rerender did not stack a second one.
    expect(onSentinel()).toBe(false)
  })

  it('rewinds on unmount, so a closing screen leaves no entry behind', async () => {
    const view = render(<Layer active onDismiss={jest.fn()} />)
    expect(currentToken()).toEqual(expect.any(String))

    await runAndWaitForPopState(() => {
      view.unmount()
    })

    expect(currentToken()).toBeNull()
    await goBack()
    expect(onSentinel()).toBe(true)
  })
})
