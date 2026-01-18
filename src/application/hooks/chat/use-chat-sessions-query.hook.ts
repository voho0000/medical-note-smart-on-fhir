/**
 * Chat Sessions Query Hook (React Query)
 * 
 * Manages chat sessions as server state with React Query.
 * Replaces sessions management in chat-history.store.
 * 
 * Benefits:
 * - Automatic caching and background refetching
 * - Real-time Firebase subscription integration
 * - No manual state synchronization (eliminates bug-prone useEffect patterns)
 * - Better memory management
 */

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { FirestoreChatSessionRepository } from '@/src/infrastructure/firebase/repositories/chat-session.repository'
import { GetChatHistoryUseCase } from '@/src/core/use-cases/chat/get-chat-history.use-case'
import type { ChatSessionMetadata } from '@/src/core/entities/chat-session.entity'

export function useChatSessionsQuery(
  userId?: string,
  patientId?: string,
  fhirServerUrl?: string
) {
  const queryClient = useQueryClient()

  // Initial query
  const query = useQuery({
    queryKey: ['chat-sessions', userId, patientId, fhirServerUrl],
    queryFn: async (): Promise<ChatSessionMetadata[]> => {
      if (!userId || !patientId || !fhirServerUrl) {
        return []
      }

      const repository = new FirestoreChatSessionRepository()
      const useCase = new GetChatHistoryUseCase(repository)
      return await useCase.execute(userId, patientId, fhirServerUrl)
    },
    enabled: !!userId && !!patientId && !!fhirServerUrl,
    staleTime: Infinity, // Real-time subscription will update, no need for auto-refetch
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes after unmount
  })

  // Real-time Firebase subscription
  useEffect(() => {
    if (!userId || !patientId || !fhirServerUrl) return

    const repository = new FirestoreChatSessionRepository()
    const unsubscribe = repository.subscribe(
      userId,
      patientId,
      fhirServerUrl,
      (updatedSessions: ChatSessionMetadata[]) => {
        // Directly update React Query cache - no Zustand synchronization needed
        queryClient.setQueryData(
          ['chat-sessions', userId, patientId, fhirServerUrl],
          updatedSessions
        )
      }
    )

    return () => unsubscribe()
  }, [userId, patientId, fhirServerUrl, queryClient])

  return query
}

// Mutation helpers for optimistic updates
export function useAddSessionMutation() {
  const queryClient = useQueryClient()

  return {
    addSession: (
      userId: string,
      patientId: string,
      fhirServerUrl: string,
      session: ChatSessionMetadata
    ) => {
      queryClient.setQueryData<ChatSessionMetadata[]>(
        ['chat-sessions', userId, patientId, fhirServerUrl],
        (old = []) => {
          const exists = old.some(s => s.id === session.id)
          if (exists) {
            return old.map(s => (s.id === session.id ? session : s))
          }
          return [session, ...old]
        }
      )
    }
  }
}

export function useUpdateSessionMutation() {
  const queryClient = useQueryClient()

  return {
    updateSession: (
      userId: string,
      patientId: string,
      fhirServerUrl: string,
      sessionId: string,
      updates: Partial<ChatSessionMetadata>
    ) => {
      queryClient.setQueryData<ChatSessionMetadata[]>(
        ['chat-sessions', userId, patientId, fhirServerUrl],
        (old = []) => old.map(s => (s.id === sessionId ? { ...s, ...updates } : s))
      )
    }
  }
}

export function useRemoveSessionMutation() {
  const queryClient = useQueryClient()

  return {
    removeSession: (
      userId: string,
      patientId: string,
      fhirServerUrl: string,
      sessionId: string
    ) => {
      queryClient.setQueryData<ChatSessionMetadata[]>(
        ['chat-sessions', userId, patientId, fhirServerUrl],
        (old = []) => old.filter(s => s.id !== sessionId)
      )
    }
  }
}
