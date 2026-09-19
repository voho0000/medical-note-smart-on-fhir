"use client"

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { CdssModuleSections, type CdssModuleSectionsProps } from './CdssModuleSections'
import { NhiLipidCoverageSummary } from './NhiLipidCoverageSummary'

/** A view selection, not a diagnosis assertion or a change to clinical facts.
 * The host keys this component by patient and pack to isolate the selection. */
export function LipidModuleSections({ locale, patientId, ...props }: CdssModuleSectionsProps & { locale: string; patientId?: string }) {
  const [followUp, setFollowUp] = useState(true)
  const en = props.isEnglish
  const summary = props.recommendations.find(item => item.id === 'dyslipidemia-risk-and-target')
  return <CdssModuleSections {...props}
    followUp={followUp}
    diagnosisModeControl={<div role="group" aria-label={en ? 'Diagnosis or follow-up' : '診斷或追蹤'} className="mt-3 flex flex-wrap gap-1">
      <Button type="button" variant={!followUp ? 'default' : 'outline'} aria-pressed={!followUp} className="min-h-11" onClick={() => setFollowUp(false)}>{en ? 'Diagnosis' : '診斷'}</Button>
      <Button type="button" variant={followUp ? 'default' : 'outline'} aria-pressed={followUp} className="min-h-11" onClick={() => setFollowUp(true)}>{en ? 'Follow-up' : '追蹤'}</Button>
    </div>}
    sectionSummary={{ ...props.sectionSummary, diagnosis: followUp ? (en ? 'Latest lipids · Treatment goals · Goal assessment' : '最新血脂・治療標的・達標判讀') : (en ? 'Verify diagnoses and risk factors' : '逐項確認相關診斷與危險因子') }}
    sectionContent={{ ...props.sectionContent, diagnosis: summary
      ? <NhiLipidCoverageSummary recommendation={summary} locale={locale} patientId={patientId} presentation={followUp ? 'follow-up' : 'diagnosis'} />
      : <p className="px-3 py-4 text-sm" data-cdss-action="">{en ? 'Lipid assessment is unavailable; attainment cannot be assessed.' : '血脂評估資料尚未提供，目前無法判定是否達標。'}</p> }}
  />
}
