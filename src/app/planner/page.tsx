"use client"

import { useState } from "react"
import { useHub } from "@/lib/store"
import { Check, Circle, Plus, ListTodo } from "lucide-react"

const CATEGORIES = ["ALL", "PERSONAL", "WORK", "FAMILY", "HOUSEHOLD", "ERRANDS"]

export default function PlannerPage() {
  const { tasks, toggleTask, addTask } = useHub()
  const [activeTab, setActiveTab] = useState("ALL")
  const [newTaskInput, setNewTaskInput] = useState("")

  const filteredTasks = tasks.filter(t => activeTab === "ALL" || t.context.toUpperCase() === activeTab)
  
  const pendingTasks = filteredTasks.filter(t => !t.completed)
  const completedTasks = filteredTasks.filter(t => t.completed)

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTaskInput.trim()) return
    
    // Automatically infer context if active tab isn't ALL
    const context = activeTab === "ALL" ? "PERSONAL" : activeTab

    addTask({
      id: Math.random().toString(),
      title: newTaskInput,
      context: context,
      completed: false
    })
    setNewTaskInput("")
  }

  return (
    <main className="flex-1 w-full bg-white text-foreground flex flex-col p-12 lg:p-24 overflow-hidden h-[calc(100vh-6rem)]">
      <div className="mx-auto max-w-[1600px] w-full h-full flex flex-col">

        <div className="flex justify-between items-end mb-12 shrink-0">
          <div>
            <h1 className="font-heading text-6xl font-light tracking-tighter text-foreground mb-2">Planner</h1>
            <p className="text-muted-foreground text-sm uppercase tracking-widest font-mono">Unified Execution Layer</p>
          </div>
        </div>

        <div className="flex flex-1 min-h-0 gap-16">
          {/* Sidebar Navigation */}
          <div className="w-64 shrink-0 flex flex-col gap-2 overflow-y-auto">
             {CATEGORIES.map(category => {
               const count = tasks.filter(t => !t.completed && (category === "ALL" || t.context.toUpperCase() === category)).length
               return (
                 <button
                   key={category}
                   onClick={() => setActiveTab(category)}
                   className={`text-left px-6 py-4 transition-colors flex justify-between items-center group ${activeTab === category ? "bg-foreground text-background" : "hover:bg-muted text-foreground"}`}
                 >
                   <span className="font-medium tracking-tight text-xl">{category}</span>
                   {count > 0 && (
                     <span className={`text-[10px] uppercase font-bold tracking-widest ${activeTab === category ? "text-background/60" : "text-muted-foreground group-hover:text-muted-foreground"}`}>
                       {count}
                     </span>
                   )}
                 </button>
               )
             })}
          </div>

          {/* Core Master Planner Area */}
          <div className="flex-1 flex flex-col border-l border-border pl-16 pr-8">

            <form onSubmit={handleAddTask} className="flex gap-4 items-center mb-12 shrink-0 border-b border-border pb-4">
              <Plus className="w-6 h-6 text-muted-foreground" />
              <input
                type="text"
                value={newTaskInput}
                onChange={(e) => setNewTaskInput(e.target.value)}
                placeholder="Declare a new task..."
                className="flex-1 bg-transparent text-2xl font-light tracking-tight placeholder:text-foreground/20 outline-none"
              />
              <button type="submit" className="text-xs uppercase tracking-widest font-bold border border-border hover:border-foreground px-4 py-2 transition-colors">
                Append
              </button>
            </form>

            <div className="flex-1 overflow-y-auto space-y-12">

              {/* Pending Queue */}
              <div>
                <h3 className="text-xs uppercase tracking-widest font-semibold text-muted-foreground mb-6 flex items-center gap-3">
                  <ListTodo className="w-4 h-4" /> Action Required
                </h3>
                <div className="space-y-2">
                  {pendingTasks.length === 0 ? (
                    <p className="text-muted-foreground italic font-serif pb-4">No pending actions in this domain.</p>
                  ) : pendingTasks.map(task => (
                    <div key={task.id} className="group flex items-start gap-6 border border-border/50 p-4 hover:border-border transition-colors cursor-pointer" onClick={() => toggleTask(task.id)}>
                      <button className="shrink-0 mt-0.5 text-foreground/20 hover:text-foreground transition-colors">
                        <Circle className="w-6 h-6" />
                      </button>
                      <div className="flex-1 flex justify-between items-start">
                        <span className="text-xl tracking-tight leading-none group-hover:underline underline-offset-4 decoration-1">{task.title}</span>
                        <span className="shrink-0 border border-border px-2 py-0.5 text-[10px] uppercase font-bold tracking-widest text-muted-foreground">[{task.context}]</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Completed Log */}
              {completedTasks.length > 0 && (
                <div className="border-t border-border pt-12">
                  <h3 className="text-xs uppercase tracking-widest font-semibold text-muted-foreground mb-6 flex items-center gap-3">
                    <Check className="w-4 h-4" /> Cleared
                  </h3>
                  <div className="space-y-2 opacity-50">
                    {completedTasks.map(task => (
                      <div key={task.id} className="group flex items-start gap-6 border border-border/50 p-4 transition-colors cursor-pointer" onClick={() => toggleTask(task.id)}>
                        <button className="shrink-0 mt-0.5 text-foreground">
                          <Check className="w-6 h-6" />
                        </button>
                        <div className="flex-1 flex justify-between items-start">
                          <span className="text-xl tracking-tight leading-none line-through">{task.title}</span>
                          <span className="shrink-0 border border-border px-2 py-0.5 text-[10px] uppercase font-bold tracking-widest text-muted-foreground">[{task.context}]</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>

      </div>
    </main>
  )
}
