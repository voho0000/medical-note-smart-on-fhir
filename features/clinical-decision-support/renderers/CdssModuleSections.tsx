"use client"

import { useId, type ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/src/shared/utils/cn.utils'
import type { CdssRecommendation } from '../types'
import { statusLabel, statusStyle, StatusIcon } from './status-presentation'
import { diagnosisContextOf, groupCdssSections, isOverviewModule, type CdssSectionId } from './cdss-sections'
import styles from './cdss-poster.module.css'

export interface CdssModuleSectionsProps {
  recommendations: readonly CdssRecommendation[]
  isEnglish: boolean
  renderDetail: (item: CdssRecommendation) => ReactNode
  sectionContent?: Partial<Record<CdssSectionId, ReactNode>>
  sectionFooter?: Partial<Record<CdssSectionId, ReactNode>>
  sectionSummary?: Partial<Record<CdssSectionId, string>>
  decisionLabel?: (item: CdssRecommendation) => string | undefined
  renderDecision?: (item: CdssRecommendation) => ReactNode
  followUp?: boolean
  diagnosisReview?: ReactNode
  diagnosisModeControl?: ReactNode
}

/** One module, one details element. Opening a peer never closes this one. */
export function CdssModuleSections({ recommendations, isEnglish, renderDetail, sectionContent, sectionFooter, sectionSummary, decisionLabel, renderDecision, followUp, diagnosisReview, diagnosisModeControl }: CdssModuleSectionsProps) {
  const instanceId = useId()
  const context = recommendations.map(diagnosisContextOf).find(Boolean)
  const diagnosisTitle = (followUp ?? context?.mode === 'follow-up')
    ? (isEnglish ? 'Condition follow-up' : '病況追蹤')
    : context?.mode === 'reassessment' ? (isEnglish ? 'Diagnostic reassessment' : '診斷重新評估')
      : (isEnglish ? 'Diagnosis' : '診斷評估')
  const moduleRow = (item: CdssRecommendation) => {
    const name = item.moduleName ?? item.title
    const safety = item.domain === 'safety' && item.priority === 'high' && item.status !== 'no-action'
    const decision = decisionLabel?.(item)
    return (
      <details key={item.id} open={diagnosisModeControl && !followUp && item.domain === 'diagnosis' ? true : undefined} id={`cdss-hf-action-${item.id}`} className="group/module border-t border-border" data-testid={`cdss-section-module-${item.id}`}>
        <summary className={cn(styles.moduleSummary, 'min-h-11 cursor-pointer text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset', safety && 'bg-destructive/5')}>
          <span className="inline-flex max-w-full flex-wrap items-center gap-2 align-middle">
            {safety ? <span className="font-semibold text-destructive">{isEnglish ? 'Priority safety review' : '優先安全處理'}</span> : null}
            <Badge className={cn('text-xs', statusStyle[item.status])}><StatusIcon status={item.status} />{statusLabel(item.status, isEnglish)}</Badge>
            <span className="font-semibold">{name}</span>
          </span>
          <span data-cdss-action={item.status !== 'no-action' && !isOverviewModule(item) ? '' : undefined} className="mt-2 block break-words font-medium text-foreground">{item.status === 'no-action' || isOverviewModule(item) ? item.title : item.nextActions[0] ?? item.title}</span>
          {decision ? <span className="mt-1 block text-xs text-muted-foreground">{isEnglish ? 'Recorded decision: ' : '已記錄處置：'}{decision}</span> : null}
        </summary>
        <div className={cn(styles.detail, 'space-y-3 border-t border-border')} data-testid={`cdss-section-detail-${item.id}`}>
          {renderDecision?.(item)}
          {renderDetail(item)}
        </div>
      </details>
    )
  }
  return (
    <div className={styles.poster} data-testid="cdss-three-sections">
      {groupCdssSections(recommendations).map((section, index) => {
        const archived = followUp && section.id === 'diagnosis' ? section.modules.filter(item => item.id.startsWith('heart-failure-') && item.id !== 'heart-failure-monitoring') : []
        const visible = section.modules.filter(item => !archived.includes(item))
        const keepDiagnosisOpen = section.id === 'diagnosis' && diagnosisModeControl && !followUp
        const active = visible.filter(item => keepDiagnosisOpen || (item.status !== 'no-action' && !isOverviewModule(item)))
        const other = visible.filter(item => !active.includes(item))
        const pending = active.filter(item => item.status !== 'no-action' && !isOverviewModule(item))
        const title = section.id === 'diagnosis' ? diagnosisTitle : isEnglish ? section.en : section.zh
        return (
          <section key={section.id} aria-labelledby={`${instanceId}-${section.id}`} className={styles.section} data-section={section.id} data-testid={`cdss-section-${section.id}`}>
            <details className={styles.sectionDisclosure} data-testid={`cdss-section-disclosure-${section.id}`}>
            <summary className={cn(styles.heading, 'min-h-11 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset')}>
              <span className={styles.number} aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
              <div className={styles.title}>
                <h3 id={`${instanceId}-${section.id}`}>{title}{!isEnglish ? <span className={styles.english}>{section.id === 'diagnosis' && followUp ? 'Follow-up' : section.en}</span> : null}</h3>
                <span className={styles.meta}>{sectionSummary?.[section.id] ?? (pending.length ? (isEnglish ? `${pending.length} modules to review` : `${pending.length} 個待處理模組`) : section.modules.length ? (isEnglish ? 'No pending module actions' : '目前無模組待辦') : (isEnglish ? 'Not evaluated' : '尚未評估'))}</span>
                <span className={cn(styles.meta, styles.disclosureClosed)}>{isEnglish ? 'Expand details' : '點擊展開'}</span>
                <span className={cn(styles.meta, styles.disclosureOpen)}>{isEnglish ? 'Collapse details' : '點擊收合'}</span>
                {pending.length ? <span className={styles.disclosureClosed}>
                  {pending.map(item => <span key={item.id} data-cdss-action="" className="mt-2 block break-words text-sm">
                    {item.domain === 'safety' && item.priority === 'high' ? (isEnglish ? 'Priority safety review: ' : '優先安全處理：') : ''}
                    {item.nextActions[0] ?? item.title}
                  </span>)}
                </span> : null}
              </div>
            </summary>
            {section.id === 'diagnosis' && diagnosisModeControl ? <div className="px-4 pb-3">{diagnosisModeControl}</div> : null}
            {section.id === 'diagnosis' && context ? <p className={styles.intro} data-testid="cdss-diagnosis-context">{context.basis}</p> : null}
            {sectionContent?.[section.id]}
            {followUp && section.id === 'diagnosis' && !diagnosisModeControl ? <details key="confirmed-diagnosis" className="border-t border-border" data-testid="cdss-diagnosis-review">
              <summary className="min-h-11 cursor-pointer px-4 py-3 text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring">{isEnglish ? 'Diagnosis evidence and reassessment (optional)' : '診斷依據與重新評估（需要時開啟）'}</summary>
              {diagnosisReview}
              {archived.map(moduleRow)}
            </details> : null}
            {active.map(moduleRow)}
            {other.length ? <details className="border-t border-border" data-testid={`cdss-section-other-${section.id}`}><summary className="min-h-11 cursor-pointer px-3 py-3 text-xs text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{isEnglish ? 'Other modules: ' : '其他模組：'}{other.map(item => item.moduleName ?? item.title).join('、')}</summary>{other.map(moduleRow)}</details> : null}
            {section.modules.length === 0 && !sectionContent?.[section.id] ? <p className="px-3 pb-3 text-sm text-muted-foreground">{section.id === 'prognosis' ? (isEnglish ? 'This care pack does not currently provide an outcome-risk estimate.' : '本照護模組目前未提供預後風險估計。') : (isEnglish ? 'No module result is available for this section.' : '本區目前沒有可用的模組判讀。')}</p> : null}
            {sectionFooter?.[section.id]}
            </details>
          </section>
        )
      })}
    </div>
  )
}
