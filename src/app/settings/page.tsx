"use client"

import { useState } from "react"
import { Shield, BrainCircuit, Sliders, ToggleLeft, ToggleRight, Database } from "lucide-react"

export default function SettingsPage() {
  const [toggles, setToggles] = useState({
    inboxIntelligence: true,
    scheduleOptimization: true,
    predictiveTasks: true,
    autonomousDrafting: false,
    entityAggression: true
  })

  const toggle = (key: keyof typeof toggles) => setToggles(p => ({ ...p, [key]: !p[key] }))

  return (
    <main className="flex-1 w-full bg-white text-foreground flex flex-col p-12 lg:p-24 overflow-hidden h-[calc(100vh-6rem)]">
      <div className="mx-auto max-w-[1600px] w-full h-full flex flex-col">

        <div className="flex justify-between items-end mb-12 shrink-0">
          <div>
            <h1 className="font-heading text-6xl font-light tracking-tighter text-foreground mb-2">System Config</h1>
            <p className="text-muted-foreground text-sm uppercase tracking-widest font-mono">Trust, Rules & AI Automation</p>
          </div>
        </div>

        <div className="flex flex-1 min-h-0 gap-16">

          <div className="w-64 shrink-0 flex flex-col gap-2 border-r border-border pr-8">
             <button className="text-left py-4 px-2 border-l-2 border-foreground font-medium tracking-tight text-xl flex items-center justify-between">
               AI Rules <BrainCircuit className="w-5 h-5 text-foreground/40" />
             </button>
             <button className="text-left py-4 px-2 border-l-2 border-transparent text-foreground/40 hover:text-foreground transition-colors font-medium tracking-tight text-xl flex items-center justify-between">
               Connected Apps <Database className="w-5 h-5" />
             </button>
             <button className="text-left py-4 px-2 border-l-2 border-transparent text-foreground/40 hover:text-foreground transition-colors font-medium tracking-tight text-xl flex items-center justify-between">
               Privacy & Data <Shield className="w-5 h-5" />
             </button>
          </div>

          <div className="flex-1 overflow-y-auto pr-8 max-w-3xl">

            <h2 className="text-xs uppercase tracking-widest font-semibold text-foreground/40 mb-8 pb-2 border-b border-border">Active Inference Models</h2>

            <div className="space-y-8">
              {/* Inbox */}
              <div className="flex items-start justify-between gap-12 group">
                 <div>
                   <h3 className="font-medium text-lg mb-1 group-hover:underline underline-offset-4 decoration-1">Intelligent Inbox Routing</h3>
                   <p className="text-sm font-serif italic text-muted-foreground leading-relaxed">Allows the Chief of Staff agent to silently ingest, read, and completely summarize unread incoming primary tab messages using the OpenAI API gateway.</p>
                 </div>
                 <button onClick={() => toggle('inboxIntelligence')} className="shrink-0 mt-1">
                   {toggles.inboxIntelligence ? <ToggleRight className="w-8 h-8 text-foreground" /> : <ToggleLeft className="w-8 h-8 text-foreground/20" />}
                 </button>
              </div>

              {/* Schedule */}
              <div className="flex items-start justify-between gap-12 group">
                 <div>
                   <h3 className="font-medium text-lg mb-1 group-hover:underline underline-offset-4 decoration-1">Schedule Diagnostics & Buffers</h3>
                   <p className="text-sm font-serif italic text-muted-foreground leading-relaxed">Surfaces daily AI-generated prep sheets and identifies impossible transitions/travel limits based on location metadata in the live Google Calendar connection.</p>
                 </div>
                 <button onClick={() => toggle('scheduleOptimization')} className="shrink-0 mt-1">
                   {toggles.scheduleOptimization ? <ToggleRight className="w-8 h-8 text-foreground" /> : <ToggleLeft className="w-8 h-8 text-foreground/20" />}
                 </button>
              </div>

              {/* Entities */}
              <div className="flex items-start justify-between gap-12 group">
                 <div>
                   <h3 className="font-medium text-lg mb-1 flex gap-3">
                     <span className="group-hover:underline underline-offset-4 decoration-1">Proactive Life Sub-agents</span>
                     <span className="text-[10px] font-bold uppercase tracking-widest bg-red-100 text-red-900 px-2 py-0.5 border border-red-200">High Trust Needed</span>
                   </h3>
                   <p className="text-sm font-serif italic text-muted-foreground leading-relaxed">Permits the central AI terminal to actively write, edit, and read precise Family Object state parameters regarding internal behaviors, shoe sizes, and logistics without pre-approval.</p>
                 </div>
                 <button onClick={() => toggle('entityAggression')} className="shrink-0 mt-1">
                   {toggles.entityAggression ? <ToggleRight className="w-8 h-8 text-foreground" /> : <ToggleLeft className="w-8 h-8 text-foreground/20" />}
                 </button>
              </div>

              {/* Auto Drafts */}
              <div className="flex items-start justify-between gap-12 group opacity-50 bg-muted p-6 border border-border">
                 <div>
                   <h3 className="font-medium text-lg mb-1 flex gap-3">Autonomous Email Drafting (Beta)</h3>
                   <p className="text-sm font-serif italic text-muted-foreground leading-relaxed">If action items require replies, allow the AI pipeline to queue automatic drafts into the user's Gmail Drafts folder. (Currently disabled pending further human tests).</p>
                 </div>
                 <button onClick={() => toggle('autonomousDrafting')} className="shrink-0 mt-1 cursor-not-allowed">
                   {toggles.autonomousDrafting ? <ToggleRight className="w-8 h-8 text-foreground" /> : <ToggleLeft className="w-8 h-8 text-foreground/20" />}
                 </button>
              </div>

            </div>
          </div>
        </div>

      </div>
    </main>
  )
}
