import * as React from "react"

import { cn } from "@/src/shared/utils/cn.utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "border-input/60 placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-primary/20 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 flex field-sizing-content min-h-20 w-full rounded-lg border bg-background px-3 py-2 text-base shadow-sm transition-all duration-200 outline-none focus-visible:ring-4 focus-visible:shadow-md hover:border-border disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
