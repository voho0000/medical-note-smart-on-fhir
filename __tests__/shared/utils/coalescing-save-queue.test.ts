import { createCoalescingSaveQueue } from '@/src/shared/utils/coalescing-save-queue'

describe('createCoalescingSaveQueue', () => {
  it('keeps the newest waiting value per key while an earlier save is blocked', async () => {
    let releaseFirst!: () => void
    const firstBlocked = new Promise<void>((resolve) => { releaseFirst = resolve })
    const saved: string[] = []
    const statuses: string[] = []
    let calls = 0
    const queue = createCoalescingSaveQueue<string>({
      save: async (value) => {
        calls += 1
        if (calls === 1) await firstBlocked
        saved.push(value)
      },
      onStatusChange: (status) => statuses.push(status),
    })

    queue.enqueue('chat-a', 'first')
    queue.enqueue('chat-a', 'stale')
    queue.enqueue('chat-a', 'latest')
    queue.enqueue('chat-b', 'other-chat')
    releaseFirst()

    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(saved).toEqual(['first', 'latest', 'other-chat'])
    expect(statuses.at(-1)).toBe('synced')
    expect(queue.pendingCount).toBe(0)
  })
})
