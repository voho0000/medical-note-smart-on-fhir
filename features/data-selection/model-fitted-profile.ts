import type {
  DataFilters,
  DataSelection,
} from '@/src/core/entities/clinical-context.entity'

/**
 * The small-model profile is a transient view over the saved selection. When
 * the user edits that view, persist only the fields they explicitly changed;
 * otherwise the model's automatic caps would accidentally replace unrelated
 * saved choices.
 */
function mergeDisplayedChanges<T extends object>(
  saved: T,
  displayed: T,
  nextDisplayed: T,
): T {
  const nextSaved = { ...saved }
  for (const key of Object.keys(nextDisplayed) as Array<keyof T>) {
    if (nextDisplayed[key] !== displayed[key]) {
      nextSaved[key] = nextDisplayed[key]
    }
  }
  return nextSaved
}

export function mergeDisplayedSelectionChange(
  saved: DataSelection,
  displayed: DataSelection,
  nextDisplayed: DataSelection,
): DataSelection {
  return mergeDisplayedChanges(saved, displayed, nextDisplayed)
}

export function mergeDisplayedFiltersChange(
  saved: DataFilters,
  displayed: DataFilters,
  nextDisplayed: DataFilters,
): DataFilters {
  return mergeDisplayedChanges(saved, displayed, nextDisplayed)
}
