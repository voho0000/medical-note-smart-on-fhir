"use client"

import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type MouseEventHandler,
  type ReactNode,
} from "react"
import { ChevronsLeft, ChevronsRight } from "lucide-react"

import { cn } from "@/src/shared/utils/cn.utils"
import { useVisualViewport } from "@/src/shared/hooks/layout/use-visual-viewport.hook"

export const ClinicalWorkspaceRoot = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<"div">
>(function ClinicalWorkspaceRoot({ className, style, ...props }, ref) {
  // Keeps the shell inside the keyboard-free area on iOS (see the hook).
  useVisualViewport()
  return (
    <div
      ref={ref}
      data-slot="clinical-workspace"
      className={cn(
        "flex flex-col overflow-hidden bg-background pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]",
        className,
      )}
      style={{
        // Falls back to the old behaviour wherever visualViewport is absent.
        height: "var(--app-viewport-height, 100svh)",
        ...style,
      }}
      {...props}
    />
  )
})

export const ClinicalTabContentFrame = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<"div">
>(function ClinicalTabContentFrame({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      data-slot="clinical-tab-content-frame"
      className={cn("min-w-0 w-full px-3 sm:px-4", className)}
      {...props}
    />
  )
})

export const ClinicalWorkspaceMain = forwardRef<
  HTMLElement,
  ComponentPropsWithoutRef<"main">
>(function ClinicalWorkspaceMain({ className, ...props }, ref) {
  return (
    <main
      ref={ref}
      data-slot="clinical-workspace-main"
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-1 overflow-hidden p-1 sm:p-2 md:flex-row md:gap-0",
        className,
      )}
      {...props}
    />
  )
})

type DesktopPanelState = "split" | "fill" | "collapsed"

interface ClinicalWorkspacePanelProps
  extends ComponentPropsWithoutRef<"section"> {
  mobileActive: boolean
  desktopState: DesktopPanelState
  desktopWidth?: CSSProperties["width"]
}

export const ClinicalWorkspacePanel = forwardRef<
  HTMLElement,
  ClinicalWorkspacePanelProps
>(function ClinicalWorkspacePanel({
  mobileActive,
  desktopState,
  desktopWidth,
  className,
  style,
  ...props
}, ref) {
  return (
    <section
      ref={ref}
      data-slot="clinical-workspace-panel"
      className={cn(
        "min-h-0 min-w-0 w-full flex-1 overflow-x-hidden overflow-y-auto bg-panel md:w-auto md:rounded-lg",
        !mobileActive && "max-md:hidden",
        desktopState === "collapsed" && "md:hidden",
        desktopState === "fill" && "md:flex-1",
        desktopState === "split" && "md:flex-initial",
        className,
      )}
      style={{
        ...style,
        ...(desktopState === "split" && desktopWidth
          ? { width: desktopWidth }
          : {}),
      }}
      {...props}
    />
  )
})

interface ClinicalMobilePanelSwitcherProps {
  activePanel: "left" | "right"
  leftLabel: string
  rightLabel: string
  onChange: (panel: "left" | "right") => void
}

export function ClinicalMobilePanelSwitcher({
  activePanel,
  leftLabel,
  rightLabel,
  onChange,
}: ClinicalMobilePanelSwitcherProps) {
  const buttonClasses =
    "min-h-[44px] flex-1 border-b-2 px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"

  return (
    <nav
      data-slot="clinical-mobile-panel-switcher"
      aria-label={`${leftLabel} / ${rightLabel}`}
      className="flex shrink-0 border-b bg-panel md:hidden"
    >
      <button
        type="button"
        onClick={() => onChange("left")}
        aria-pressed={activePanel === "left"}
        className={cn(
          buttonClasses,
          activePanel === "left"
            ? "border-primary text-primary"
            : "border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground",
        )}
      >
        {leftLabel}
      </button>
      <button
        type="button"
        onClick={() => onChange("right")}
        aria-pressed={activePanel === "right"}
        className={cn(
          buttonClasses,
          activePanel === "right"
            ? "border-primary text-primary"
            : "border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground",
        )}
      >
        {rightLabel}
      </button>
    </nav>
  )
}

interface ClinicalWorkspaceDividerProps {
  label: string
  onDragStart: MouseEventHandler<HTMLDivElement>
  onCollapseLeft: () => void
  onCollapseRight: () => void
  leftCollapseLabel: string
  rightCollapseLabel: string
  showCollapseActions?: boolean
}

export function ClinicalWorkspaceDivider({
  label,
  onDragStart,
  onCollapseLeft,
  onCollapseRight,
  leftCollapseLabel,
  rightCollapseLabel,
  showCollapseActions = true,
}: ClinicalWorkspaceDividerProps) {
  const actionClasses =
    "inline-flex h-7 w-7 items-center justify-center rounded-full bg-transparent text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"

  return (
    <div
      data-slot="clinical-workspace-divider"
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      className="group relative flex w-2 shrink-0 items-center justify-center max-md:hidden"
    >
      <div
        className="absolute inset-y-0 -left-2 -right-2 cursor-col-resize"
        onMouseDown={onDragStart}
      />
      <div
        data-slot="clinical-workspace-divider-line"
        className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border/65 transition-colors group-hover:bg-primary/50 group-active:bg-primary"
      />

      {showCollapseActions && (
        <div className="absolute z-10 flex flex-col gap-0.5 rounded-full border border-border/70 bg-panel/95 p-0.5 shadow-sm backdrop-blur-sm">
          <button
            type="button"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={onCollapseLeft}
            title={leftCollapseLabel}
            aria-label={leftCollapseLabel}
            className={actionClasses}
          >
            <ChevronsLeft className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={onCollapseRight}
            title={rightCollapseLabel}
            aria-label={rightCollapseLabel}
            className={actionClasses}
          >
            <ChevronsRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}

interface ClinicalWorkspaceRailProps {
  label: string
  iconDirection: "left" | "right"
  onClick: () => void
  children?: ReactNode
}

export function ClinicalWorkspaceRail({
  label,
  iconDirection,
  onClick,
  children,
}: ClinicalWorkspaceRailProps) {
  const Icon = iconDirection === "left" ? ChevronsLeft : ChevronsRight

  return (
    <button
      type="button"
      data-slot="clinical-workspace-rail"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="group flex w-8 shrink-0 cursor-pointer flex-col items-center justify-center gap-3 rounded-md border border-border bg-panel text-muted-foreground transition-colors hover:border-primary/50 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary max-md:hidden"
    >
      <Icon className="h-4 w-4" />
      <span className="select-none text-xs font-medium [writing-mode:vertical-rl]">
        {children ?? label}
      </span>
    </button>
  )
}
