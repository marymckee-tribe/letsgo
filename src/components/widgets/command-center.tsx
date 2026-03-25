"use client"

import { useEffect, useState } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { db, isMock } from "@/lib/firebase"
import { collection, query, orderBy, limit, onSnapshot } from "firebase/firestore"
import { useAuth } from "@/lib/auth-provider"

export type ActivityLog = {
  id: string;
  message: string;
  timestamp: number;
}

export function CommandCenter({ className }: { className?: string }) {
  const [logs, setLogs] = useState<ActivityLog[]>([])
  const { signOut } = useAuth()

  useEffect(() => {
    if (isMock) return;

    try {
      const q = query(collection(db, "activity_logs"), orderBy("timestamp", "desc"), limit(30))
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const liveLogs: ActivityLog[] = []
        snapshot.forEach((doc) => liveLogs.push({ id: doc.id, ...doc.data() } as ActivityLog))
        setLogs(liveLogs)
      })
      return () => unsubscribe()
    } catch (err) {
      console.warn("Firestore listener failed:", err)
    }
  }, [])

  return (
    <div className={`flex flex-col h-full ${className}`}>
      <div className="flex justify-between items-baseline mb-8">
        <h2 className="font-heading text-4xl font-light tracking-tighter text-black">Activity Flow</h2>
        <button onClick={signOut} className="text-black/40 hover:text-black transition-colors text-[10px] uppercase font-bold tracking-widest border border-transparent hover:border-black/20 px-2 py-1">Disconnect</button>
      </div>
      <div className="flex-1 relative border-l border-black/10 p-0">
        <ScrollArea className="h-full w-full absolute inset-0 pl-8">
          <div className="space-y-12 pr-4">
            {logs.length === 0 ? (
               <p className="text-black/40 text-sm italic font-serif">Awaiting system activity...</p>
            ) : (
               logs.map((log) => (
                 <div key={log.id} className="flex flex-col gap-1">
                   <p className="text-black/60 text-xs font-medium uppercase tracking-widest tabular-nums">
                     {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                   </p>
                   <p className="text-lg font-light text-black">{log.message}</p>
                 </div>
               ))
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}
