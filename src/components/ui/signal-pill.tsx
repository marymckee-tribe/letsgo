import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const signalPillVariants = cva(
  "inline-block font-mono text-[9px] tracking-[0.22em] uppercase font-bold px-2 py-0.5 whitespace-nowrap",
  {
    variants: {
      variant: {
        ai:      "bg-signal-ai text-signal-ai-foreground",
        today:   "bg-signal-today text-signal-today-foreground",
        warn:    "bg-signal-warn text-signal-warn-foreground",
        neutral: "border border-foreground text-foreground bg-transparent",
      },
    },
    defaultVariants: { variant: "neutral" },
  }
)

export type SignalPillProps =
  React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof signalPillVariants>

export function SignalPill({ variant, className, children, ...props }: SignalPillProps) {
  return (
    <span className={cn(signalPillVariants({ variant }), className)} {...props}>
      {children}
    </span>
  )
}
