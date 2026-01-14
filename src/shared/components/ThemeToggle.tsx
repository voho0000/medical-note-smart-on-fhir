// Theme Toggle Component
"use client"

import { Moon, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useTheme } from "@/src/application/providers/theme.provider"

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={toggleTheme}
      className="h-8 w-8 sm:h-9 sm:w-9"
      aria-label="Toggle theme"
    >
      {theme === 'dark' ? (
        <Sun className="h-4 w-4 sm:h-5 sm:w-5" />
      ) : (
        <Moon className="h-4 w-4 sm:h-5 sm:w-5" />
      )}
    </Button>
  )
}
