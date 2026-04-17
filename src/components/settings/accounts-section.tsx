"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/lib/auth-provider"
import { toast } from "sonner"

type Account = {
  id: string
  email: string
  displayName?: string
  addedAt: number
  lastSyncedAt?: number
}

export function AccountsSection() {
  const { getIdToken } = useAuth()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    setLoading(true)
    const token = await getIdToken()
    if (!token) { setAccounts([]); setLoading(false); return }
    const res = await fetch('/api/accounts', { headers: { Authorization: `Bearer ${token}` } })
    const data = await res.json()
    setAccounts(data.accounts || [])
    setLoading(false)
  }

  useEffect(() => { refresh() }, [])

  const addAccount = async () => {
    const token = await getIdToken()
    if (!token) return
    const res = await fetch('/api/auth/google/start', { headers: { Authorization: `Bearer ${token}` } })
    const data = await res.json()
    if (data.url) window.location.href = data.url
  }

  const removeAccount = async (id: string) => {
    const token = await getIdToken()
    if (!token) return
    const res = await fetch(`/api/accounts?id=${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      toast("SYSTEM", { description: "Account removed." })
      await refresh()
    }
  }

  return (
    <section id="accounts" className="mb-12">
      <h2 className="text-xs uppercase tracking-widest font-semibold text-foreground/40 mb-8 pb-2 border-b border-border">
        Linked Google Accounts
      </h2>
      {loading ? (
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
                onClick={() => removeAccount(a.id)}
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
