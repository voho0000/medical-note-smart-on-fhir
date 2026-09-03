/** A deterministic Firestore boundary for testing real gallery/sync services. */
type Reference = { path: string; id: string }
type Row = Record<string, any>
const records = new Map<string, Row>()
let serial = 0
const reference = (path: string): Reference => ({ path, id: path.split('/').at(-1)! })
const snapshot = (ref: Reference) => ({ id: ref.id, ref, exists: () => records.has(ref.path), data: () => records.get(ref.path) })
const value = (input: any) => typeof input?.toDate === 'function' ? input.toDate().getTime() : input
const applyUpdate = (ref: Reference, data: Row) => {
  const result = { ...records.get(ref.path) }
  for (const [key, next] of Object.entries(data)) {
    if (next?.operation === 'delete') delete result[key]
    else result[key] = next?.operation === 'increment' ? (result[key] ?? 0) + next.amount : next
  }
  records.set(ref.path, result)
}
const commit = jest.fn(async (operations: (() => void)[]) => { operations.forEach(operation => operation()) })

export const memory = {
  records, commit,
  reset() { records.clear(); serial = 0; jest.clearAllMocks(); commit.mockImplementation(async operations => operations.forEach(operation => operation())) },
  seed(path: string, data: Row) { records.set(path, data) },
}

export const firestore = {
  collection: jest.fn((parent: Reference | unknown, ...segments: string[]) => reference([(parent as Reference)?.path, ...segments].filter(Boolean).join('/'))),
  doc: jest.fn((parent: Reference | unknown, ...segments: string[]) => reference([(parent as Reference)?.path, ...(segments.length ? segments : [`generated-${++serial}`])].filter(Boolean).join('/'))),
  query: jest.fn((ref: Reference, ...constraints: Row[]) => ({ ...ref, constraints })),
  where: jest.fn((field: string, operator: string, expected: unknown) => ({ kind: 'where', field, operator, expected })),
  orderBy: jest.fn((field: string, direction: string) => ({ kind: 'order', field, direction })),
  limit: jest.fn((count: number) => ({ kind: 'limit', count })),
  startAfter: jest.fn((cursor: { ref: Reference }) => ({ kind: 'cursor', path: cursor.ref.path })),
  getDocs: jest.fn(async (query: Reference & { constraints?: Row[] }) => {
    let rows = [...records].filter(([path]) => path.startsWith(query.path + '/') && path.split('/').length === query.path.split('/').length + 1)
    for (const constraint of query.constraints ?? []) {
      if (constraint.kind === 'where') rows = rows.filter(([, data]) => {
        const actual = data[constraint.field]
        return constraint.operator === '==' ? actual === constraint.expected
          : constraint.operator === 'array-contains' ? actual?.includes(constraint.expected)
          : constraint.expected.some((item: unknown) => actual?.includes(item))
      })
      if (constraint.kind === 'order') rows.sort((a, b) => (value(a[1][constraint.field]) > value(b[1][constraint.field]) ? 1 : value(a[1][constraint.field]) < value(b[1][constraint.field]) ? -1 : 0) * (constraint.direction === 'desc' ? -1 : 1))
      if (constraint.kind === 'cursor') rows = rows.slice(rows.findIndex(([path]) => path === constraint.path) + 1)
      if (constraint.kind === 'limit') rows = rows.slice(0, constraint.count)
    }
    return { docs: rows.map(([path]) => snapshot(reference(path))) }
  }),
  getDoc: jest.fn(async (ref: Reference) => snapshot(ref)),
  addDoc: jest.fn(async (parent: Reference, data: Row) => {
    const ref = reference(parent.path + '/generated-' + (++serial))
    records.set(ref.path, data)
    return ref
  }),
  setDoc: jest.fn(async (ref: Reference, data: Row) => { records.set(ref.path, data) }),
  updateDoc: jest.fn(async (ref: Reference, data: Row) => { applyUpdate(ref, data) }),
  deleteDoc: jest.fn(async (ref: Reference) => { records.delete(ref.path) }),
  increment: (amount: number) => ({ operation: 'increment', amount }),
  deleteField: () => ({ operation: 'delete' }),
  onSnapshot: jest.fn(() => jest.fn()),
  writeBatch: jest.fn(() => {
    const operations: (() => void)[] = []
    return {
      set: (ref: Reference, data: Row) => operations.push(() => records.set(ref.path, data)),
      delete: (ref: Reference) => operations.push(() => records.delete(ref.path)),
      commit: () => commit(operations),
    }
  }),
  Timestamp: { now: () => ({ toDate: () => new Date(1000) }), fromDate: (date: Date) => ({ toDate: () => date }) },
}
