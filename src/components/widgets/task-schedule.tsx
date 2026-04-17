"use client"

import { useState } from "react"
import { useHub } from "@/lib/store"
import { toast } from "sonner"

const SCHEDULE_FALLBACK = [
  { time: "8:00", title: "School drop-off", who: "Ellie + Annie", isPast: true, isNow: false },
  { time: "9:30", title: "All-hands Q2", who: "Mary", isPast: false, isNow: true },
  { time: "12:00", title: "Lunch", who: "Mary", isPast: false, isNow: false },
  { time: "3:30", title: "Swim practice", who: "Ellie", isPast: false, isNow: false },
  { time: "6:00", title: "Dinner", who: "Everyone", isPast: false, isNow: false },
]

export function TaskSchedule({ className }: { className?: string }) {
  const { tasks, toggleTask, events, groceries, toggleGrocery } = useHub()
  const [completing, setCompleting] = useState<Set<string>>(new Set())
  const [showCompleted, setShowCompleted] = useState(false)

  const pendingTasks = tasks.filter(t => !t.completed && !completing.has(t.id))
  const doneTasks = tasks.filter(t => t.completed || completing.has(t.id))
  const allDone = pendingTasks.length === 0 && completing.size === 0 && tasks.length > 0

  // Use real events for schedule if available, otherwise fallback
  const scheduleItems = events.length > 0
    ? events.map(e => ({ time: e.time, title: e.title, who: "", isPast: false, isNow: false }))
    : SCHEDULE_FALLBACK

  const completeTask = (id: string, title: string) => {
    setCompleting(prev => new Set([...prev, id]))
    setTimeout(() => {
      setCompleting(prev => { const n = new Set(prev); n.delete(id); return n })
      toggleTask(id)
      toast("Task completed", {
        action: { label: "Undo", onClick: () => toggleTask(id) },
      })
    }, 350)
  }

  return (
    <div className={`flex flex-col h-full ${className ?? ""}`} style={{ fontFamily: "var(--font-dm-sans, system-ui)" }}>

      {/* Tasks */}
      <div className="flex-1 flex flex-col min-h-0">
        <h2
          className="text-4xl font-light tracking-tight text-foreground mb-8 shrink-0"
          style={{ fontFamily: "var(--font-jost, sans-serif)" }}
        >
          Tasks
        </h2>

        {allDone ? (
          <div className="flex-1 flex flex-col">
            <p className="text-2xl font-serif italic text-foreground/20 leading-relaxed">All clear.</p>
            <button
              onClick={() => setShowCompleted(s => !s)}
              className="text-[10px] uppercase tracking-[0.2em] text-foreground/20 font-bold mt-4 hover:text-foreground/40 transition-colors text-left"
            >
              {showCompleted ? "Hide" : "Show"} completed ({doneTasks.length})
            </button>
            {showCompleted && (
              <div className="mt-4 space-y-1 opacity-25 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
                {doneTasks.map(task => (
                  <div key={task.id} className="flex items-start gap-3 py-2">
                    <div className="shrink-0 mt-0.5 w-4 h-4 bg-foreground flex items-center justify-center">
                      <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                        <path d="M1 3L3 5L7 1" stroke="currentColor" className="text-background" strokeWidth="1.5" strokeLinecap="square" />
                      </svg>
                    </div>
                    <p className="text-sm text-foreground line-through leading-snug">{task.title}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-1 pr-1" style={{ scrollbarWidth: "none" }}>
            {pendingTasks.map(task => {
              const isAnimating = completing.has(task.id)
              return (
                <div
                  key={task.id}
                  className="flex items-start gap-3 py-2.5"
                  style={{ opacity: isAnimating ? 0.3 : 1, transition: "opacity 0.3s ease" }}
                >
                  <button
                    onClick={() => !isAnimating && completeTask(task.id, task.title)}
                    className={`shrink-0 mt-0.5 w-4 h-4 border flex items-center justify-center transition-all ${
                      isAnimating
                        ? "bg-foreground border-foreground"
                        : "bg-background border-border"
                    }`}
                  >
                    {isAnimating && (
                      <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                        <path d="M1 3L3 5L7 1" stroke="currentColor" className="text-background" strokeWidth="1.5" strokeLinecap="square" />
                      </svg>
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm leading-snug transition-colors ${
                        isAnimating ? "line-through text-foreground/30" : "text-foreground"
                      }`}
                    >
                      {task.title}
                    </p>
                    {task.who && (
                      <p className="text-[10px] text-signal-ai font-bold uppercase tracking-[0.15em] mt-0.5">{task.who}</p>
                    )}
                  </div>
                </div>
              )
            })}

            {doneTasks.length > 0 && (
              <div className="pt-4 mt-2 border-t border-border/60 space-y-1">
                {doneTasks.map(task => (
                  <div key={task.id} className="flex items-start gap-3 py-2 opacity-25">
                    <div className="shrink-0 mt-0.5 w-4 h-4 bg-foreground flex items-center justify-center">
                      <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                        <path d="M1 3L3 5L7 1" stroke="currentColor" className="text-background" strokeWidth="1.5" strokeLinecap="square" />
                      </svg>
                    </div>
                    <p className="text-sm text-foreground line-through leading-snug">{task.title}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Provisions */}
      {groceries.length > 0 && (
        <div className="shrink-0 pt-5 border-t border-border pt-5 mt-5">
          <p className="text-[10px] uppercase tracking-[0.25em] text-foreground/25 font-bold mb-3">Provisions</p>
          <div className="space-y-1">
            {groceries.slice(0, 6).map(item => (
              <div
                key={item.id}
                className="flex items-center gap-2.5 py-1 cursor-pointer group"
                onClick={() => toggleGrocery(item.id)}
              >
                <div
                  className={`shrink-0 w-3.5 h-3.5 border flex items-center justify-center transition-all ${
                    item.checked
                      ? "bg-foreground border-foreground"
                      : "bg-background border-border"
                  }`}
                >
                  {item.checked && (
                    <svg width="7" height="5" viewBox="0 0 7 5" fill="none">
                      <path d="M1 2.5L2.5 4L6 1" stroke="currentColor" className="text-background" strokeWidth="1.5" strokeLinecap="square" />
                    </svg>
                  )}
                </div>
                <span
                  className={`text-xs ${
                    item.checked
                      ? "line-through text-foreground/25"
                      : "text-muted-foreground"
                  }`}
                >
                  {item.name}
                </span>
              </div>
            ))}
            {groceries.length > 6 && (
              <p className="text-[10px] text-foreground/25 pl-6">+{groceries.length - 6} more</p>
            )}
          </div>
        </div>
      )}

      {/* Schedule strip */}
      <div className="shrink-0 pt-6 border-t border-border mt-6">
        <p className="text-[10px] uppercase tracking-[0.25em] text-foreground/25 font-bold mb-4">Schedule</p>
        <div className="space-y-0">
          {scheduleItems.slice(0, 6).map((item, i) => (
            <div
              key={i}
              className={`flex items-baseline gap-3 py-2 border-b border-border/50 last:border-0 ${item.isPast ? "opacity-20" : ""}`}
            >
              <span className="text-[10px] font-mono text-foreground/35 w-10 shrink-0">{item.time}</span>
              <span className={`text-xs flex-1 truncate ${item.isNow ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                {item.title}
              </span>
              {item.isNow && (
                <span className="text-[8px] uppercase font-bold tracking-widest text-signal-today-foreground bg-signal-today px-1.5 py-0.5 shrink-0">now</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
