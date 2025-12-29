"use client"

import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Info } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import type { DataItem, DataType } from "../hooks/useDataCategories"
import type { DataSelection } from "@/src/core/entities/clinical-context.entity"

interface DataCategoryItemProps {
  item: DataItem
  isSelected: boolean
  onToggle: (id: DataType, checked: boolean) => void
  renderFilters?: () => React.ReactNode
}

export function DataCategoryItem({ item, isSelected, onToggle, renderFilters }: DataCategoryItemProps) {
  return (
    <Card className="p-4 hover:bg-muted/50 transition-colors">
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
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-4 w-4 ml-1">
                        <Info className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="sr-only">Info</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>{item.description}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </Label>
            </div>
            <Badge 
              variant={isSelected ? "default" : "secondary"}
              className="ml-2"
            >
              {item.count} {item.count === 1 ? 'item' : 'items'}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {item.description}
          </p>
          
          {isSelected && renderFilters && renderFilters()}
        </div>
      </div>
    </Card>
  )
}
