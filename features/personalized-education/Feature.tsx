"use client"

import { Fragment, useCallback, useMemo, useState } from 'react'
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  ExternalLink,
  HeartPulse,
  Printer,
  TriangleAlert,
} from 'lucide-react'
import type {
  EducationPlan,
  EducationSource,
} from './types'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  buildEducationCareSummary,
  getEducationContentSchema,
  getEducationGroupStyle,
  mergeEducationSources,
  resolveEducationModules,
  selectEducationHandoutModules,
  type EducationCareSummary,
  type EducationModuleGroupDefinition,
  type EducationModuleGroupId,
  type EducationContentSchema,
  type ResolvedEducationModule,
} from './presentation-schema'

export interface PersonalizedEducationFeatureProps {
  plan: EducationPlan | null
  audience?: 'medical' | 'patient'
  age?: number | null
}

type EducationPrintFontSize = 'standard' | 'large'
type EducationTopicFilter = 'personal' | 'all'

// Touch targets are sized in pixels, not rem. This app sets a 12px root, so
// Tailwind's min-h-11 (2.75rem) renders 33px — under any thumb-sized minimum.
//
// Navigation and print chrome therefore separate hit area from visual size: a
// mouse gets a compact control, and a coarse pointer keeps the thumb-sized one.
// Anything a finger has to hit uses this, so shrinking the chrome never costs
// a phone reader accuracy.
const COMPACT_TARGET = 'min-h-8 [@media(pointer:coarse)]:min-h-[44px]'

function printEducationHandout(): void {
  const printClass = 'printing-education-handout'
  const source = document.querySelector<HTMLElement>('[data-education-print-root]')
  if (!source) return

  document.querySelector('[data-education-print-container]')?.remove()

  const printContainer = document.createElement('div')
  printContainer.setAttribute('data-education-print-container', '')
  printContainer.setAttribute('aria-hidden', 'true')

  const handout = source.cloneNode(true) as HTMLElement
  handout.removeAttribute('data-education-print-root')
  handout.querySelectorAll<HTMLElement>('[class~="print:hidden"]').forEach((element) => {
    element.remove()
  })
  printContainer.appendChild(handout)
  document.body.appendChild(printContainer)

  const cleanup = () => {
    document.body.classList.remove(printClass)
    printContainer.remove()
    window.removeEventListener('afterprint', cleanup)
    window.removeEventListener('focus', cleanup)
  }

  document.body.classList.add(printClass)
  window.addEventListener('afterprint', cleanup)
  window.addEventListener('focus', cleanup)
  window.print()
}

function SourceLinks({
  sourceIds,
  sources,
}: {
  sourceIds: readonly string[]
  sources: Record<string, EducationSource>
}) {
  const resolved = sourceIds
    .map((sourceId) => sources[sourceId])
    .filter((source): source is EducationSource => Boolean(source))

  if (resolved.length === 0) return null

  return (
    <details className="group mt-4 text-xs text-muted-foreground">
      <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-1.5 px-1 py-2 font-medium hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <ChevronDown
          className="size-3.5 transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
        查看參考資料
      </summary>
      <ul className="space-y-2 border-l pl-4">
        {resolved.map((source) => (
          <li key={source.id}>
            <a
              className="inline-flex min-h-[44px] items-center gap-1.5 py-2 text-primary underline-offset-4 hover:underline"
              href={source.url}
              target="_blank"
              rel="noreferrer"
            >
              {source.label}
              <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
            </a>
          </li>
        ))}
      </ul>
    </details>
  )
}

function CareSummary({ summary }: { summary: EducationCareSummary }) {
  const sections = [
    {
      id: 'current',
      title: '目前的健康狀況',
      items: summary.currentState,
      icon: ClipboardList,
      tone: 'text-teal-700 dark:text-teal-300',
    },
    {
      id: 'priority',
      title: '這次優先了解',
      items: summary.priorities,
      icon: HeartPulse,
      tone: 'text-amber-700 dark:text-amber-300',
    },
    {
      id: 'next',
      title: '接下來可以做',
      items: summary.nextSteps,
      icon: Check,
      tone: 'text-primary',
    },
  ].filter((section) => section.items.length > 0)

  return (
    <section
      id="education-care-summary"
      className="scroll-mt-16 border-b border-border pb-7 print:hidden"
      aria-labelledby="education-summary-title"
      data-testid="education-care-summary"
    >
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-primary">先看摘要</p>
          <h2 id="education-summary-title" className="mt-1 text-2xl font-bold text-foreground sm:text-3xl">
            這次的糖尿病照護摘要
          </h2>
        </div>
        {summary.updatedThrough ? (
          <p className="text-xs text-muted-foreground">
            資料更新至 {summary.updatedThrough}
          </p>
        ) : null}
      </div>

      <div className="mt-5 grid gap-6 @min-[50rem]:grid-cols-3 @min-[50rem]:divide-x @min-[50rem]:divide-border">
        {sections.map((section) => {
          const Icon = section.icon
          return (
            <section key={section.id} className={`@min-[50rem]:pl-6 @min-[50rem]:first:pl-0 ${section.tone}`}>
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Icon className="size-4" aria-hidden="true" />
                {section.title}
              </h3>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-foreground">
                {section.items.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-current opacity-60" aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>
    </section>
  )
}

/**
 * Jump straight to a section instead of scrolling past everything before it.
 *
 * A native select rather than a row of chips: the detailed view lists 24
 * sections across 8 groups, which no chip row fits in this panel, and optgroup
 * keeps the grouping visible while collapsing to a single control. It also
 * gets keyboard and touch behaviour for free, which matters more here than a
 * bespoke menu would.
 */
const SUMMARY_TOPIC_ID = 'summary'

interface EducationTopic {
  id: string
  label: string
  groupId: EducationModuleGroupId
  /** True when the record supports a personalised reading of this topic. */
  personalised: boolean
  educationModule: ResolvedEducationModule | null
}

function buildTopics(
  modules: readonly ResolvedEducationModule[],
): EducationTopic[] {
  return modules.map((educationModule) => ({
    id: educationModule.definition.id,
    label: educationModule.definition.label,
    groupId: educationModule.definition.groupId,
    personalised: educationModule.available,
    educationModule,
  }))
}

function groupTopics(
  groups: readonly EducationModuleGroupDefinition[],
  topics: readonly EducationTopic[],
) {
  return groups
    .map((group) => ({
      group,
      topics: topics.filter((topic) => topic.groupId === group.id),
    }))
    .filter((entry) => entry.topics.length > 0)
}

/** Marks a topic the record speaks to, so the relevant ones stand out at a glance. */
function PersonalDot() {
  return (
    <span
      className="size-1.5 shrink-0 rounded-full bg-primary"
      title="和你的資料有關"
      aria-label="和你的資料有關"
    />
  )
}

/**
 * Topic navigation, always visible, one tap to switch.
 *
 * Two shapes rather than one: a 595px panel cannot spare 200px for a rail
 * without breaking Chinese lines into fragments, and a phone has less. Wide
 * layouts get a full list with every topic visible; narrow layouts get a group
 * row plus that group's topics, which keeps switching inside a group to a
 * single tap. Both are rendered and toggled by container query, because the
 * container width — not the viewport — is what constrains this panel.
 */
/** Rendered by the caller so it stays out of the scrolling row. */
function TopicFilterChip({
  topicFilter,
  onToggleFilter,
  variant,
}: {
  topicFilter: EducationTopicFilter
  onToggleFilter: () => void
  variant: 'narrow' | 'wide'
}) {
  return (
    <button
      type="button"
      onClick={onToggleFilter}
      className={`${COMPACT_TARGET} flex shrink-0 items-center gap-1 whitespace-nowrap px-1 text-xs text-muted-foreground underline decoration-dotted underline-offset-4 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
      data-testid={`education-topic-filter-${variant}`}
    >
      {topicFilter === 'personal' ? '全部主題' : '和我的資料有關'}
    </button>
  )
}

function TopicNav({
  groups,
  topics,
  activeId,
  visited,
  onSelect,
  topicFilter,
  onToggleFilter,
  variant,
  openGroupId,
  onOpenGroup,
}: {
  groups: readonly EducationModuleGroupDefinition[]
  topics: readonly EducationTopic[]
  activeId: string
  visited: ReadonlySet<string>
  onSelect: (id: string) => void
  topicFilter: EducationTopicFilter
  onToggleFilter: () => void
  variant: 'narrow' | 'wide'
  openGroupId: EducationModuleGroupId | null
  onOpenGroup: (groupId: EducationModuleGroupId) => void
}) {
  const grouped = groupTopics(groups, topics)
  const activeGroupId = topics.find((topic) => topic.id === activeId)?.groupId ?? null
  const openGroup = grouped.find(
    (entry) => entry.group.id === (openGroupId ?? activeGroupId),
  ) ?? null

  const itemClass = (id: string) => (
    `${COMPACT_TARGET} flex w-full items-center gap-2 rounded-lg px-2.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
      activeId === id
        ? 'bg-primary/10 font-semibold text-foreground'
        : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
    }`
  )

  const summaryButton = (
    <button
      type="button"
      onClick={() => onSelect(SUMMARY_TOPIC_ID)}
      aria-current={activeId === SUMMARY_TOPIC_ID ? 'true' : undefined}
      className={itemClass(SUMMARY_TOPIC_ID)}
      data-testid={`education-topic-summary-${variant}`}
    >
      <ClipboardList className="size-4 shrink-0" aria-hidden="true" />
      先看摘要
    </button>
  )

  return (
    <nav aria-label="衛教主題" data-testid="education-topic-nav">
      {variant === 'wide' ? (
      <div className="hidden @min-[60rem]:block @min-[60rem]:w-52 @min-[60rem]:shrink-0">
        <div className="max-h-[calc(100svh-14rem)] overflow-y-auto pr-1">
          <div className="mb-2">
            <TopicFilterChip
              topicFilter={topicFilter}
              onToggleFilter={onToggleFilter}
              variant="wide"
            />
          </div>
          {summaryButton}
          {grouped.map(({ group, topics: groupTopicList }) => (
            <div key={group.id} className="mt-4">
              <p className={`px-3 text-xs font-semibold ${getEducationGroupStyle(group.id).toneClass}`}>
                {group.label}
              </p>
              <ul className="mt-1">
                {groupTopicList.map((topic) => (
                  <li key={topic.id}>
                    <button
                      type="button"
                      onClick={() => onSelect(topic.id)}
                      aria-current={activeId === topic.id ? 'true' : undefined}
                      className={itemClass(topic.id)}
                      data-testid={`education-topic-${topic.id}-${variant}`}
                    >
                      {topic.personalised ? <PersonalDot /> : null}
                      <span className="min-w-0 flex-1 truncate">{topic.label}</span>
                      {visited.has(topic.id) && activeId !== topic.id ? (
                        <Check className="size-3.5 shrink-0 text-primary/60" aria-label="已看過" />
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      ) : (

      /*
        Narrow: groups wrap onto lines, and the open group lists its topics
        below. Nothing is reached by swiping sideways — a topic that needs a
        horizontal scroll to be seen is a topic the reader does not know exists
        — and because the groups stay on screen there is no level to back out
        of. Group labels are long in Chinese, so wrapping, not scrolling, is
        what keeps them all visible.
      */
      <div className="py-1" data-testid="education-topic-row">
        <div className="flex flex-wrap gap-x-1 gap-y-0.5">
          <button
            type="button"
            onClick={() => onSelect(SUMMARY_TOPIC_ID)}
            aria-current={activeId === SUMMARY_TOPIC_ID ? 'true' : undefined}
            className={`${COMPACT_TARGET} whitespace-nowrap rounded-full px-2.5 text-sm transition-colors ${
              activeId === SUMMARY_TOPIC_ID
                ? 'bg-primary font-semibold text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            data-testid={`education-topic-summary-${variant}`}
          >
            摘要
          </button>
          {grouped.map(({ group, topics: groupTopicList }) => {
            const isOpen = openGroupId === group.id
            return (
              <button
                key={group.id}
                type="button"
                onClick={() => onOpenGroup(group.id)}
                aria-expanded={isOpen}
                className={`${COMPACT_TARGET} flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-sm transition-colors ${
                  isOpen
                    ? 'bg-primary font-semibold text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                data-testid={`education-group-${group.id}`}
              >
                {group.label}
                <span className="text-xs opacity-70">{groupTopicList.length}</span>
              </button>
            )
          })}
        </div>

        {openGroup ? (
          <div
            className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 border-t border-border pt-0.5"
            data-testid="education-group-topics"
          >
            {openGroup.topics.map((topic) => (
              <button
                key={topic.id}
                type="button"
                onClick={() => onSelect(topic.id)}
                aria-current={activeId === topic.id ? 'true' : undefined}
                className={`${COMPACT_TARGET} flex items-center gap-1.5 whitespace-nowrap border-b-2 px-1 text-sm transition-colors ${
                  activeId === topic.id
                    ? 'border-primary font-semibold text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
                data-testid={`education-topic-${topic.id}-${variant}`}
              >
                {topic.personalised ? <PersonalDot /> : null}
                {topic.label}
                {visited.has(topic.id) && activeId !== topic.id ? (
                  <Check className="size-3.5 text-primary/60" aria-label="已看過" />
                ) : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      )}
    </nav>
  )
}

/**
 * Moves the reader on without sending them back to the navigation.
 *
 * The next control names the topic it leads to rather than saying "next":
 * a label the reader can want is what makes the tap worth making, and the
 * count tells them how much is left so finishing feels reachable.
 */
function TopicFooter({
  previous,
  next,
  position,
  total,
  understandingCheck,
  onSelect,
}: {
  previous: EducationTopic | null
  next: EducationTopic | null
  position: number
  total: number
  understandingCheck: string | null
  onSelect: (id: string) => void
}) {
  return (
    <div className="mt-6 border-t border-border pt-4" data-testid="education-topic-footer">
      {understandingCheck ? (
        <p className="mb-4 text-sm leading-6 text-muted-foreground">
          <span className="font-semibold text-foreground">看完想一下：</span>
          {understandingCheck}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        {previous ? (
          <button
            type="button"
            onClick={() => onSelect(previous.id)}
            className="inline-flex min-h-[44px] max-w-[45%] items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data-testid="education-topic-previous"
          >
            <ChevronLeft className="size-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{previous.label}</span>
          </button>
        ) : <span />}

        <span className="text-xs tabular-nums text-muted-foreground" data-testid="education-topic-position">
          {position} / {total}
        </span>

        {next ? (
          <button
            type="button"
            onClick={() => onSelect(next.id)}
            className="inline-flex min-h-[44px] max-w-[55%] items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/5 px-3 text-sm font-semibold text-foreground hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data-testid="education-topic-next"
          >
            <span className="min-w-0 truncate">
              <span className="text-muted-foreground">接著看：</span>
              {next.label}
            </span>
            <ChevronRight className="size-4 shrink-0 text-primary" aria-hidden="true" />
          </button>
        ) : (
          <span className="text-sm font-semibold text-primary" data-testid="education-topic-complete">
            這些主題你都看過了
          </span>
        )}
      </div>
    </div>
  )
}

function getModuleWhyItMatters(educationModule: ResolvedEducationModule): readonly string[] {
  return educationModule.definition.library.whyItMatters
    ?? [educationModule.definition.library.detail]
}

function getModuleHowToDoIt(educationModule: ResolvedEducationModule): readonly string[] {
  return educationModule.definition.library.howToDoIt
    ?? [educationModule.recommendation]
}

function getModuleUnderstandingCheck(educationModule: ResolvedEducationModule): string {
  const { definition } = educationModule
  return definition.library.understandingCheck
    ?? (definition.library.safety
      ? '如果出現上面的警訊，你會怎麼處理？'
      : `如果要向家人說明「${definition.label}」，你會先說哪個重點？接下來可以做什麼？`)
}

function CompactPrintHandout({
  schema,
  summary,
  modules,
  fontSize,
}: {
  schema: EducationContentSchema
  summary: EducationCareSummary
  modules: ResolvedEducationModule[]
  fontSize: EducationPrintFontSize
}) {
  const isLargeText = fontSize === 'large'
  const personalizedModules = modules
    .filter((educationModule) => educationModule.definition.availability !== 'core')
    .sort((left, right) => (
      (left.definition.summaryOrder ?? Number.MAX_SAFE_INTEGER)
      - (right.definition.summaryOrder ?? Number.MAX_SAFE_INTEGER)
    ))
  const coreModules = modules.filter(
    (educationModule) => educationModule.definition.availability === 'core',
  )
  const safetyItems = personalizedModules
    .map((educationModule) => ({
      id: educationModule.definition.id,
      label: educationModule.definition.label,
      safety: educationModule.definition.library.safety,
    }))
    .filter((item): item is typeof item & { safety: string } => Boolean(item.safety))

  return (
    <article
      className="hidden print:block"
      aria-hidden="true"
      data-education-compact-print
      data-education-print-mode="summary"
      data-education-print-font-size={fontSize}
      data-testid="education-compact-print"
    >
      <section data-education-print-page="1">
        <header className="border-b-[3px] border-foreground pb-3">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-[12pt] font-semibold text-primary">{schema.diseaseLabel} · 重點版</p>
              <h1 className="mt-1 text-[25pt] font-bold leading-tight text-foreground">
                {schema.pageTitle}
              </h1>
            </div>
            {summary.updatedThrough ? (
              <p className="shrink-0 text-[11pt] text-muted-foreground">
                資料更新至 {summary.updatedThrough}
              </p>
            ) : null}
          </div>
        </header>

        {summary.currentState.length > 0 ? (
          <section
            className="mt-4 rounded-xl border-2 border-teal-400 bg-teal-50 px-4 py-3"
            data-education-print-section
          >
            <h2 className={`${isLargeText ? 'text-[17pt]' : 'text-[15pt]'} font-bold text-teal-950`}>這次資料顯示</h2>
            <ul className={`mt-2 grid grid-cols-2 gap-x-6 gap-y-1.5 ${isLargeText ? 'text-[16pt]' : 'text-[14pt]'} leading-[1.35] text-foreground`}>
              {summary.currentState.slice(0, 4).map((item) => (
                <li key={item} className="flex gap-2">
                  <span aria-hidden="true">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="mt-3" aria-labelledby="compact-print-modules-title">
          <h2 id="compact-print-modules-title" className="text-[17pt] font-bold text-foreground">
            依你的資料，先看這些重點
          </h2>
          <div className="mt-1 grid grid-cols-2 gap-x-6">
            {personalizedModules.map((educationModule) => (
              <section
                key={educationModule.definition.id}
                className="border-b-2 border-border py-2"
                data-education-print-section
                data-education-print-module={educationModule.definition.id}
              >
                <h3 className={`${isLargeText ? 'text-[16pt]' : 'text-[14pt]'} font-bold leading-tight text-foreground`}>
                  {educationModule.definition.label}
                </h3>
                <p className={`mt-1 ${isLargeText ? 'text-[14pt]' : 'text-[12.5pt]'} leading-[1.35] text-foreground`}>
                  <span className="font-semibold">目前重點：</span>
                  {educationModule.section?.title ?? educationModule.definition.library.takeaway}
                </p>
                <p className={`mt-1 ${isLargeText ? 'text-[14pt]' : 'text-[12.5pt]'} leading-[1.35] text-foreground`}>
                  {educationModule.definition.handoutText ?? educationModule.recommendation}
                </p>
              </section>
            ))}
          </div>
        </section>

        <div className={`mt-2.5 grid gap-3 ${safetyItems.length > 0 ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {safetyItems.length > 0 ? (
            <section
              className="rounded-xl border-2 border-rose-400 bg-rose-50 px-3.5 py-2.5"
              data-education-print-section
            >
              <h2 className={`${isLargeText ? 'text-[15pt]' : 'text-[14pt]'} font-bold text-rose-950`}>出現這些情況，請立即處理</h2>
              <ul className={`mt-1.5 space-y-1 ${isLargeText ? 'text-[12.5pt]' : 'text-[11.5pt]'} leading-[1.3] text-rose-950`}>
                {safetyItems.map((item) => (
                  <li key={item.id}>
                    <span className="font-semibold">{item.label}：</span>
                    {item.safety}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section
            className="rounded-xl border-2 border-sky-400 bg-sky-50 px-3.5 py-2.5"
            data-education-print-section
          >
            <h2 className={`${isLargeText ? 'text-[15pt]' : 'text-[14pt]'} font-bold text-sky-950`}>把這張帶回診，可以直接問</h2>
            <ul className={`mt-1.5 space-y-1 ${isLargeText ? 'text-[12.5pt]' : 'text-[11.5pt]'} leading-[1.3] text-foreground`}>
              {personalizedModules
                .map((educationModule) => educationModule.definition.handoutPrompt)
                .filter((prompt): prompt is string => Boolean(prompt))
                .map((prompt) => (
                  <li key={prompt} className="flex gap-2">
                    <span aria-hidden="true">□</span>
                    <span>{prompt}</span>
                  </li>
                ))}
            </ul>
          </section>
        </div>

      </section>

      <section data-education-print-page="2">
        <header className="border-b-2 border-foreground pb-2">
          <p className="text-[11pt] font-semibold text-primary">{schema.diseaseLabel}</p>
          <h2 className="mt-1 text-[20pt] font-bold leading-tight text-foreground">
            平時照護速查
          </h2>
          <p className="mt-1 text-[12pt] leading-snug text-muted-foreground">
            不用一次全部做到；需要時找到標題，再看下面的一句做法。
          </p>
        </header>

        <div className="mt-2 grid grid-cols-2 gap-x-6">
          {coreModules.map((educationModule) => (
            <section
              key={educationModule.definition.id}
              className="border-b border-border py-0.5"
              data-education-print-section
              data-education-print-module={educationModule.definition.id}
            >
              <h3 className={`${isLargeText ? 'text-[14pt]' : 'text-[13pt]'} font-bold leading-tight text-foreground`}>
                {educationModule.definition.label}
              </h3>
              <p className={`${isLargeText ? 'text-[12.25pt]' : 'text-[11.75pt]'} leading-[1.2] text-foreground`}>
                {educationModule.definition.handoutText
                  ?? `${educationModule.definition.library.takeaway} ${educationModule.recommendation}`}
              </p>
            </section>
          ))}
        </div>

        <footer className="mt-2 border-t pt-1.5 text-[9pt] leading-snug text-muted-foreground">
          {schema.handoutSourceNote ? `${schema.handoutSourceNote} ` : null}
          完整參考資料可回系統查看。若內容與醫療團隊指示不同，請以醫療團隊說明為準。
        </footer>
      </section>
    </article>
  )
}

function DetailedPrintHandout({
  schema,
  summary,
  modules,
  sources,
  fontSize,
}: {
  schema: EducationContentSchema
  summary: EducationCareSummary
  modules: ResolvedEducationModule[]
  sources: Record<string, EducationSource>
  fontSize: EducationPrintFontSize
}) {
  const isLargeText = fontSize === 'large'
  const groups = schema.groups
    .map((group) => ({
      ...group,
      modules: modules.filter((educationModule) => (
        educationModule.definition.groupId === group.id
      )),
    }))
    .filter((group) => group.modules.length > 0)

  return (
    <article
      className="hidden print:block"
      aria-hidden="true"
      data-education-detailed-print
      data-education-print-mode="detailed"
      data-education-print-font-size={fontSize}
      data-testid="education-detailed-print"
    >
      <header className="border-b-[3px] border-foreground pb-3">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-[11pt] font-semibold text-primary">{schema.diseaseLabel} · 詳細解說版</p>
            <h1 className="mt-1 text-[24pt] font-bold leading-tight text-foreground">{schema.pageTitle}</h1>
          </div>
          {summary.updatedThrough ? (
            <p className="shrink-0 text-[10pt] text-muted-foreground">資料更新至 {summary.updatedThrough}</p>
          ) : null}
        </div>
        <p className={`${isLargeText ? 'text-[13pt]' : 'text-[11.5pt]'} mt-2 leading-[1.4] text-muted-foreground`}>
          依目前適用主題整理原因、做法與需要留意的情況；可分次閱讀，不必一次全部看完。
        </p>
      </header>

      {summary.currentState.length > 0 ? (
        <section className="border-b border-border py-3" data-education-print-section>
          <h2 className={`${isLargeText ? 'text-[16pt]' : 'text-[14pt]'} font-bold text-foreground`}>這次資料摘要</h2>
          <ul className={`${isLargeText ? 'text-[13pt]' : 'text-[11.5pt]'} mt-1 grid grid-cols-2 gap-x-6 gap-y-1 leading-[1.4]`}>
            {summary.currentState.map((item) => (
              <li key={item} className="flex gap-2"><span>•</span><span>{item}</span></li>
            ))}
          </ul>
        </section>
      ) : null}

      {groups.map((group) => (
        <section key={group.id} className="mt-5" data-education-print-group={group.id}>
          <header className="border-b-2 border-foreground pb-1.5" data-education-print-group-heading>
            <h2 className={`${isLargeText ? 'text-[18pt]' : 'text-[16pt]'} font-bold text-foreground`}>{group.label}</h2>
            <p className={`${isLargeText ? 'text-[11.5pt]' : 'text-[10.5pt]'} mt-0.5 text-muted-foreground`}>{group.description}</p>
          </header>

          {group.modules.map((educationModule) => {
            const { definition, section } = educationModule
            const sourceLabels = Array.from(new Set([
              ...definition.library.sourceIds,
              ...(section?.sourceIds ?? []),
            ])).map((sourceId) => sources[sourceId]?.label).filter(Boolean)
            return (
              <article
                key={definition.id}
                className="border-b border-border py-3"
                data-education-print-section
                data-education-print-module={definition.id}
              >
                <h3 className={`${isLargeText ? 'text-[16pt]' : 'text-[14pt]'} font-bold leading-tight text-foreground`}>{definition.label}</h3>
                <section className={`${isLargeText ? 'text-[12.25pt]' : 'text-[11.5pt]'} mt-2 leading-[1.35]`}>
                  <p><span className="font-semibold">先理解：</span>{definition.library.takeaway}</p>
                  <div className="mt-1">
                    <span className="font-semibold">為什麼重要：</span>
                    {getModuleWhyItMatters(educationModule).map((paragraph) => (
                      <p key={paragraph} className="mt-0.5">{paragraph}</p>
                    ))}
                  </div>
                  {section ? (
                    <div className="mt-1 border-l-2 border-teal-500 pl-2.5">
                      <p className="font-semibold">和你目前資料的關係：{section.title}</p>
                      <p>{section.summary}</p>
                      {section.explanation.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                    </div>
                  ) : null}
                  <div className="mt-1">
                    <span className="font-semibold">實際可以怎麼做：</span>
                    <ul className="ml-4 list-disc">
                      {getModuleHowToDoIt(educationModule).map((step) => <li key={step}>{step}</li>)}
                    </ul>
                  </div>
                  {definition.library.safety ? (
                    <p className="mt-1 border-l-2 border-rose-500 pl-2.5 text-rose-950">
                      <span className="font-semibold">需要盡快處理：</span>{definition.library.safety}
                    </p>
                  ) : null}
                  <p className="mt-1"><span className="font-semibold">看完確認：</span>{getModuleUnderstandingCheck(educationModule)}</p>
                  {sourceLabels.length > 0 ? (
                    <p className="mt-1 text-[9pt] leading-snug text-muted-foreground">參考：{sourceLabels.join('、')}</p>
                  ) : null}
                </section>
              </article>
            )
          })}
        </section>
      ))}

      <footer className="mt-4 border-t pt-2 text-[9.5pt] leading-snug text-muted-foreground">
        {schema.handoutSourceNote ? `${schema.handoutSourceNote} ` : null}
        本內容不取代診斷、個人治療目標或緊急醫療；若與醫療團隊指示不同，請以醫療團隊說明為準。
      </footer>
    </article>
  )
}

/**
 * One topic, shown in full.
 *
 * There is no longer a short and a long variant of a topic. Two depths existed
 * because reading everything meant scrolling 15,000px; now that topics are
 * reached by tapping, length is no longer the cost it was, and a reader should
 * not have to guess which variant holds the part they need.
 *
 * The two content sources keep distinct jobs so the merge does not repeat
 * itself: the disease pack's section says what THIS record shows, the
 * catalogue says why the topic matters to anyone and what to do about it.
 */
function TopicView({
  educationModule,
  group,
  sources,
}: {
  educationModule: ResolvedEducationModule
  group: EducationModuleGroupDefinition
  sources: Record<string, EducationSource>
}) {
  const { definition, section, facts } = educationModule
  const whyItMatters = getModuleWhyItMatters(educationModule)
  const howToDoIt = getModuleHowToDoIt(educationModule)
  const moduleSourceIds = Array.from(new Set([
    ...definition.library.sourceIds,
    ...(section?.sourceIds ?? []),
  ]))
  const medicationFact = facts.find((fact) => (
    fact.detail.includes('處方紀錄') || fact.detail.includes('用藥陳述')
  ))
  const patientFacts = facts.filter((fact) => fact.id !== 'diagnosis')
  const moduleTone = section?.tone === 'attention'
    ? {
        label: '這次先留意',
        badge: 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200',
        accent: 'border-amber-400 dark:border-amber-700',
      }
    : definition.groupId === 'medication' && section
      ? {
          label: medicationFact?.detail.includes('處方紀錄')
            ? '有處方紀錄'
            : medicationFact?.detail.includes('用藥陳述')
              ? '有用藥紀錄'
              : '用藥提醒',
          badge: 'border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200',
          accent: 'border-sky-400 dark:border-sky-700',
        }
      : section
        ? {
            label: '和你的資料有關',
            badge: 'border-primary/25 bg-primary/5 text-primary',
            accent: 'border-primary/50',
          }
        : {
            label: '值得了解',
            badge: 'border-border bg-muted/50 text-muted-foreground',
            accent: 'border-border',
          }

  return (
    <article
      id={`education-${definition.id}`}
      data-testid={`education-module-${definition.id}`}
      data-group-id={group.id}
    >
      <header className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h2 className="text-lg font-bold leading-snug text-foreground sm:text-xl">
          {definition.label}
        </h2>
        <span className={`text-xs font-medium ${getEducationGroupStyle(group.id).toneClass}`}>
          {group.label}
        </span>
        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${moduleTone.badge}`}>
          {moduleTone.label}
        </span>
      </header>

      <div className="mt-3 max-w-3xl text-sm leading-7 sm:text-base">
        {patientFacts.length > 0 ? (
          <dl
            className="flex flex-wrap gap-x-6 gap-y-1 border-b border-border pb-3 text-sm"
            data-testid={`education-module-figures-${definition.id}`}
          >
            {patientFacts.map((fact) => (
              <div key={fact.id} className="flex flex-wrap items-baseline gap-x-2">
                <dt className="text-xs text-muted-foreground">{fact.label}</dt>
                <dd className="font-bold text-foreground">{fact.value}</dd>
                <dd className="text-xs text-muted-foreground">{fact.detail}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        {section ? (
          <section className="mt-4">
            <h3 className="text-sm font-semibold text-primary">你的狀況</h3>
            <p className="mt-1 text-lg font-semibold leading-8 text-foreground">
              {section.title}
            </p>
            <p className="mt-2 font-medium text-foreground">{section.summary}</p>
            <div className="mt-2 space-y-2 text-muted-foreground">
              {section.explanation.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </section>
        ) : (
          <section>
            <h3 className="text-sm font-semibold text-primary">先理解這件事</h3>
            <p className="mt-1 text-lg font-semibold leading-8 text-foreground">
              {definition.library.takeaway}
            </p>
          </section>
        )}

        <section className="mt-5">
          <h3 className="text-sm font-semibold text-foreground">為什麼重要</h3>
          <div className="mt-2 space-y-2 text-muted-foreground">
            {whyItMatters.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        </section>

        <section className={`mt-5 border-l-2 pl-4 ${moduleTone.accent}`}>
          <h3 className="text-sm font-semibold text-foreground">實際可以怎麼做</h3>
          <ul className="mt-2 space-y-2 text-foreground">
            {section ? (
              <li className="flex gap-2">
                <Check className="mt-1.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                <span>
                  <span className="font-semibold">依你的資料：</span>
                  {educationModule.recommendation}
                </span>
              </li>
            ) : null}
            {howToDoIt.map((step) => (
              <li key={step} className="flex gap-2">
                <Check className="mt-1.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                <span>{step}</span>
              </li>
            ))}
          </ul>
        </section>

        {definition.library.safety ? (
          <section className="mt-4 border-l-2 border-rose-500 pl-4 text-rose-950 dark:text-rose-100">
            <h3 className="text-sm font-semibold">什麼情況要盡快處理</h3>
            <p className="mt-1">{definition.library.safety}</p>
          </section>
        ) : null}

        <details
          className="group text-sm print:hidden"
          data-testid={`education-module-detail-${definition.id}`}
        >
          <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" aria-hidden="true" />
            資料、判斷與來源
          </summary>
          <div className="space-y-5 border-l pl-4 text-muted-foreground">
            {facts.length > 0 ? (
              <section>
                <h4 className="font-semibold text-foreground">這次使用的資料</h4>
                <ul className="mt-2 space-y-2">
                  {facts.map((fact) => (
                    <li key={fact.id}>
                      <span className="font-medium text-foreground">{fact.label}：</span>
                      {fact.value}（{fact.detail}）
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            <section className="space-y-3">
              <h4 className="font-semibold text-foreground">判斷方式與限制</h4>
              <p>
                <span className="font-medium text-foreground">什麼情況適用：</span>
                {definition.rule.applicability}
              </p>
              <p>
                <span className="font-medium text-foreground">怎麼判斷：</span>
                {definition.rule.method}
              </p>
              <p>
                <span className="font-medium text-foreground">這項提醒的限制：</span>
                {definition.rule.limitation}
              </p>
            </section>
            <SourceLinks sourceIds={moduleSourceIds} sources={sources} />
          </div>
        </details>
      </div>
    </article>
  )
}

function NoEligiblePack() {
  return (
    <main className="mx-auto w-full max-w-3xl py-8" data-testid="education-no-pack">
      <h1 className="text-2xl font-bold text-foreground">
        這份紀錄沒有可以個人化的衛教主題
      </h1>
      <p className="mt-3 text-base leading-7 text-muted-foreground">
        目前的展示版本只收錄第二型糖尿病一個主題。你的健康存摺裡沒有這個診斷，所以這次沒有可以依你的資料整理的內容——這代表主題還沒收錄，不代表你的資料有問題。
      </p>

      <section className="mt-6 border-t border-border pt-5">
        <h2 className="text-sm font-semibold text-foreground">目前收錄的主題</h2>
        <ul className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
          <li className="flex gap-2">
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-current opacity-60" aria-hidden="true" />
            <span>
              <span className="font-medium text-foreground">第二型糖尿病</span>
              ：病歷中有第二型糖尿病診斷時才會出現；有糖化血色素、腎功能或排糖藥紀錄時，內容會再依這些資料調整。
            </span>
          </li>
        </ul>
      </section>

      <p className="mt-6 border-t border-border pt-4 text-xs leading-5 text-muted-foreground">
        若你確實有上述診斷卻看到這一頁，可能是健康存摺尚未包含該筆診斷紀錄；其他分頁的檢查與用藥資料仍可正常查看。
      </p>
    </main>
  )
}

export default function PersonalizedEducationFeature({
  plan,
  audience = 'patient',
  age,
}: PersonalizedEducationFeatureProps) {
  const [printFontSize, setPrintFontSize] = useState<EducationPrintFontSize>('standard')
  const [topicFilter, setTopicFilter] = useState<EducationTopicFilter>('personal')
  const [printScope, setPrintScope] = useState<'summary' | 'all'>('summary')
  const [activeTopicId, setActiveTopicId] = useState<string>(SUMMARY_TOPIC_ID)
  const [visited, setVisited] = useState<ReadonlySet<string>>(() => new Set())
  const [openGroupId, setOpenGroupId] = useState<EducationModuleGroupId | null>(null)

  const schema = plan ? getEducationContentSchema(plan.packId) : null
  const resolvedModules = useMemo(
    () => (plan && schema ? resolveEducationModules(plan, schema) : []),
    [plan, schema],
  )
  const featuredModules = useMemo(
    () => resolvedModules.filter((educationModule) => (
      educationModule.definition.showOnMainWhenAvailable && educationModule.available
    )),
    [resolvedModules],
  )
  const handoutModules = useMemo(
    () => selectEducationHandoutModules(resolvedModules, { age }),
    [resolvedModules, age],
  )
  // 'all' lists the whole catalogue, including situation topics such as
  // pregnancy or dialysis that the printed handout leaves out. The accordion
  // that used to hold them is gone: reaching a topic is a tap now, so a second
  // browsing surface would only split the same content in two.
  const displayedModules = topicFilter === 'all' ? resolvedModules : featuredModules
  const topics = useMemo(() => buildTopics(displayedModules), [displayedModules])

  const selectTopic = useCallback((id: string, groupId?: EducationModuleGroupId) => {
    setActiveTopicId(id)
    if (groupId) setOpenGroupId(groupId)
    if (id !== SUMMARY_TOPIC_ID) {
      setVisited((current) => {
        if (current.has(id)) return current
        const next = new Set(current)
        next.add(id)
        return next
      })
    }
    // The pane is the reading surface: land at its top rather than wherever the
    // previous, possibly longer, topic left the scroll position. Guarded because
    // scrollIntoView is absent in jsdom, and an exception here would take the
    // topic switch down with it.
    const pane = document.querySelector('[data-education-topic-pane]')
    if (pane && typeof pane.scrollIntoView === 'function') {
      pane.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [])

  if (!plan || !schema) return <NoEligiblePack />

  const sortedGroups = [...schema.groups].sort((left, right) => left.order - right.order)
  const sources = mergeEducationSources(plan, schema)
  const careSummary = buildEducationCareSummary(plan, resolvedModules)
  const safetyItems = featuredModules
    .map((educationModule) => ({
      id: educationModule.definition.id,
      label: educationModule.definition.label,
      safety: educationModule.definition.library.safety,
    }))
    .filter((item): item is typeof item & { safety: string } => Boolean(item.safety))

  // A filter change can drop the open topic; fall back to the summary rather
  // than showing an empty pane.
  const activeTopic = topics.find((topic) => topic.id === activeTopicId) ?? null
  const showingSummary = activeTopicId === SUMMARY_TOPIC_ID || !activeTopic
  const activeIndex = activeTopic
    ? topics.findIndex((topic) => topic.id === activeTopic.id)
    : -1
  const previousTopic = showingSummary
    ? null
    : (activeIndex > 0 ? topics[activeIndex - 1] : null)
  const nextTopic = showingSummary
    ? topics[0] ?? null
    : (activeIndex >= 0 && activeIndex < topics.length - 1 ? topics[activeIndex + 1] : null)

  return (
    <main
      className="@container mx-auto w-full max-w-[72rem] pb-12 print:max-w-none"
      data-education-print-root
    >
      <style jsx global>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 10mm 12mm;
          }

          body.printing-education-handout {
            background: white !important;
          }

          body.printing-education-handout > * {
            display: none !important;
          }

          body.printing-education-handout > [data-education-print-container] {
            display: block !important;
            width: 100% !important;
            max-width: none !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
          }

          body.printing-education-handout [data-education-print-container] main {
            padding-bottom: 0 !important;
          }

          body.printing-education-handout [data-education-compact-print] {
            display: block !important;
            color: black !important;
          }

          body.printing-education-handout [data-education-detailed-print] {
            display: block !important;
            color: black !important;
          }

          body.printing-education-handout [data-education-print-section] {
            break-inside: avoid;
            page-break-inside: avoid;
          }

          body.printing-education-handout [data-education-detailed-print] [data-education-print-section] {
            break-inside: auto;
            page-break-inside: auto;
            orphans: 3;
            widows: 3;
          }

          body.printing-education-handout [data-education-detailed-print] [data-education-print-module] > h3 {
            break-after: avoid;
            page-break-after: avoid;
          }

          body.printing-education-handout [data-education-print-page="2"] {
            break-before: page;
            page-break-before: always;
          }

          body.printing-education-handout [data-education-print-group-heading] {
            break-inside: avoid;
            page-break-inside: avoid;
            break-after: avoid;
            page-break-after: avoid;
          }
        }

        [data-education-print-container] {
          display: none;
        }
      `}</style>

      {/*
        No visible page title. The panel tab already names this feature and the
        summary heading names the disease, so a heading and a disease chip here
        said the same thing a third time — and on a 647px pane every row of
        chrome is a row of content the reader loses. The heading stays for
        assistive technology, and print renders its own from the same source.
      */}
      <h1 className="sr-only">
        {schema.pageTitle}（{schema.diseaseLabel}）
      </h1>

      {/* Print output is unchanged: it stays a single scrolling handout. */}
      {printScope === 'all' ? (
        <DetailedPrintHandout
          schema={schema}
          summary={careSummary}
          modules={handoutModules}
          sources={sources}
          fontSize={printFontSize}
        />
      ) : (
        <CompactPrintHandout
          schema={schema}
          summary={careSummary}
          modules={handoutModules}
          fontSize={printFontSize}
        />
      )}

      {/*
        One row: topic navigation on narrow, print on both. The reading filter
        used to own a row of its own with two mode buttons; it is one switch,
        so it is now a single chip inside the navigation it filters. On wide
        layouts the navigation moves to the sidebar and this row keeps only
        print, which is why it right-aligns.
      */}
      {/*
        Settings, then navigation — two rows with two jobs.

        Scope, print and the topic list had been sharing a row, so a control
        that changes what you read sat beside one that produces paper. They are
        separated here, and the navigation below owns the whole width it needs.
      */}
      <section
        className="flex items-center justify-between gap-3 border-b border-border py-1 print:hidden"
        aria-label="閱讀範圍與列印"
        data-testid="education-reading-mode"
      >
        <TopicFilterChip
          topicFilter={topicFilter}
          onToggleFilter={() => setTopicFilter(
            topicFilter === 'personal' ? 'all' : 'personal',
          )}
          variant="narrow"
        />
        <div className="flex shrink-0 items-center gap-2">
          {audience === 'medical' ? (
            <span className="rounded-full border px-2 py-0.5 text-xs font-medium text-muted-foreground">
              民眾閱讀版預覽
            </span>
          ) : null}
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="列印"
                title="列印"
                className={`${COMPACT_TARGET} inline-flex min-w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:min-w-[44px]`}
                data-testid="education-print-menu"
              >
                <Printer className="size-4" aria-hidden="true" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 space-y-4">
              <fieldset>
                <legend className="text-xs font-medium text-muted-foreground">列印內容</legend>
                <div className="mt-1 flex gap-4">
                  {([
                    { value: 'summary', label: '重點版', hint: '兩頁' },
                    { value: 'all', label: '完整版', hint: '依主題分頁' },
                  ] as const).map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={printScope === option.value}
                      onClick={() => setPrintScope(option.value)}
                      className={`min-h-[44px] border-b-2 px-0.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        printScope === option.value
                          ? 'border-primary text-foreground'
                          : 'border-transparent text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {option.label}
                      <span className="ml-1 text-xs font-normal text-muted-foreground">
                        {option.hint}
                      </span>
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend className="text-xs font-medium text-muted-foreground">列印字級</legend>
                <div className="mt-1 flex gap-4">
                  {([
                    { value: 'standard', label: '標準' },
                    { value: 'large', label: '大字' },
                  ] as const).map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={printFontSize === option.value}
                      onClick={() => setPrintFontSize(option.value)}
                      className={`min-h-[44px] border-b-2 px-0.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        printFontSize === option.value
                          ? 'border-primary text-foreground'
                          : 'border-transparent text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </fieldset>

              <button
                type="button"
                onClick={printEducationHandout}
                className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                data-testid="education-print-confirm"
              >
                <Printer className="size-4" aria-hidden="true" />
                列印{printScope === 'all' ? '完整版' : '重點版'}
              </button>
              <p className="text-xs leading-5 text-muted-foreground">
                若預覽出現網址與日期，請在列印設定取消「頁首及頁尾」。
              </p>
            </PopoverContent>
          </Popover>
        </div>
      </section>

      <div className="border-b border-border print:hidden @min-[60rem]:hidden">
        <TopicNav
          variant="narrow"
          groups={sortedGroups}
          topics={topics}
          activeId={showingSummary ? SUMMARY_TOPIC_ID : activeTopicId}
          visited={visited}
          onSelect={selectTopic}
          topicFilter={topicFilter}
          onToggleFilter={() => setTopicFilter(
            topicFilter === 'personal' ? 'all' : 'personal',
          )}
          openGroupId={openGroupId}
          onOpenGroup={setOpenGroupId}
        />
      </div>

      <div className="mt-2 gap-6 print:hidden @min-[60rem]:flex" data-education-topic-pane>
        <TopicNav
          variant="wide"
          groups={sortedGroups}
          topics={topics}
          activeId={showingSummary ? SUMMARY_TOPIC_ID : activeTopicId}
          visited={visited}
          onSelect={selectTopic}
          topicFilter={topicFilter}
          onToggleFilter={() => setTopicFilter(
            topicFilter === 'personal' ? 'all' : 'personal',
          )}
          openGroupId={openGroupId}
          onOpenGroup={setOpenGroupId}
        />

        <div className="min-w-0 flex-1 pt-4 @min-[60rem]:border-l @min-[60rem]:border-border @min-[60rem]:pl-6 @min-[60rem]:pt-0">
          {showingSummary ? (
            <>
              <CareSummary summary={careSummary} />
              {safetyItems.length > 0 ? (
                <section
                  className="mt-6 border-t border-rose-300 pt-5 dark:border-rose-500/30"
                  aria-labelledby="education-safety-title"
                  data-testid="education-safety-summary"
                >
                  <div className="flex items-start gap-3">
                    <TriangleAlert className="mt-0.5 size-5 shrink-0 text-rose-700 dark:text-rose-200" aria-hidden="true" />
                    <div>
                      <h2 id="education-safety-title" className="text-lg font-bold text-rose-950 dark:text-rose-100">
                        需要盡快處理的情況
                      </h2>
                      <ul className="mt-3 space-y-3 text-sm leading-6 text-rose-950 dark:text-rose-100">
                        {safetyItems.map((item) => (
                          <li key={item.id}>
                            <span className="font-semibold">{item.label}：</span>
                            {item.safety}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </section>
              ) : null}
            </>
          ) : (
            <TopicView
              key={activeTopic!.id}
              educationModule={activeTopic!.educationModule!}
              group={
                sortedGroups.find((group) => group.id === activeTopic!.groupId)
                ?? sortedGroups[0]
              }
              sources={sources}
            />
          )}

          <TopicFooter
            previous={previousTopic}
            next={nextTopic}
            position={showingSummary ? 0 : activeIndex + 1}
            total={topics.length}
            understandingCheck={
              showingSummary || !activeTopic?.educationModule
                ? null
                : getModuleUnderstandingCheck(activeTopic.educationModule)
            }
            onSelect={selectTopic}
          />
        </div>
      </div>

      <footer className="mt-8 border-t pt-4 text-xs leading-5 text-muted-foreground print:hidden">
        這是研究展示用衛教，不取代診斷、個人治療目標或緊急醫療。
      </footer>
    </main>
  )
}
