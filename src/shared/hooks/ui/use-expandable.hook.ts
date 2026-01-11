/**
 * Expandable Hook (Shared UI Hook)
 * 
 * Generic hook for managing expand/collapse state.
 * This is a reusable UI pattern that can be used across the entire application.
 * 
 * Use Cases:
 * - Medical Chat: Fullscreen expand/collapse
 * - Clinical Insights: Panel expand/collapse
 * - Modals, Accordions, Drawers, etc.
 * 
 * Design Principles:
 * - Low Coupling: Independent of any specific business logic
 * - High Reusability: Can be used in any component
 * - Single Responsibility: Only manages expand/collapse state
 * 
 * @param initialState - Initial expanded state (default: false)
 * 
 * @example
 * ```tsx
 * function MyComponent() {
 *   const expandable = useExpandable()
 *   
 *   return (
 *     <div>
 *       <button onClick={expandable.toggle}>
 *         {expandable.isExpanded ? 'Collapse' : 'Expand'}
 *       </button>
 *       {expandable.isExpanded && <div>Content</div>}
 *     </div>
 *   )
 * }
 * ```
 */
import { useState, useCallback } from "react"

export function useExpandable(initialState = false) {
  const [isExpanded, setIsExpanded] = useState(initialState)

  const expand = useCallback(() => {
    setIsExpanded(true)
  }, [])

  const collapse = useCallback(() => {
    setIsExpanded(false)
  }, [])

  const toggle = useCallback(() => {
    setIsExpanded(prev => !prev)
  }, [])

  return {
    // State
    isExpanded,
    
    // Setter (for direct control when needed)
    setIsExpanded,
    
    // Semantic actions
    expand,
    collapse,
    toggle,
  }
}
