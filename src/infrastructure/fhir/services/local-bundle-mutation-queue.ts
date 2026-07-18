// One process-wide coordinator for every local Bundle mutation. The header,
// welcome screen, demo loader, and auth provider are separate React owners, so
// component-local `loading` flags cannot prevent overlapping saves/clears.

let mutationTail: Promise<void> = Promise.resolve()

/** Run mutations in call order. A failed operation does not poison the queue;
 * later clear/import/logout work still gets a turn. */
export function serializeLocalBundleMutation<T>(
  mutation: () => Promise<T>,
): Promise<T> {
  const result = mutationTail.then(mutation, mutation)
  mutationTail = result.then(
    () => undefined,
    () => undefined,
  )
  return result
}
