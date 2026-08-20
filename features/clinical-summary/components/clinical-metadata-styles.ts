// ICD is diagnostic metadata, not an alert. A restrained sand tone keeps the
// code recognizable across visit and medication lists without borrowing the
// stronger amber treatment reserved for time-sensitive supply states.
export const clinicalIcdToneClass =
  "border border-amber-300/60 bg-amber-50/50 transition-colors hover:border-amber-300/80 hover:bg-amber-50/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/30 dark:border-amber-500/25 dark:bg-amber-500/10 dark:hover:border-amber-400/40 dark:hover:bg-amber-500/20 dark:focus-visible:ring-amber-400/30"

export const clinicalIcdCodeToneClass =
  "text-amber-900/80 dark:text-amber-200/80"

export const clinicalIcdDescriptionToneClass =
  "text-foreground/75 dark:text-secondary-foreground/75"

export const clinicalIcdChipClass =
  `inline-flex h-5 min-w-0 max-w-[16rem] items-center gap-1 rounded-md px-1.5 py-0 text-xs ${clinicalIcdToneClass}`

export const clinicalIcdCodeClass =
  `shrink-0 font-mono font-medium ${clinicalIcdCodeToneClass}`

export const clinicalIcdDescriptionClass =
  `min-w-0 truncate ${clinicalIcdDescriptionToneClass}`

// Clinical hover cards use the same quiet themed surface in both modes. The
// descendant selector also recolours Radix's nested arrow SVG, avoiding a
// black arrow attached to an otherwise themed tooltip.
export const clinicalTooltipSurfaceClass =
  "border border-primary/20 bg-secondary text-secondary-foreground shadow-lg shadow-primary/10 [&_svg]:bg-secondary! [&_svg]:fill-secondary!"

export const clinicalIcdMoreButtonClass =
  "inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-md border border-border bg-background px-1.5 py-0 text-[0.6875rem] max-md:h-[36px] max-md:min-w-[36px] text-foreground/75 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
