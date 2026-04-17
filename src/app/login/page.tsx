"use client"

import { useAuth } from "@/lib/auth-provider"
import { Button } from "@/components/ui/button"

export default function LoginPage() {
  const { signIn, loading } = useAuth()

  return (
    <main className="flex-1 w-full h-full min-h-screen bg-background text-foreground flex flex-col items-center justify-center overflow-hidden p-6 absolute inset-0 z-50">
      <div className="w-full max-w-sm flex flex-col gap-16 items-center">
        <div className="flex flex-col items-center text-center gap-4">
           <h1 className="font-heading text-6xl tracking-tighter">THE HUB</h1>
           <p className="text-foreground/40 text-xs font-medium uppercase tracking-[0.3em]">Chief of Staff Interface</p>
        </div>

        <Button
          onClick={signIn}
          disabled={loading}
          className="w-full border border-foreground bg-foreground text-background hover:bg-foreground/80 hover:text-background rounded-none py-6 uppercase tracking-widest text-xs font-semibold shadow-none transition-colors"
        >
          {loading ? "Authenticating..." : "[ Authenticate ]"}
        </Button>
      </div>
    </main>
  )
}
