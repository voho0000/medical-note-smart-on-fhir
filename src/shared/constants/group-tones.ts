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
    toneClass: 'text-teal-700 dark:text-teal-300',
    dividerClass: 'bg-teal-200/90 dark:bg-teal-800/70',
  },
  orange: {
    toneClass: 'text-orange-700 dark:text-orange-300',
    dividerClass: 'bg-orange-200/90 dark:bg-orange-800/70',
  },
  cyan: {
    toneClass: 'text-cyan-700 dark:text-cyan-300',
    dividerClass: 'bg-cyan-200/90 dark:bg-cyan-800/70',
  },
  violet: {
    toneClass: 'text-violet-700 dark:text-violet-300',
    dividerClass: 'bg-violet-200/90 dark:bg-violet-800/70',
  },
  rose: {
    toneClass: 'text-rose-700 dark:text-rose-300',
    dividerClass: 'bg-rose-200/90 dark:bg-rose-800/70',
  },
  blue: {
    toneClass: 'text-blue-700 dark:text-blue-300',
    dividerClass: 'bg-blue-200/90 dark:bg-blue-800/70',
  },
  pink: {
    toneClass: 'text-pink-700 dark:text-pink-300',
    dividerClass: 'bg-pink-200/90 dark:bg-pink-800/70',
  },
  indigo: {
    toneClass: 'text-indigo-700 dark:text-indigo-300',
    dividerClass: 'bg-indigo-200/90 dark:bg-indigo-800/70',
  },
}
