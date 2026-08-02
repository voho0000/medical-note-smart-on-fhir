import { getEducationContentSchema } from '@voho0000/personalized-education'
import {
  GROUP_TONES,
  type GroupTone,
  type GroupToneName,
} from '@/src/shared/constants/group-tones'
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

/**
 * Every governed group needs a tone. `Record` (not `Partial`) makes a new group
 * in the package a compile error here rather than an unstyled heading.
 */
export const EDUCATION_GROUP_TONES: Record<EducationModuleGroupId, GroupToneName> = {
  understanding: 'teal',
  'daily-life': 'orange',
  monitoring: 'cyan',
  medication: 'violet',
  'urgent-care': 'rose',
  prevention: 'blue',
  wellbeing: 'pink',
  'life-stages': 'indigo',
}

export function getEducationGroupStyle(
  groupId: EducationModuleGroupId,
): GroupTone {
  return GROUP_TONES[EDUCATION_GROUP_TONES[groupId]]
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
