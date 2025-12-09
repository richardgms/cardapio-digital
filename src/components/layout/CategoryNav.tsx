'use client'

import { useRef, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { Category } from '@/types/database'
import { cn } from '@/lib/utils'

interface CategoryNavProps {
  categories: Category[]
  activeId: string | null
  onSelect: (id: string) => void
}

export function CategoryNav({ categories, activeId, onSelect }: CategoryNavProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0, opacity: 0 })

  useEffect(() => {
    if (activeId && scrollContainerRef.current) {
      const activeElement = scrollContainerRef.current.querySelector<HTMLButtonElement>(`[data-category-id="${activeId}"]`)

      if (activeElement) {
        // Update indicator position
        setIndicatorStyle({
          left: activeElement.offsetLeft,
          width: activeElement.offsetWidth,
          opacity: 1
        })

        // Scroll logic (keep centered)
        const container = scrollContainerRef.current
        const scrollLeft = activeElement.offsetLeft - container.offsetWidth / 2 + activeElement.offsetWidth / 2

        container.scrollTo({
          left: scrollLeft,
          behavior: 'smooth'
        })
      }
    }
  }, [activeId, categories]) // Recalculate if categories change (e.g. init)

  if (!categories || categories.length === 0) return null

  return (
    <div className="w-full bg-white">
      <div
        ref={scrollContainerRef}
        className="relative flex overflow-x-auto py-3 px-4 gap-2 no-scrollbar w-full scroll-smooth"
      >
        {/* Marcador Animado */}
        <div
          className="absolute top-3 bottom-3 bg-black rounded-full transition-all duration-300 ease-out shadow-md pointer-events-none"
          style={{
            left: `${indicatorStyle.left}px`,
            width: `${indicatorStyle.width}px`,
            opacity: indicatorStyle.opacity,
            height: 'calc(100% - 24px)' // Adjust based on py-3 (12px top + 12px bottom = 24px)
          }}
        />

        {categories.map((category) => (
          <Button
            key={category.id}
            data-category-id={category.id}
            variant="ghost"
            className={cn(
              'rounded-full whitespace-nowrap transition-colors relative z-10 hover:bg-transparent',
              activeId === category.id
                ? 'text-white hover:text-white'
                : 'text-muted-foreground hover:text-foreground'
            )}
            onClick={() => onSelect(category.id)}
          >
            {category.name}
          </Button>
        ))}
      </div>
    </div>
  )
}
