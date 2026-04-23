"use client"

import { Suspense, useEffect, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Inbox as InboxIcon } from "lucide-react"
import { useHub, useInboxEmails, useClearEmail, useRestoreEmail } from "@/lib/store"
import { QueueList } from "@/components/inbox/queue-list"
import { EmailReader } from "@/components/inbox/email-reader"
import { ActionDeck } from "@/components/inbox/action-deck"

function InboxPageInner() {
  const { profiles } = useHub()
  const { data } = useInboxEmails()
  const clearMut = useClearEmail()
  const restoreMut = useRestoreEmail()
  const emails = data?.emails ?? []

  const searchParams = useSearchParams()
  const threadParam = searchParams?.get("thread") ?? null

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const initialSelectionResolved = useRef(false)

  useEffect(() => {
    if (initialSelectionResolved.current) return
    if (emails.length === 0) return

    if (threadParam && emails.some((e) => e.id === threadParam)) {
      setSelectedId(threadParam)
      initialSelectionResolved.current = true
      return
    }

    const firstActive = emails.find((e) => e.hubStatus !== "CLEARED")
    if (firstActive) {
      setSelectedId(firstActive.id)
      initialSelectionResolved.current = true
    }
  }, [emails, threadParam])

  const activeEmail = emails.find((e) => e.id === selectedId && e.hubStatus !== "CLEARED")

  return (
    <main
      aria-label="Inbox triage"
      className="flex h-[calc(100vh-6rem)] w-full flex-col bg-[#f8f8f8] p-8 lg:p-12"
    >
      <div className="mx-auto flex h-full w-full max-w-[1600px] overflow-hidden border border-border bg-white shadow-[0_20px_60px_-15px_rgba(0,0,0,0.05)]">
        <QueueList
          emails={emails}
          profiles={profiles}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onRestore={(id) => restoreMut.mutate({ id })}
        />

        <section aria-label="Email reader" className="flex-1 min-w-0">
          {activeEmail ? (
            <EmailReader
              email={activeEmail}
              profiles={profiles}
              onClear={(id) => {
                clearMut.mutate({ emailId: id })
                setSelectedId(null)
              }}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-4 bg-white/50 text-muted-foreground">
              <InboxIcon className="h-12 w-12" />
              <span className="text-[10px] font-bold uppercase tracking-[0.18em]">Select a thread</span>
            </div>
          )}
        </section>

        <aside aria-label="Suggested actions" className="w-[300px] shrink-0 border-l border-border bg-white">
          <ActionDeck actions={activeEmail?.suggestedActions ?? []} />
        </aside>
      </div>
    </main>
  )
}

export default function InboxPage() {
  return (
    <Suspense>
      <InboxPageInner />
    </Suspense>
  )
}
