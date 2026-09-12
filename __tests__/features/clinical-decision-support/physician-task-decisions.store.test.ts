import {
  getPhysicianDecisions, physicianDecisionsStorageKey, usePhysicianDecisionsStore,
  type PhysicianDecisionKind,
} from '@/features/clinical-decision-support/stores/physician-decisions.store'
import { storedCiphertext, until, useRealWebCrypto } from './encrypted-answers.helper'

describe('task decisions persistence', () => {
useRealWebCrypto()

test('task-specific decisions survive encrypted storage and rehydration', async () => {
  const kinds: PhysicianDecisionKind[] = ['follow-up-arranged', 'referred', 'exercise-cleared', 'supervised-exercise', 'reviewed']
  const patientId = 'synthetic-task-decisions'
  kinds.forEach((decision) => usePhysicianDecisionsStore.getState().recordDecision(patientId, decision, {
    decision, packVersion: '2.0.0',
  }))
  await storedCiphertext(physicianDecisionsStorageKey(patientId))
  usePhysicianDecisionsStore.setState({ byPatientId: {}, hydratedPatientIds: {} })
  usePhysicianDecisionsStore.getState().hydrate(patientId)
  await until(() => !!usePhysicianDecisionsStore.getState().hydratedPatientIds[patientId], 'task decisions to hydrate')
  for (const decision of kinds) {
    expect(getPhysicianDecisions(patientId)[decision]?.decision).toBe(decision)
  }
})

})
