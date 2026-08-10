import { create } from 'zustand'
import type { SaveQueueStatus } from '@/src/shared/utils/coalescing-save-queue'

export type FirestoreConnectionState = 'unknown' | 'server' | 'cache' | 'unavailable'

interface ConnectivityState {
  browserOnline: boolean
  firestoreConnection: FirestoreConnectionState
  chatSyncStatus: SaveQueueStatus
  setBrowserOnline: (online: boolean) => void
  setFirestoreConnection: (state: FirestoreConnectionState) => void
  setChatSyncStatus: (status: SaveQueueStatus) => void
}

export const useConnectivityStore = create<ConnectivityState>()((set) => ({
  browserOnline: true,
  firestoreConnection: 'unknown',
  chatSyncStatus: 'idle',
  setBrowserOnline: (browserOnline) => set({ browserOnline }),
  setFirestoreConnection: (firestoreConnection) => set({ firestoreConnection }),
  setChatSyncStatus: (chatSyncStatus) => set({ chatSyncStatus }),
}))
