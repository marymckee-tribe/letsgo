"use client"

import { useEffect, useState } from "react"
import type { EmailAction } from "@/lib/store"
import { ActionCard } from "./action-card"

interface Props {
  actions: EmailAction[]
}

export function ActionDeck({ actions }: Props) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const signature = actions.map((a) => a.id).join(",")
  useEffect(() => {
    setDismissed(new Set())
  }, [signature])

  const visible = actions.filter((a) => !dismissed.has(a.id))

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-white p-6 lg:p-8">
      <h3 className="mb-6 border-b border-border pb-4 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
        Suggested actions
      </h3>

      {visible.length === 0 ? (
        <p className="border border-border/60 py-12 text-center text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          No suggested actions
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {visible.map((a) => (
            <ActionCard key={a.id} action={a} onSkip={(id) => setDismissed((s) => new Set(s).add(id))} />
          ))}
        </div>
      )}
    </div>
  )
}
