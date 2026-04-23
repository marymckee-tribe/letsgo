"use client"

import { motion } from "framer-motion"
import type { EmailAction } from "@/lib/store"
import { ActionCard } from "./action-card"

interface Props {
  actions: EmailAction[]
  emailId: string
  timeZone: string
}

export function ActionDeck({ actions, emailId, timeZone }: Props) {
  // Filter out actions that are already committed or dismissed server-side.
  // Dismissal now goes through the server via commit.dismiss(); we no longer
  // need a client-side Set — the invalidated digest query brings back the
  // updated statuses and this filter hides terminal-state cards.
  const visible = actions.filter(
    (a) => a.status !== "DISMISSED" && a.status !== "COMMITTED",
  )

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
        <motion.div layout className="flex flex-col gap-6">
          {visible.map((a, i) => (
            <motion.div
              key={a.id}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.18, delay: i * 0.04 }}
            >
              <ActionCard action={a} emailId={emailId} timeZone={timeZone} />
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  )
}
