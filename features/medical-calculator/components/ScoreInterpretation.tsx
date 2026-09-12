import type { CalcResult } from '../types'

export function ScoreInterpretation({ result, isEnglish }: { result: Pick<CalcResult, 'scoreRanges' | 'notes'>; isEnglish: boolean }) {
  return <>
    {result.scoreRanges ? <section className="mt-3 border-t border-current/15 pt-3" aria-label={isEnglish ? 'Score interpretation' : '分數判讀'}>
      <h4 className="mb-2 text-xs font-semibold">{isEnglish ? 'Score interpretation' : '分數判讀'}</h4>
      <dl className="space-y-2 text-xs leading-relaxed">{result.scoreRanges.map(row => <div key={row.range} className="flex items-baseline gap-4"><dt className="w-14 shrink-0 font-medium tabular-nums">{row.range} {isEnglish ? 'pts' : '分'}</dt><dd className="min-w-0">{isEnglish ? row.meaning.en : row.meaning.zh}</dd></div>)}</dl>
    </section> : null}
    {result.notes ? <div className="pt-1 text-xs leading-relaxed opacity-90">{isEnglish ? result.notes.en : result.notes.zh}</div> : null}
  </>
}
