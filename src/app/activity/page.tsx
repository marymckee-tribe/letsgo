"use client"

import { useEffect, useState } from "react"
import { collection, query, orderBy, limit, onSnapshot } from "firebase/firestore"
import { db, isMock } from "@/lib/firebase"
import { Terminal, Activity as ActivityIcon } from "lucide-react"

export default function ActivityPage() {
  const [logs, setLogs] = useState<{ id: string, message: string, timestamp: number }[]>([])

  useEffect(() => {
    if (isMock) {
       setLogs([{ id: "1", message: "Mock Mode Active: Loaded Family OS initial architectural state.", timestamp: Date.now() }])
       return
    }

    const q = query(collection(db, "activity_logs"), orderBy("timestamp", "desc"), limit(100))
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any)))
    })
    return () => unsubscribe()
  }, [])

  return (
    <main className="flex-1 w-full bg-white text-foreground flex flex-col p-12 lg:p-24 overflow-hidden h-[calc(100vh-6rem)]">
      <div className="mx-auto max-w-[1600px] w-full h-full flex flex-col">

        <div className="flex justify-between items-end mb-12 shrink-0 border-b border-border pb-6">
          <div>
            <h1 className="font-heading text-6xl font-light tracking-tighter text-foreground mb-2">Activity Stream</h1>
            <p className="text-muted-foreground text-sm uppercase tracking-widest font-mono">System-wide Immutable Operations Log</p>
          </div>
          <div className="hidden sm:flex items-center gap-4 text-xs tracking-widest uppercase font-bold border border-border text-foreground px-4 py-2 bg-muted">
             <ActivityIcon className="w-4 h-4" /> Live Tracking
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto pr-8">
           <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-widest font-bold text-foreground/40">
                  <th className="pb-4 font-normal">Timestamp</th>
                  <th className="pb-4 font-normal">System Actor</th>
                  <th className="pb-4 font-normal">Operation Hash</th>
                  <th className="pb-4 font-normal">Directives / Payload</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-foreground/40 italic font-serif py-8">Awaiting initial system logs...</td>
                  </tr>
                ) : logs.map((log) => {
                  const date = new Date(log.timestamp)
                  return (
                    <tr key={log.id} className="border-b border-border/50 hover:bg-muted transition-colors group">
                      <td className="py-4 text-xs font-mono tabular-nums text-muted-foreground align-top">
                        {date.toLocaleDateString()} <br/> {date.toLocaleTimeString()}
                      </td>
                      <td className="py-4 align-top">
                        <div className="flex items-center gap-3">
                           <div className="w-6 h-6 bg-foreground flex items-center justify-center shrink-0">
                             <Terminal className="w-3 h-3 text-background" />
                           </div>
                           <span className="text-xs uppercase font-bold tracking-widest">Chief of Staff</span>
                        </div>
                      </td>
                      <td className="py-4 align-top">
                        <span className="text-[10px] uppercase font-mono bg-muted px-2 py-1 text-foreground/40 group-hover:text-muted-foreground transition-colors">
                          {log.id.slice(0, 12)}
                        </span>
                      </td>
                      <td className="py-4 align-top">
                        <span className="font-serif italic text-foreground/90">"{log.message}"</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
           </table>
        </div>

      </div>
    </main>
  )
}
