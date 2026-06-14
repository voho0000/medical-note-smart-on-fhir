"use client"

import { Card } from "@/components/ui/card"
import { CARD_BORDER_CLASSES } from "@/src/shared/config/ui-theme.config"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { InfoHint } from "@/src/shared/components/InfoHint"
import { useLanguage } from "@/src/application/providers/language.provider"
import type { DataItem, DataType } from "../hooks/useDataCategories"
import type { CategoryFilterProps } from "@/src/core/interfaces/data-category.interface"

/**
 * Props for DataCategoryItem component
 * Following Interface Segregation Principle - only includes necessary props
 */
interface DataCategoryItemProps {
  item: DataItem
  isSelected: boolean
  onToggle: (id: DataType, checked: boolean) => void
  // More explicit than render prop - accepts a React component
  FilterComponent?: React.ComponentType<CategoryFilterProps>
  filterProps?: CategoryFilterProps
}

export function DataCategoryItem({ 
  item, 
  isSelected, 
  onToggle, 
  FilterComponent, 
  filterProps 
}: DataCategoryItemProps) {
  const { t } = useLanguage()
  
  return (
    <Card className={`p-4 hover:bg-muted/50 transition-colors ${CARD_BORDER_CLASSES.selection}`}>
      <div className="flex items-start space-x-3">
        <Checkbox
          id={`data-${item.id}`}
          checked={isSelected}
          onCheckedChange={(checked) => onToggle(item.id, checked as boolean)}
          className="mt-1"
        />
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Label 
                htmlFor={`data-${item.id}`} 
                className="font-medium text-sm flex items-center"
              >
                {item.label}
                <InfoHint className="ml-1" contentClassName="max-w-xs" iconClassName="text-muted-foreground">
                  <p>{item.description}</p>
                </InfoHint>
              </Label>
            </div>
            <Badge 
              variant={isSelected ? "default" : "secondary"}
              className="ml-2"
            >
              {item.count} {item.count === 1 ? t.dataSelection.item : t.dataSelection.items}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {item.description}
          </p>
          
          {isSelected && FilterComponent && filterProps && (
            <FilterComponent {...filterProps} />
          )}
        </div>
      </div>
    </Card>
  )
}
