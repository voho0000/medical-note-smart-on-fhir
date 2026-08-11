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
    badge: 'Beta',
    // Occupies the same audience-specific slot as clinician guidance,
    // immediately to the right of the calculator.
    order: 5,
    enabled: true,
    pinned: true,
    forceMount: true,
    audiences: ['patient'],
    // Let the outer panel own scrolling, as the medical summary does. Inside
    // the feature's own ScrollArea the viewport declares overflow-y: scroll but
    // never scrolls — the panel outside it does — so it captures both sticky
    // positioning and scrollIntoView. The section jump would silently do
    // nothing and the control row would scroll away instead of pinning.
    scrollMode: 'panel',
    contentClassName: 'flex-1 mt-1',
  },
  diseasePacks: getEnabledDiseasePacks,
} as const
