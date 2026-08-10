export type SaveQueueStatus = 'idle' | 'pending' | 'synced' | 'error'

interface CoalescingSaveQueueOptions<T> {
  save: (value: T) => Promise<void>
  onStatusChange?: (status: SaveQueueStatus) => void
  onError?: (error: unknown, value: T) => void
}

/**
 * Serial save queue that keeps only the newest waiting value for each key.
 *
 * A Firestore write promise can remain pending for the whole time a device is
 * offline. New edits must therefore be remembered instead of being discarded
 * by an `isSaving` guard. Once the active write is acknowledged, this queue
 * drains the latest snapshot for every conversation that changed meanwhile.
 */
export function createCoalescingSaveQueue<T>({
  save,
  onStatusChange,
  onError,
}: CoalescingSaveQueueOptions<T>) {
  const queued = new Map<string, T>()
  let draining = false

  const drain = async () => {
    if (draining) return
    draining = true
    let hadError = false

    try {
      while (queued.size > 0) {
        const next = queued.entries().next().value as [string, T] | undefined
        if (!next) break
        const [key, value] = next
        queued.delete(key)

        try {
          await save(value)
        } catch (error) {
          hadError = true
          onError?.(error, value)
        }
      }
    } finally {
      draining = false
      onStatusChange?.(hadError ? 'error' : 'synced')
      // An enqueue can land after the loop observes an empty map but before the
      // finally block clears `draining`. Make that race start a fresh drain.
      if (queued.size > 0) {
        onStatusChange?.('pending')
        void drain()
      }
    }
  }

  return {
    enqueue(key: string, value: T) {
      queued.set(key, value)
      onStatusChange?.('pending')
      void drain()
    },
    get pendingCount() {
      return queued.size + (draining ? 1 : 0)
    },
  }
}
