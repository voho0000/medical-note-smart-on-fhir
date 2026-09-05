// Renders a free-text hospital report (endoscopy, imaging, ECG, pathology) with
// an indented hierarchy instead of one wall of text. Parsing is delegated to the
// pure `formatReportText` helper; this component only maps the parsed lines to
// layout (heading vs item, indentation by level, marker column).
import { cn } from "@/src/shared/utils/cn.utils"
import { formatReportText } from "@/src/shared/utils/report-text-format"

interface FormattedReportTextProps {
  text: string
  className?: string
}

// Indentation per nesting level. Headings (level 0 + heading) stay flush-left;
// items/sub-items step in. Kept modest so deeply-nested reports don't run off
// the right edge in the narrow card/dialog widths.
const INDENT_BY_LEVEL: Record<number, string> = {
  0: '',
  1: 'pl-3',
  2: 'pl-7',
}

export function FormattedReportText({ text, className }: FormattedReportTextProps) {
  const lines = formatReportText(text)
  if (lines.length === 0) return null

  return (
    <div className={cn('space-y-1', className)}>
      {lines.map((line, i) => {
        if (line.separator) {
          return <div key={i} aria-hidden="true" className="my-2 border-t border-border" />
        }
        if (line.heading) {
          // first:mt-0 so the very first heading doesn't add a leading gap.
          return (
            <div key={i} className="mt-2 flex gap-1.5 first:mt-0">
              {line.marker && (
                <span className="shrink-0 text-muted-foreground" aria-hidden="true">{line.marker}</span>
              )}
              <p className="font-semibold text-foreground">{line.text}</p>
            </div>
          )
        }
        if (line.tableCells) {
          return (
            <div key={i} className={cn('flex min-w-0 gap-1.5', INDENT_BY_LEVEL[line.level])}>
              {line.marker && (
                <span className="shrink-0 tabular-nums text-muted-foreground">{line.marker}</span>
              )}
              <div className="min-w-0 flex-1 overflow-x-auto rounded-md border border-border">
                <table className="w-full min-w-max border-collapse text-sm tabular-nums">
                  <tbody>
                    <tr className="divide-x divide-border">
                      {line.tableCells.map((cell, cellIndex) => cellIndex === 0 ? (
                        <th key={cellIndex} scope="row" className="bg-muted/50 px-2.5 py-1.5 text-left font-semibold text-foreground">
                          {cell}
                        </th>
                      ) : (
                        <td key={cellIndex} className="px-2.5 py-1.5 text-center text-foreground">
                          {cell}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )
        }
        return (
          <div key={i} className={cn('flex gap-1.5', INDENT_BY_LEVEL[line.level])}>
            {line.marker && (
              <span className="shrink-0 tabular-nums text-muted-foreground">{line.marker}</span>
            )}
            <span className={cn(
              'min-w-0 flex-1 break-words',
              line.monospace && 'overflow-x-auto whitespace-pre font-mono tabular-nums',
            )}>{line.text}</span>
          </div>
        )
      })}
    </div>
  )
}
