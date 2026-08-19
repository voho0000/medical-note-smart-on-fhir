/**
 * Patient and clinical queries represent one immutable Bundle snapshot for the
 * lifetime of this browser tab. Local imports and the bundled demo do not
 * change behind our back; import, clear, and explicit retry already invalidate
 * or refetch these queries deliberately.
 *
 * Keeping both values infinite prevents an idle tab from treating the same
 * Bundle as stale after five minutes or discarding it after ten minutes. If a
 * live SMART source is reintroduced later, its refresh policy should be added
 * as a separate source-specific branch instead of weakening the local snapshot.
 */
export const CLINICAL_SESSION_STALE_TIME = Infinity
export const CLINICAL_SESSION_GC_TIME = Infinity
