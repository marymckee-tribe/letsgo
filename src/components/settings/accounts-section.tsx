"use client"

import { trpc } from "@/lib/trpc/client"
import { toast } from "sonner"

export function AccountsSection() {
  const utils = trpc.useUtils()

  const { data, isLoading } = trpc.accounts.list.useQuery()
  const accounts = data?.accounts ?? []

  const removeMutation = trpc.accounts.remove.useMutation({
    onSuccess: () => {
      toast("SYSTEM", { description: "Account removed." })
      utils.accounts.list.invalidate()
    },
  })

  const { refetch: fetchAuthUrl } = trpc.auth.google.start.useQuery(undefined, {
    enabled: false,
  })

  const addAccount = async () => {
    const result = await fetchAuthUrl()
    if (result.data?.url) {
      window.location.href = result.data.url
    }
  }

  return (
    <section id="accounts" className="mb-12">
      <h2 className="text-xs uppercase tracking-widest font-semibold text-muted-foreground mb-8 pb-2 border-b border-border">
        Linked Google Accounts
      </h2>
      {isLoading ? (
        <p className="text-sm text-muted-foreground font-serif italic">Loading…</p>
      ) : accounts.length === 0 ? (
        <p className="text-sm text-muted-foreground font-serif italic mb-6">No accounts linked yet.</p>
      ) : (
        <ul className="flex flex-col gap-3 mb-6">
          {accounts.map(a => (
            <li key={a.id} className="flex items-center justify-between border border-border px-4 py-3">
              <div>
                <div className="font-medium text-sm">{a.email}</div>
                <div className="text-xs text-muted-foreground font-mono">
                  Linked {new Date(a.addedAt).toLocaleDateString()}
                  {a.lastSyncedAt && ` · last sync ${new Date(a.lastSyncedAt).toLocaleString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true })}`}
                </div>
              </div>
              <button
                onClick={() => removeMutation.mutate({ id: a.id })}
                className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground hover:text-foreground border border-border px-3 py-1"
              >Remove</button>
            </li>
          ))}
        </ul>
      )}
      <button
        onClick={addAccount}
        className="bg-foreground text-background text-[10px] uppercase font-bold tracking-widest px-4 py-2"
      >Add another Gmail account</button>
    </section>
  )
}
