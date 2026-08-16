export const CLINICAL_DECISION_SUPPORT_FEATURE_ID = 'clinical-decision-support'

export const CLINICAL_DECISION_SUPPORT_MODULE = {
  id: CLINICAL_DECISION_SUPPORT_FEATURE_ID,
  name: 'Clinical Decision Support',
  version: '0.1.0-poc',
  rightPanel: {
    id: CLINICAL_DECISION_SUPPORT_FEATURE_ID,
    name: 'Clinical Decision Support',
    tabLabel: 'personalizedGuidance',
    badge: 'Beta',
    beta: true,
    order: 5,
    enabled: true,
    pinned: true,
    forceMount: true,
    audiences: ['medical'],
    contentClassName: 'flex-1 mt-1',
  },
} as const
