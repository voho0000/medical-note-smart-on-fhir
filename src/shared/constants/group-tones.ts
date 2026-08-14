/**
 * Shared tone palette for grouped module lists.
 *
 * Personalized education and clinical decision support both render governed
 * modules under coloured group headings. Their group ids come from different
 * packages and will never line up, so this palette is keyed by tone rather than
 * by group: each feature maps its own group ids onto a tone name. That keeps
 * one copy of the Tailwind class pairs instead of a drifting copy per feature.
 */

export type GroupToneName =
  | 'teal'
  | 'orange'
  | 'cyan'
  | 'violet'
  | 'rose'
  | 'blue'
  | 'pink'
  | 'indigo'

export interface GroupTone {
  /** Text colour for the group label and icon. */
  toneClass: string
  /** Background colour for a rule or divider drawn under the group. */
  dividerClass: string
}

export const GROUP_TONES: Record<GroupToneName, GroupTone> = {
  teal: {
    toneClass: 'text-teal-700 dark:text-secondary-foreground/80',
    dividerClass: 'bg-teal-200/90 dark:bg-border',
  },
  orange: {
    toneClass: 'text-orange-700 dark:text-secondary-foreground/80',
    dividerClass: 'bg-orange-200/90 dark:bg-border',
  },
  cyan: {
    toneClass: 'text-cyan-700 dark:text-secondary-foreground/80',
    dividerClass: 'bg-cyan-200/90 dark:bg-border',
  },
  violet: {
    toneClass: 'text-violet-700 dark:text-secondary-foreground/80',
    dividerClass: 'bg-violet-200/90 dark:bg-border',
  },
  rose: {
    toneClass: 'text-rose-700 dark:text-secondary-foreground/80',
    dividerClass: 'bg-rose-200/90 dark:bg-border',
  },
  blue: {
    toneClass: 'text-blue-700 dark:text-secondary-foreground/80',
    dividerClass: 'bg-blue-200/90 dark:bg-border',
  },
  pink: {
    toneClass: 'text-pink-700 dark:text-secondary-foreground/80',
    dividerClass: 'bg-pink-200/90 dark:bg-border',
  },
  indigo: {
    toneClass: 'text-indigo-700 dark:text-secondary-foreground/80',
    dividerClass: 'bg-indigo-200/90 dark:bg-border',
  },
}
