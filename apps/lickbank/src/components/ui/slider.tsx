"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

interface SliderProps {
  className?: string
  min?: number
  max?: number
  step?: number
  value?: number[]
  defaultValue?: number[]
  onValueChange?: (value: number | readonly number[], eventDetails: { values: number[] }) => void
  disabled?: boolean
}

function Slider({
  className,
  min = 0,
  max = 100,
  step = 1,
  value,
  onValueChange,
  disabled,
}: SliderProps) {
  const currentValue = value?.[0] ?? min
  const percentage = max > min ? ((currentValue - min) / (max - min)) * 100 : 0

  return (
    <div
      data-slot="slider"
      className={cn("relative flex w-full touch-none items-center select-none", className)}
    >
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={currentValue}
        disabled={disabled}
        onChange={(e) => {
          const v = parseFloat(e.target.value)
          onValueChange?.([v], { values: [v] })
        }}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
      />
      <div className="relative w-full h-1.5 rounded-full bg-muted">
        <div
          className="absolute h-full rounded-full bg-primary"
          style={{ width: `${percentage}%` }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 size-5 rounded-full border-2 border-ring bg-white ring-ring/50 hover:ring-3 shadow-sm"
          style={{ left: `${percentage}%` }}
        />
      </div>
    </div>
  )
}

export { Slider }
