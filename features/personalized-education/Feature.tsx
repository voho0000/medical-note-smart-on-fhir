"use client"

import { useMemo, useState } from 'react'
import {
  Check,
  ChevronDown,
  ExternalLink,
  GraduationCap,
  Info,
} from 'lucide-react'
import type {
  EducationActionChoice,
  EducationPlan,
  EducationSection,
  EducationSource,
} from './types'

export interface PersonalizedEducationFeatureProps {
  plan: EducationPlan | null
  audience?: 'medical' | 'patient'
}

function SourceLinks({
  sourceIds,
  sources,
}: {
  sourceIds: string[]
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

function JourneySection({
  index,
  section,
  sources,
}: {
  index: number
  section: EducationSection
  sources: Record<string, EducationSource>
}) {
  const actionTone = section.tone === 'attention'
    ? 'border-amber-300/70 bg-amber-50/60 dark:border-amber-800/70 dark:bg-amber-950/20'
    : 'border-border bg-muted/35'

  return (
    <article
      id={`education-${section.id}`}
      className="scroll-mt-4 border-t py-6 first:border-t-0 first:pt-2"
    >
      <div className="flex gap-3 sm:gap-4">
        <div
          className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border bg-background text-sm font-semibold text-primary"
          aria-hidden="true"
        >
          {index + 1}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold tracking-wide text-primary">
            {section.eyebrow}
          </p>
          <h2 className="mt-1 text-lg font-semibold leading-snug text-foreground sm:text-xl">
            {section.title}
          </h2>
          <p className="mt-2 text-base font-medium leading-7 text-foreground">
            {section.summary}
          </p>

          <div className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">
            {section.explanation.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>

          <div className={`mt-4 border px-4 py-3 ${actionTone}`}>
            <p className="text-sm font-semibold text-foreground">
              {section.actionTitle}
            </p>
            <p className="mt-1 text-sm leading-6 text-foreground/85">
              {section.action}
            </p>
          </div>

          <SourceLinks sourceIds={section.sourceIds} sources={sources} />
        </div>
      </div>
    </article>
  )
}

function ActionChoice({
  choice,
  selected,
  onSelect,
}: {
  choice: EducationActionChoice
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`flex min-h-14 w-full items-start gap-3 border px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        selected
          ? 'border-primary bg-primary/7'
          : 'border-border bg-background hover:bg-muted/50'
      }`}
    >
      <span
        className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border ${
          selected
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-muted-foreground/50'
        }`}
        aria-hidden="true"
      >
        {selected ? <Check className="size-3.5" /> : null}
      </span>
      <span>
        <span className="block text-sm font-semibold text-foreground">
          {choice.label}
        </span>
        <span className="mt-1 block text-xs leading-5 text-muted-foreground">
          {choice.detail}
        </span>
      </span>
    </button>
  )
}

function LearningLibrary({ plan }: { plan: EducationPlan }) {
  const lessonCount = useMemo(
    () => plan.lessonGroups.reduce(
      (total, group) => total + group.lessons.length,
      0,
    ),
    [plan.lessonGroups],
  )

  return (
    <section className="border-t pt-7" aria-labelledby="education-library-title">
      <div className="flex items-start gap-3">
        <GraduationCap
          className="mt-0.5 size-5 shrink-0 text-primary"
          aria-hidden="true"
        />
        <div>
          <h2
            id="education-library-title"
            className="text-lg font-semibold text-foreground"
          >
            想再多了解：延伸課程
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            共 {lessonCount} 個短課程，不用一次看完。從現在最困擾的主題開始即可。
          </p>
        </div>
      </div>

      <div className="mt-4 divide-y border-y">
        {plan.lessonGroups.map((group) => (
          <details key={group.id} className="group">
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-1 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <span>
                <span className="block text-sm font-semibold text-foreground">
                  {group.title}
                </span>
                <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                  {group.description}・{group.lessons.length} 課
                </span>
              </span>
              <ChevronDown
                className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                aria-hidden="true"
              />
            </summary>

            <div className="mb-4 ml-2 border-l pl-4 sm:ml-4 sm:pl-5">
              {group.lessons.map((lesson) => (
                <details
                  key={lesson.id}
                  className="group/lesson border-b last:border-b-0"
                >
                  <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-3 pr-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <span className="text-sm font-medium text-foreground">
                      {lesson.title}
                    </span>
                    <ChevronDown
                      className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open/lesson:rotate-180"
                      aria-hidden="true"
                    />
                  </summary>
                  <div className="pb-4 pr-2 text-sm leading-6">
                    <p className="font-medium text-foreground">
                      {lesson.takeaway}
                    </p>
                    <p className="mt-2 text-muted-foreground">{lesson.detail}</p>
                    <p className="mt-3 border-l-2 border-primary/50 pl-3 text-foreground">
                      <span className="font-semibold">可以這樣做：</span>
                      {lesson.action}
                    </p>
                    <SourceLinks
                      sourceIds={lesson.sourceIds}
                      sources={plan.sources}
                    />
                  </div>
                </details>
              ))}
            </div>
          </details>
        ))}
      </div>
    </section>
  )
}

function NoEligiblePack() {
  return (
    <div className="mx-auto w-full max-w-3xl px-3 py-8 sm:px-5">
      <div className="border border-amber-300/70 bg-amber-50/60 px-4 py-4 dark:border-amber-800/70 dark:bg-amber-950/20">
        <h1 className="text-lg font-semibold text-foreground">
          目前沒有套用糖尿病衛教
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          目前載入的受治理診斷代碼沒有第二型糖尿病紀錄。本功能不會只憑糖化血色素、藥名或病歷文字推測診斷。
        </p>
      </div>
    </div>
  )
}

export default function PersonalizedEducationFeature({
  plan,
  audience = 'patient',
}: PersonalizedEducationFeatureProps) {
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null)

  if (!plan) return <NoEligiblePack />

  const selectedAction = plan.actionChoices.find(
    (choice) => choice.id === selectedActionId,
  )

  return (
    <main className="mx-auto w-full max-w-4xl px-3 pb-10 sm:px-5">
      <header className="border-b pb-5 pt-2">
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
          <span className="rounded-full border px-2.5 py-1 text-primary">
            第二型糖尿病
          </span>
          <span>依目前病歷自動整理</span>
          {audience === 'medical' ? (
            <span className="rounded-full bg-muted px-2.5 py-1">
              民眾閱讀版預覽
            </span>
          ) : null}
        </div>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {plan.title}
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
          {plan.intro}
        </p>
      </header>

      <section className="py-5" aria-labelledby="education-data-title">
        <div className="flex items-center gap-2">
          <Info className="size-4 text-primary" aria-hidden="true" />
          <h2
            id="education-data-title"
            className="text-sm font-semibold text-foreground"
          >
            這次實際用到的病歷資料
          </h2>
        </div>
        <div className="mt-3 divide-y border-y">
          {plan.facts.map((fact) => (
            <div
              key={fact.id}
              className="grid gap-1 py-3 2xl:grid-cols-[10rem_minmax(0,1fr)_auto] 2xl:items-baseline 2xl:gap-4"
            >
              <span className="text-xs font-medium text-muted-foreground">
                {fact.label}
              </span>
              <span className="text-sm font-semibold text-foreground">
                {fact.value}
              </span>
              <span
                className={`text-xs ${
                  fact.tone === 'attention'
                    ? 'font-medium text-amber-700 dark:text-amber-300'
                    : 'text-muted-foreground'
                }`}
              >
                {fact.detail}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          沒有使用姓名、病歷號、聯絡資料或完整病歷文字；這些衛教在本機依規則整理，不會把資料送到雲端 AI。
        </p>
      </section>

      <nav
        aria-label="今天的衛教閱讀路線"
        className="border-y bg-muted/35 px-3 py-2"
      >
        <p className="text-xs font-semibold text-muted-foreground">
          今天的閱讀路線
        </p>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
          {plan.sections.map((section, index) => (
            <a
              key={section.id}
              href={`#education-${section.id}`}
              className="inline-flex min-h-11 items-center text-sm font-medium text-foreground underline-offset-4 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {index + 1}. {section.eyebrow
                .replace('先看', '')
                .replace('再看', '')
                .replace('最後看', '')}
            </a>
          ))}
        </div>
      </nav>

      <section className="py-5" aria-label="今天的個人化衛教">
        {plan.sections.map((section, index) => (
          <JourneySection
            key={section.id}
            index={index}
            section={section}
            sources={plan.sources}
          />
        ))}
      </section>

      <section className="border-t pt-7" aria-labelledby="today-action-title">
        <h2
          id="today-action-title"
          className="text-lg font-semibold text-foreground"
        >
          今天只選一件要做的事
        </h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          不必一次完成全部。選一項，讓它成為你看完後真正帶走的行動。
        </p>
        <div className="mt-4 grid gap-2 xl:grid-cols-3">
          {plan.actionChoices.map((choice) => (
            <ActionChoice
              key={choice.id}
              choice={choice}
              selected={selectedActionId === choice.id}
              onSelect={() => setSelectedActionId(choice.id)}
            />
          ))}
        </div>
        <div
          className="mt-3 min-h-11 border bg-muted/35 px-4 py-3 text-sm"
          aria-live="polite"
        >
          {selectedAction ? (
            <>
              <span className="font-semibold text-foreground">你選的是：</span>
              <span className="text-foreground"> {selectedAction.label}</span>
              <span className="mt-1 block text-muted-foreground">
                {selectedAction.detail}
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">
              還沒決定也沒關係；看完延伸課程後再回來選。
            </span>
          )}
        </div>
      </section>

      <LearningLibrary plan={plan} />

      <footer className="mt-8 border-t pt-4 text-xs leading-5 text-muted-foreground">
        這是研究展示用衛教，不取代診斷、個人治療目標或緊急醫療。資料不足時會明確保留不確定性。
      </footer>
    </main>
  )
}
