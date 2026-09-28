"use client"

import type { VisitPlanModel } from './visit-decisions'
import { checkIntervalSuffix, returnVisitLabel, withinDaysLabel } from './visit-decisions'

/**
 * 計畫: every decision recorded today that asked for a response check, the
 * earliest first, and the return interval that earliest check implies. The
 * checks are the pack's words; the host lists and counts them.
 */
export function VisitPlan({ plan, isEnglish }: { plan: VisitPlanModel; isEnglish: boolean }) {
  return (
    <div className="space-y-1.5 border-t border-border pt-2" data-testid="cdss-visit-plan">
      <h5 className="text-xs font-semibold text-foreground">{isEnglish ? 'Plan' : '計畫'}</h5>
      {plan.withinDays !== undefined ? (
        <p className="text-sm font-semibold text-foreground" data-testid="cdss-visit-plan-return">
          {returnVisitLabel(plan.withinDays, isEnglish)}
        </p>
      ) : null}
      {plan.notes.length ? (
        <ul className="space-y-0.5 text-xs leading-relaxed text-foreground" data-testid="cdss-visit-plan-notes">
          {plan.notes.map((note) => (
            <li key={note.text}>
              {note.text}
              {typeof note.withinDays === 'number' ? (
                <span className="text-muted-foreground">{isEnglish ? ', ' : '，'}{withinDaysLabel(note.withinDays, isEnglish)}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {plan.items.length === 0 ? (
        <p className="text-xs leading-relaxed text-muted-foreground" data-testid="cdss-visit-plan-empty">
          {isEnglish
            ? 'No decision recorded today asks for a follow-up check yet.'
            : '今天還沒有需要回應檢查的決定。'}
        </p>
      ) : (
        <>
          <ul className="space-y-1 text-xs leading-relaxed">
            {plan.items.map((item) => (
              <li key={item.key} data-dp={item.point.dp} data-plan-item="">
                <span className="font-mono text-muted-foreground">{item.point.dp}</span>{' '}
                <span className="font-medium text-foreground">{item.actionLabel}</span>
                <span className="text-muted-foreground">{isEnglish ? ' — ' : '：'}</span>
                <span className="text-foreground">{item.check.text}</span>
                <span className="text-muted-foreground">
                  {checkIntervalSuffix(item.check.withinDays, isEnglish)}
                </span>
                {item.reopenWhen ? (
                  <span className="block text-muted-foreground">
                    {isEnglish ? 'Reopen when: ' : '重新評估：'}
                    {item.reopenWhen}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
