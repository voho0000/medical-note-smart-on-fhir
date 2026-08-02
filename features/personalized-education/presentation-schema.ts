import { getEducationContentSchema } from '@voho0000/personalized-education'
import type {
  EducationContentSchema,
  EducationFact,
  EducationModuleDefinition,
  EducationModuleGroupDefinition,
  EducationModuleGroupId,
  EducationPlan,
  EducationSection,
  EducationSource,
} from './types'

export type {
  EducationContentSchema,
  EducationModuleDefinition,
  EducationModuleGroupDefinition,
  EducationModuleGroupId,
}
export { getEducationContentSchema }

/**
 * Presentation layer for the governed education catalogue.
 *
 * The catalogue itself — module copy, clinical rules, capability gating and
 * citations — lives in `@voho0000/personalized-education`. This file owns only
 * how that content is rendered: group styling, module resolution against a
 * patient's plan, and the summary/handout selections. Keeping colours out of
 * the package means a visual tweak never costs a content release.
 */

export interface EducationGroupStyle {
  toneClass: string
  dividerClass: string
}

/**
 * Every governed group needs a style. `Record` (not `Partial`) makes a new
 * group in the package a compile error here rather than an unstyled heading.
 */
export const EDUCATION_GROUP_STYLES: Record<EducationModuleGroupId, EducationGroupStyle> = {
  understanding: {
    toneClass: 'text-teal-700 dark:text-teal-300',
    dividerClass: 'bg-teal-200/90 dark:bg-teal-800/70',
  },
  'daily-life': {
    toneClass: 'text-orange-700 dark:text-orange-300',
    dividerClass: 'bg-orange-200/90 dark:bg-orange-800/70',
  },
  monitoring: {
    toneClass: 'text-cyan-700 dark:text-cyan-300',
    dividerClass: 'bg-cyan-200/90 dark:bg-cyan-800/70',
  },
  medication: {
    toneClass: 'text-violet-700 dark:text-violet-300',
    dividerClass: 'bg-violet-200/90 dark:bg-violet-800/70',
  },
  'urgent-care': {
    toneClass: 'text-rose-700 dark:text-rose-300',
    dividerClass: 'bg-rose-200/90 dark:bg-rose-800/70',
  },
  prevention: {
    toneClass: 'text-blue-700 dark:text-blue-300',
    dividerClass: 'bg-blue-200/90 dark:bg-blue-800/70',
  },
  wellbeing: {
    toneClass: 'text-pink-700 dark:text-pink-300',
    dividerClass: 'bg-pink-200/90 dark:bg-pink-800/70',
  },
  'life-stages': {
    toneClass: 'text-indigo-700 dark:text-indigo-300',
    dividerClass: 'bg-indigo-200/90 dark:bg-indigo-800/70',
  },
}

export function getEducationGroupStyle(
  groupId: EducationModuleGroupId,
): EducationGroupStyle {
  return EDUCATION_GROUP_STYLES[groupId]
}

export interface ResolvedEducationModule {
  definition: EducationModuleDefinition
  section: EducationSection | null
  facts: EducationFact[]
  available: boolean
  recommendation: string
}

export interface EducationCareSummary {
  updatedThrough: string | null
  currentState: string[]
  priorities: string[]
  nextSteps: string[]
}

export function resolveEducationModules(
  plan: EducationPlan,
  schema: EducationContentSchema,
): ResolvedEducationModule[] {
  const sections = new Map(plan.sections.map((section) => [section.id, section]))
  const facts = new Map(plan.facts.map((fact) => [fact.id, fact]))

  return [...schema.modules]
    .sort((left, right) => {
      const leftGroup = schema.groups.find((group) => group.id === left.groupId)?.order ?? 0
      const rightGroup = schema.groups.find((group) => group.id === right.groupId)?.order ?? 0
      return leftGroup - rightGroup || left.order - right.order
    })
    .map((definition) => {
      const suppliedSection = sections.get(definition.id)
      const section = suppliedSection ?? definition.defaultSection ?? null
      return {
        definition,
        section,
        facts: definition.factIds
          .map((factId) => facts.get(factId))
          .filter((fact): fact is EducationFact => Boolean(fact)),
        available: Boolean(section),
        recommendation: section
          ? definition.recommendationOverride ?? section.action
          : definition.library.action,
      }
    })
}

/**
 * A handout contains every universally useful module plus every module that
 * the loaded record actually supports. Situation-specific modules remain out
 * unless the disease pack supplied a matching section.
 */
export function selectEducationHandoutModules(
  modules: readonly ResolvedEducationModule[],
  context: { age?: number | null } = {},
): ResolvedEducationModule[] {
  return modules.filter((educationModule) => (
    educationModule.definition.availability === 'core'
    || educationModule.available
    || (
      context.age !== null
      && context.age !== undefined
      && context.age >= 65
      && educationModule.definition.requiredCapabilities.includes('older-age')
    )
  ))
}

function latestRecordedDate(facts: readonly EducationFact[]): string | null {
  const dates = facts.flatMap((fact) => (
    fact.detail.match(/20\d{2}\/\d{2}\/\d{2}/g) ?? []
  ))
  return dates.sort().at(-1) ?? null
}

export function buildEducationCareSummary(
  plan: EducationPlan,
  modules: readonly ResolvedEducationModule[],
): EducationCareSummary {
  const currentState = plan.facts
    .filter((fact) => fact.id !== 'diagnosis')
    .map((fact) => fact.value)
    .slice(0, 3)
  const featured = modules.filter((educationModule) => (
    educationModule.definition.showOnMainWhenAvailable && educationModule.available
  )).sort((left, right) => (
    (left.definition.summaryOrder ?? Number.MAX_SAFE_INTEGER)
    - (right.definition.summaryOrder ?? Number.MAX_SAFE_INTEGER)
  ))

  return {
    updatedThrough: latestRecordedDate(plan.facts),
    currentState: currentState.length > 0
      ? currentState
      : ['這次資料沒有可摘要的檢驗或處方；仍可查看完整糖尿病衛教。'],
    priorities: featured
      .map((educationModule) => educationModule.section?.title)
      .filter((title): title is string => Boolean(title))
      .slice(0, 3),
    nextSteps: plan.actionChoices
      .map((choice) => choice.label)
      .slice(0, 2),
  }
}

export function mergeEducationSources(
  plan: EducationPlan,
  schema: EducationContentSchema,
): Record<string, EducationSource> {
  return { ...schema.sources, ...plan.sources }
}
