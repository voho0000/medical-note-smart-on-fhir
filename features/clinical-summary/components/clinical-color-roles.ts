/**
 * Shared colour roles for dense clinical lists.
 *
 * These roles keep visit and report metadata in the same visual language:
 * category = emerald, source = blue, attention = coral. Dark mode deliberately
 * collapses non-semantic category colour into the neutral secondary surface.
 */
export const CLINICAL_CATEGORY_TONE =
  'bg-emerald-100 text-emerald-700 dark:bg-secondary/80 dark:text-secondary-foreground/85'

export const CLINICAL_SOURCE_TONE = 'text-blue-600/80 dark:text-primary/75'

export const CLINICAL_ABNORMAL_TONE =
  'bg-red-100 text-red-700 dark:bg-clinical-abnormal/10 dark:text-clinical-abnormal dark:ring-1 dark:ring-inset dark:ring-clinical-abnormal/25'

export const CLINICAL_LIST_ROW_TONE = 'border-border/90 bg-muted/40'

export const CLINICAL_LIST_ROW_HOVER_TONE = 'hover:bg-muted/70'

export const CLINICAL_COUNT_TONE = 'text-muted-foreground'
