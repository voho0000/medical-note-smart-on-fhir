import { getEnabledDiseasePacks } from './disease-packs/registry'

export const PERSONALIZED_EDUCATION_FEATURE_ID = 'personalized-education'

export const PERSONALIZED_EDUCATION_MODULE = {
  id: PERSONALIZED_EDUCATION_FEATURE_ID,
  name: 'Personalized Education',
  version: '1.0.0-poc',
  rightPanel: {
    id: PERSONALIZED_EDUCATION_FEATURE_ID,
    name: 'Personalized Education',
    tabLabel: 'personalizedEducation',
    order: 3,
    enabled: true,
    pinned: true,
    forceMount: true,
    audiences: ['medical', 'patient'],
    contentClassName: 'flex-1 mt-1',
  },
  diseasePacks: getEnabledDiseasePacks,
} as const
