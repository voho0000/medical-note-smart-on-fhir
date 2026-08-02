"use client"

import { useMemo, useState } from 'react'
import {
  Activity,
  BookOpen,
  Check,
  ChevronDown,
  ClipboardList,
  ExternalLink,
  GraduationCap,
  HeartHandshake,
  HeartPulse,
  Pill,
  Printer,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from 'lucide-react'
import type {
  EducationPlan,
  EducationSource,
} from './types'
import {
  buildEducationCareSummary,
  getEducationContentSchema,
  getEducationGroupStyle,
  mergeEducationSources,
  resolveEducationModules,
  selectEducationHandoutModules,
  type EducationCareSummary,
  type EducationModuleGroupDefinition,
  type EducationContentSchema,
  type ResolvedEducationModule,
} from './presentation-schema'

export interface PersonalizedEducationFeatureProps {
  plan: EducationPlan | null
  audience?: 'medical' | 'patient'
  age?: number | null
}

type EducationPrintFontSize = 'standard' | 'large'
type EducationReadingMode = 'summary' | 'detailed'

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
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 px-1 py-2 font-medium hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
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
              className="inline-flex min-h-11 items-center gap-1.5 py-2 text-primary underline-offset-4 hover:underline"
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

function getGroupIcon(groupId: EducationModuleGroupDefinition['id']) {
  switch (groupId) {
    case 'understanding':
      return BookOpen
    case 'daily-life':
      return Activity
    case 'monitoring':
      return HeartPulse
    case 'medication':
      return Pill
    case 'urgent-care':
      return TriangleAlert
    case 'prevention':
      return ShieldCheck
    case 'wellbeing':
      return HeartHandshake
    case 'life-stages':
      return RefreshCw
  }
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
      className="border-b border-border pb-7 print:hidden"
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

function PersonalizedHandoutSection({
  educationModule,
  group,
  index,
  sources,
  readingMode,
}: {
  educationModule: ResolvedEducationModule
  group: EducationModuleGroupDefinition
  index: number
  sources: Record<string, EducationSource>
  readingMode: EducationReadingMode
}) {
  const { definition, section, facts } = educationModule
  const isDetailed = readingMode === 'detailed'
  const whyItMatters = getModuleWhyItMatters(educationModule)
  const howToDoIt = getModuleHowToDoIt(educationModule)
  const understandingCheck = getModuleUnderstandingCheck(educationModule)
  const moduleSourceIds = Array.from(new Set([
    ...definition.library.sourceIds,
    ...(section?.sourceIds ?? []),
  ]))
  const medicationFact = facts.find((fact) => (
    fact.detail.includes('處方紀錄') || fact.detail.includes('用藥陳述')
  ))
  // The reader's own numbers are the reason this page is personal, so the
  // summary view leads with them instead of burying them in the audit details.
  const patientFacts = facts.filter((fact) => fact.id !== 'diagnosis')
  const moduleTone = section?.tone === 'attention'
    ? {
        label: '這次先留意',
        badge: 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200',
        accent: 'border-amber-400 dark:border-amber-700',
        action: 'border-amber-200 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/20',
      }
    : definition.groupId === 'medication'
      ? {
          label: medicationFact?.detail.includes('處方紀錄')
            ? '有處方紀錄'
            : medicationFact?.detail.includes('用藥陳述')
              ? '有用藥紀錄'
              : '用藥提醒',
          badge: 'border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200',
          accent: 'border-sky-400 dark:border-sky-700',
          action: 'border-sky-200 bg-sky-50/70 dark:border-sky-900 dark:bg-sky-950/20',
        }
      : definition.groupId === 'daily-life'
        ? {
            label: '可以考慮',
            badge: 'border-orange-300 bg-orange-50 text-orange-800 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-200',
            accent: 'border-orange-400 dark:border-orange-700',
            action: 'border-orange-200 bg-orange-50/70 dark:border-orange-900 dark:bg-orange-950/20',
          }
      : {
          label: '值得了解',
          badge: 'border-primary/25 bg-primary/5 text-primary',
          accent: 'border-primary/50',
          action: 'border-primary/20 bg-primary/[0.045]',
        }

  return (
    <article
      id={`education-${definition.id}`}
      className="scroll-mt-4 border-t border-border py-7 first:border-t-0 sm:py-9"
      data-testid={`education-module-${definition.id}`}
      data-group-id={group.id}
      data-reading-mode={readingMode}
    >
      <div className={`border-l-2 pl-4 sm:pl-5 ${moduleTone.accent}`}>
        <div className="flex items-start gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-foreground text-sm font-bold text-background" aria-hidden="true">
            {index + 1}
          </span>
          <div className="min-w-0 flex-1">
            <p className={`text-xs font-semibold ${getEducationGroupStyle(group.id).toneClass}`}>{group.label}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h3 className="text-xl font-bold leading-snug text-foreground sm:text-2xl">
                {definition.label}
              </h3>
              <span className={`inline-flex min-h-6 items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${moduleTone.badge}`}>
                {moduleTone.label}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-5 max-w-3xl text-sm leading-7 sm:text-base">
          {isDetailed ? (
            <div data-testid={`education-learning-content-${definition.id}`}>
              <section>
                <h4 className="text-sm font-semibold text-primary">先理解這件事</h4>
                <p className="mt-1 text-lg font-semibold leading-8 text-foreground">
                  {definition.library.takeaway}
                </p>
              </section>

              <section className="mt-5">
                <h4 className="text-sm font-semibold text-foreground">為什麼重要</h4>
                <div className="mt-2 space-y-2 text-muted-foreground">
                  {whyItMatters.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
              </section>

              {section ? (
                <section className="mt-5 border-l-2 border-teal-500 pl-4">
                  <h4 className="text-sm font-semibold text-teal-900 dark:text-teal-200">和你目前資料的關係</h4>
                  <p className="mt-1 text-base font-semibold text-foreground">{section.title}</p>
                  <p className="mt-2 font-medium text-foreground">{section.summary}</p>
                  <div className="mt-2 space-y-2 text-muted-foreground">
                    {section.explanation.map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                  </div>
                </section>
              ) : null}

              <section className={`mt-5 border-l-2 pl-4 ${moduleTone.accent}`}>
                <h4 className="text-sm font-semibold text-foreground">實際可以怎麼做</h4>
                <ul className="mt-2 space-y-2 text-foreground">
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
                  <h4 className="text-sm font-semibold">什麼情況要盡快處理</h4>
                  <p className="mt-1">{definition.library.safety}</p>
                </section>
              ) : null}

              <section className="mt-5 border-t border-dashed border-primary/35 pt-4">
                <h4 className="text-sm font-semibold text-foreground">看完確認一下</h4>
                <p className="mt-1 text-foreground">{understandingCheck}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  可以先用自己的話回答；若說不清楚，再回頭看「先理解」與「實際可以怎麼做」。
                </p>
              </section>
            </div>
          ) : (
            <>
              {patientFacts.length > 0 ? (
                <dl
                  className="mb-5 flex flex-wrap gap-x-8 gap-y-3 border-b border-border pb-4"
                  data-testid={`education-module-figures-${definition.id}`}
                >
                  {patientFacts.map((fact) => (
                    <div key={fact.id}>
                      <dt className="text-xs font-medium text-muted-foreground">{fact.label}</dt>
                      <dd className="mt-0.5 text-xl font-bold leading-tight text-foreground">
                        {fact.value}
                      </dd>
                      <dd className="mt-0.5 text-xs text-muted-foreground">{fact.detail}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              <p className="text-xs font-semibold tracking-wide text-muted-foreground">你的狀況</p>
              <p className="mt-1 text-lg font-semibold leading-7 text-foreground">
                {section?.title}
              </p>
              {section ? (
                <>
                  <p className="mt-4 font-medium text-foreground">{section.summary}</p>
                  <div className="mt-2 space-y-2 text-muted-foreground">
                    {section.explanation.map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                  </div>
                </>
              ) : null}

              <section className={`mt-5 border-l-2 pl-4 ${moduleTone.accent}`}>
                <h4 className="text-sm font-semibold text-foreground">你可以怎麼做</h4>
                <p className="mt-1 text-sm leading-6 text-foreground">
                  {educationModule.recommendation}
                </p>
              </section>
            </>
          )}

          <details
            className="group mt-5 border-t pt-3 text-sm print:hidden"
            data-testid={`education-module-detail-${definition.id}`}
          >
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 py-2 font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden="true" />
              查看這項內容使用的資料、判斷與來源
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
      </div>
    </article>
  )
}

function LearningLibrary({
  schema,
  sources,
}: {
  schema: EducationContentSchema
  sources: Record<string, EducationSource>
}) {
  const groups = useMemo(
    () => [...schema.groups]
      .sort((left, right) => left.order - right.order)
      .map((group) => ({
        ...group,
        modules: schema.modules
          .filter((module) => module.groupId === group.id)
          .sort((left, right) => left.order - right.order),
      })),
    [schema],
  )

  return (
    <details
      className="group border-y border-border bg-background"
      data-testid="education-library"
    >
      <summary className="flex min-h-16 cursor-pointer list-none items-start gap-3 py-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset">
        <GraduationCap
          className="mt-0.5 size-6 shrink-0 text-primary"
          aria-hidden="true"
        />
        <div>
          <h2
            id="education-library-title"
            className="text-lg font-semibold text-foreground"
          >
            全部糖尿病衛教
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            八個主題的位置固定，不用一次看完；依目前需要選擇即可。
          </p>
        </div>
        <ChevronDown
          className="ml-auto mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>

      <div className="mb-5 divide-y divide-border">
        {groups.map((group) => {
          const GroupIcon = getGroupIcon(group.id)
          return (
          <details
            key={group.id}
            className="group/library-group"
            data-testid={`education-library-group-${group.id}`}
          >
            <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <span className="flex items-start gap-3">
                <span className={`mt-0.5 flex size-9 shrink-0 items-center justify-center ${getEducationGroupStyle(group.id).toneClass}`}>
                  <GroupIcon className="size-4.5" aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-base font-semibold text-foreground">
                    {group.label}
                  </span>
                  <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                    {group.description}
                  </span>
                </span>
              </span>
              <ChevronDown
                className="size-4 shrink-0 text-muted-foreground transition-transform group-open/library-group:rotate-180"
                aria-hidden="true"
              />
            </summary>

            <div className="mb-4 ml-12 border-l border-border pl-4">
              {group.modules.map((module) => {
                const availabilityLabel = module.availability === 'core'
                  ? '基礎主題'
                  : module.availability === 'record-driven'
                    ? '有相關資料時提供個人化說明'
                    : '特定情境適用'
                return (
                <details
                  key={module.id}
                  className="group/library-module border-b border-border last:border-b-0"
                  data-testid={`education-library-module-${module.id}`}
                >
                  <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <span>
                      <span className="block text-sm font-semibold text-foreground">
                        {module.label}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {availabilityLabel}
                      </span>
                    </span>
                    <ChevronDown
                      className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open/library-module:rotate-180"
                      aria-hidden="true"
                    />
                  </summary>
                  <div className="border-t px-4 py-4 text-sm leading-6">
                    <p className="font-medium text-foreground">
                      {module.library.takeaway}
                    </p>
                    <p className="mt-2 text-muted-foreground">{module.library.detail}</p>
                    <p className="mt-3 border-l-2 border-primary/50 pl-3 text-foreground">
                      <span className="font-semibold">可以這樣做：</span>
                      {module.library.action}
                    </p>
                    {module.library.safety ? (
                      <p className="mt-3 border-l-2 border-rose-500 pl-3 text-rose-900 dark:text-rose-200">
                        <span className="font-semibold">需要盡快處理：</span>
                        {module.library.safety}
                      </p>
                    ) : null}
                    <SourceLinks
                      sourceIds={module.library.sourceIds}
                      sources={sources}
                    />
                  </div>
                </details>
              )})}
            </div>
          </details>
        )})}
      </div>
    </details>
  )
}

function NoEligiblePack() {
  return (
    <div className="mx-auto w-full max-w-3xl px-3 py-8 sm:px-5">
      <div className="rounded-2xl border border-amber-300/70 bg-amber-50/60 px-5 py-5 dark:border-amber-800/70 dark:bg-amber-950/20">
        <h1 className="text-xl font-semibold text-foreground">
          目前沒有適合你的衛教內容
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          目前的資料尚未符合已提供的衛教主題，因此這次不顯示個人化內容。
        </p>
      </div>
    </div>
  )
}

export default function PersonalizedEducationFeature({
  plan,
  audience = 'patient',
  age,
}: PersonalizedEducationFeatureProps) {
  const [printFontSize, setPrintFontSize] = useState<EducationPrintFontSize>('standard')
  const [readingMode, setReadingMode] = useState<EducationReadingMode>('summary')
  if (!plan) return <NoEligiblePack />

  const schema = getEducationContentSchema(plan.packId)
  const resolvedModules = resolveEducationModules(plan, schema)
  const featuredModules = resolvedModules.filter((educationModule) => (
    educationModule.definition.showOnMainWhenAvailable && educationModule.available
  ))
  const handoutModules = selectEducationHandoutModules(resolvedModules, { age })
  const displayedModules = readingMode === 'detailed' ? handoutModules : featuredModules
  const sources = mergeEducationSources(plan, schema)
  const careSummary = buildEducationCareSummary(plan, resolvedModules)
  const safetyItems = featuredModules
    .map((educationModule) => ({
      id: educationModule.definition.id,
      label: educationModule.definition.label,
      safety: educationModule.definition.library.safety,
    }))
    .filter((item): item is typeof item & { safety: string } => Boolean(item.safety))

  return (
    <main
      className="@container mx-auto w-full max-w-[72rem] space-y-8 px-4 pb-12 sm:px-6 print:max-w-none print:px-0"
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

          body.printing-education-handout [data-education-compact-print] [data-education-print-section] {
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
      <header className="relative overflow-hidden border-b border-border pb-7 print:hidden">
        <Sparkles className="absolute -right-4 -top-5 size-28 text-primary/[0.07]" aria-hidden="true" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
              <span className="rounded-full bg-primary px-3 py-1.5 text-primary-foreground">
                {schema.diseaseLabel}
              </span>
              {audience === 'medical' ? (
                <span className="rounded-full border bg-background/80 px-3 py-1.5 text-muted-foreground">
                  民眾閱讀版預覽
                </span>
              ) : null}
            </div>
            <h1 className="mt-5 max-w-3xl text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              {schema.pageTitle}
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
              {schema.intro}
            </p>
          </div>
          <div className="flex flex-wrap items-end justify-end gap-3 print:hidden">
            <fieldset>
              <legend className="mb-1 text-xs font-medium text-muted-foreground">列印字體</legend>
              <div className="inline-flex border-b border-border">
                {([
                  { value: 'standard', label: '標準字' },
                  { value: 'large', label: '大字版' },
                ] as const).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={printFontSize === option.value}
                    onClick={() => setPrintFontSize(option.value)}
                    className={`min-h-9 border-b-2 px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      printFontSize === option.value
                        ? 'border-primary text-primary'
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
              className="inline-flex min-h-11 items-center gap-2 border-b-2 border-foreground px-2 py-2 text-sm font-semibold text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Printer className="size-4" aria-hidden="true" />
              列印{readingMode === 'detailed' ? '詳細解說版' : '重點版'}
            </button>
            <p className="basis-full text-right text-xs leading-5 text-muted-foreground">
              若預覽出現網址與日期，請在列印設定取消「頁首及頁尾」。
            </p>
          </div>
        </div>
      </header>

      {readingMode === 'detailed' ? (
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

      <section
        className="border-b border-border pb-4 print:hidden"
        aria-labelledby="education-reading-mode-title"
        data-testid="education-reading-mode"
      >
        <fieldset>
          <legend id="education-reading-mode-title" className="pb-2 text-sm font-semibold text-foreground">
            選擇閱讀方式
          </legend>
          <div className="flex gap-6 border-b border-border">
            {([
              {
                value: 'summary',
                label: '重點版',
                description: '先看這次和你最相關的狀況與下一步。',
              },
              {
                value: 'detailed',
                label: '詳細解說版',
                description: '依主題了解原因、做法、警訊，並確認自己是否看懂。',
              },
            ] as const).map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={readingMode === option.value}
                onClick={() => setReadingMode(option.value)}
                className={`max-w-sm border-b-2 px-1 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  readingMode === option.value
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="font-semibold">{option.label}</span>
                  {readingMode === option.value ? (
                    <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />
                  ) : null}
                </span>
                <span className="mt-1 block text-sm leading-6">{option.description}</span>
              </button>
            ))}
          </div>
        </fieldset>
        <p className="pt-2 text-xs leading-5 text-muted-foreground">
          列印會使用目前選擇的版本；重點版維持兩頁，詳細解說版依適用主題自然分頁。
        </p>
      </section>

      <CareSummary summary={careSummary} />

      <section
        className="print:hidden"
        aria-labelledby="education-modules-title"
        data-testid="education-modules"
        data-reading-mode={readingMode}
      >
        <header className="border-b border-border py-6">
          <p className="text-sm font-semibold text-primary">
            {readingMode === 'detailed' ? '依固定主題順序完整說明' : '依你的資料組成'}
          </p>
          <h2 id="education-modules-title" className="mt-1 text-2xl font-bold text-foreground sm:text-3xl">
            {readingMode === 'detailed' ? '完整理解這些照護主題' : '這次為你整理的衛教'}
          </h2>
          <p className="mt-2 max-w-2xl text-base leading-7 text-muted-foreground">
            {readingMode === 'detailed'
              ? `共 ${displayedModules.length} 個適合目前情況的主題；每一節都會說明原因、做法與需要留意的警訊。`
              : '以下章節只使用目前資料能支持的內容，依固定順序組成這份衛教單。'}
          </p>
        </header>

        <div>
          {displayedModules.map((educationModule, index) => {
            const group = schema.groups.find(
              (candidate) => candidate.id === educationModule.definition.groupId,
            )
            if (!group) return null
            return (
              <PersonalizedHandoutSection
                key={educationModule.definition.id}
                educationModule={educationModule}
                group={group}
                index={index}
                sources={sources}
                readingMode={readingMode}
              />
            )
          })}
        </div>
      </section>

      {safetyItems.length > 0 ? (
        <section
          className="border-y border-rose-300 py-5 dark:border-rose-800 sm:py-7 print:hidden"
          aria-labelledby="education-safety-title"
          data-testid="education-safety-summary"
        >
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center text-rose-700 dark:text-rose-200">
              <TriangleAlert className="size-5" aria-hidden="true" />
            </span>
            <div>
              <h2 id="education-safety-title" className="text-xl font-bold text-rose-950 dark:text-rose-100">
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

      <div className="print:hidden">
        <LearningLibrary schema={schema} sources={sources} />
      </div>

      <footer className="mt-8 border-t pt-4 text-xs leading-5 text-muted-foreground print:hidden">
        這是研究展示用衛教，不取代診斷、個人治療目標或緊急醫療。
      </footer>
    </main>
  )
}
