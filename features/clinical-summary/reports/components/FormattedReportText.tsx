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
        if (line.heading) {
          // first:mt-0 so the very first heading doesn't add a leading gap.
          return (
            <p key={i} className="mt-2 font-semibold text-foreground first:mt-0">
              {line.text}
            </p>
          )
        }
        return (
          <div key={i} className={cn('flex gap-1.5', INDENT_BY_LEVEL[line.level])}>
            {line.marker && (
              <span className="shrink-0 tabular-nums text-muted-foreground">{line.marker}</span>
            )}
            <span className="min-w-0 flex-1 break-words">{line.text}</span>
          </div>
        )
      })}
    </div>
  )
}
