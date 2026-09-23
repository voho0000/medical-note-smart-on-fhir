/** Test-local browser permission; never grant permissions in application code. */
export function mockCollectorPermission(state: PermissionState = 'granted') {
  const original = Object.getOwnPropertyDescriptor(navigator, 'permissions')
  const status = { state }
  const query = jest.fn().mockResolvedValue(status)
  Object.defineProperty(navigator, 'permissions', { configurable: true, value: { query } })
  return {
    query,
    status,
    restore() {
      if (original) Object.defineProperty(navigator, 'permissions', original)
      else Reflect.deleteProperty(navigator, 'permissions')
    },
  }
}
