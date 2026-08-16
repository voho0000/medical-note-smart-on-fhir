import type {
  FeatureRequest,
  FeatureRequestCategory,
  FeatureRequestSort,
  FeatureRequestStatus,
  FeatureRequestView,
} from './types'

export const FEATURE_REQUEST_EDIT_WINDOW_MS = 30 * 60 * 1000

export function canEditFeatureRequest(
  request: Pick<FeatureRequest, 'createdAt' | 'status' | 'visibility'>,
  isOwner: boolean,
  now = new Date(),
): boolean {
  return isOwner
    && request.status === 'evaluating'
    && request.visibility === 'visible'
    && now.getTime() - request.createdAt.getTime() <= FEATURE_REQUEST_EDIT_WINDOW_MS
}
interface FilterFeatureRequestsOptions {
  search: string
  status: FeatureRequestStatus | 'all'
  category: FeatureRequestCategory | 'all'
  view: FeatureRequestView
  sort: FeatureRequestSort
  ownedIds: ReadonlySet<string>
  supportedIds: ReadonlySet<string>
}

export function filterFeatureRequests(
  requests: FeatureRequest[],
  options: FilterFeatureRequestsOptions,
): FeatureRequest[] {
  const normalizedSearch = options.search.trim().toLocaleLowerCase()

  return requests
    .filter((request) => {
      if (options.view === 'hidden') {
        if (request.visibility !== 'hidden') return false
      } else if (request.visibility !== 'visible') {
        return false
      }

      if (options.view === 'mine' && !options.ownedIds.has(request.id)) return false
      if (options.view === 'supported' && !options.supportedIds.has(request.id)) return false
      if (options.status !== 'all' && request.status !== options.status) return false
      if (options.category !== 'all' && request.category !== options.category) return false

      if (normalizedSearch) {
        const haystack = `${request.title}\n${request.description}\n${request.officialNote}`.toLocaleLowerCase()
        if (!haystack.includes(normalizedSearch)) return false
      }

      return true
    })
    .sort((left, right) => {
      if (options.sort === 'popular' && left.voteCount !== right.voteCount) {
        return right.voteCount - left.voteCount
      }
      return right.createdAt.getTime() - left.createdAt.getTime()
    })
}
