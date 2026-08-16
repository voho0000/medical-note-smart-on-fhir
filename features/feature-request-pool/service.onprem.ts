import type {
  AdminFeatureRequestUpdate,
  CreateFeatureRequestInput,
  EditFeatureRequestInput,
  FeatureRequest,
  FeatureRequestOwnership,
} from './types'

const disabled = () => new Error('Feature requests are unavailable in the on-prem deployment profile')

export function subscribeFeatureRequests(
  _includeHidden: boolean,
  onData: (requests: FeatureRequest[]) => void,
): () => void {
  onData([])
  return () => undefined
}
export function subscribeFeatureRequestOwnerships(
  _userId: string,
  _includeAll: boolean,
  onData: (ownerships: FeatureRequestOwnership[]) => void,
): () => void {
  onData([])
  return () => undefined
}

export function subscribeFeatureRequestVotes(
  _userId: string,
  onData: (requestIds: Set<string>) => void,
): () => void {
  onData(new Set())
  return () => undefined
}

export async function createFeatureRequest(_input: CreateFeatureRequestInput): Promise<string> {
  throw disabled()
}

export async function editFeatureRequest(
  _requestId: string,
  _input: EditFeatureRequestInput,
): Promise<void> {
  throw disabled()
}

export async function withdrawFeatureRequest(_requestId: string): Promise<void> {
  throw disabled()
}

export async function updateFeatureRequestAsAdmin(
  _requestId: string,
  _update: AdminFeatureRequestUpdate,
): Promise<void> {
  throw disabled()
}

export async function toggleFeatureRequestVote(
  _requestId: string,
  _userId: string,
): Promise<boolean> {
  throw disabled()
}

export async function hasFeatureRequestVote(
  _requestId: string,
  _userId: string,
): Promise<boolean> {
  return false
}
