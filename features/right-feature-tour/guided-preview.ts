/** Keep real dialogs visible beneath the tour without stealing its focus. */
export function guidedPreviewEvents(preview: boolean) {
  const preserveTourFocus = (event: { preventDefault: () => void }) => {
    if (preview) event.preventDefault()
  }
  return {
    onOpenAutoFocus: preserveTourFocus,
    onCloseAutoFocus: preserveTourFocus,
    onInteractOutside: preserveTourFocus,
  }
}

export const GUIDED_PREVIEW_DIALOG_CLASSES = 'data-[state=open]:animate-none data-[state=closed]:animate-none sm:left-auto sm:right-4 sm:w-[60vw] sm:translate-x-0'
