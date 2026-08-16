export const FEATURE_REQUEST_CATEGORIES = ['ai', 'feature', 'ui'] as const
export type FeatureRequestCategory = (typeof FEATURE_REQUEST_CATEGORIES)[number]

export const FEATURE_REQUEST_STATUSES = [
  'evaluating',
  'planned',
  'in-progress',
  'completed',
] as const
export type FeatureRequestStatus = (typeof FEATURE_REQUEST_STATUSES)[number]

export type FeatureRequestVisibility = 'visible' | 'hidden'
export type FeatureRequestHiddenBy = '' | 'author' | 'admin'

export interface FeatureRequest {
  id: string
  title: string
  description: string
  category: FeatureRequestCategory
  status: FeatureRequestStatus
  displayAuthor: boolean
  authorName: string
  officialNote: string
  visibility: FeatureRequestVisibility
  hiddenReason: string
  hiddenBy: FeatureRequestHiddenBy
  voteCount: number
  createdAt: Date
  updatedAt: Date
}

export interface FeatureRequestOwnership {
  requestId: string
  authorId: string
  authorEmail: string
  createdAt: Date
}

export interface CreateFeatureRequestInput {
  title: string
  description: string
  category: FeatureRequestCategory
  displayAuthor: boolean
  authorName: string
  authorId: string
  authorEmail: string
}

export interface EditFeatureRequestInput {
  title: string
  description: string
  category: FeatureRequestCategory
  displayAuthor: boolean
  authorName: string
}

export interface AdminFeatureRequestUpdate {
  status: FeatureRequestStatus
  officialNote: string
  visibility: FeatureRequestVisibility
}

export type FeatureRequestSort = 'popular' | 'latest'
export type FeatureRequestView = 'all' | 'mine' | 'supported' | 'hidden'
