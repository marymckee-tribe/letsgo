"use client"

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription } from "@/components/ui/sheet"
import { useHub } from "@/lib/store"

export function DashboardCards({ className }: { className?: string }) {
  const { events, tasks, groceries, toggleTask, scheduleInsights } = useHub()

  return (
    <div className={`flex flex-col gap-12 h-full ${className}`}>
      
      {/* Upcoming Events */}
      <div className="flex-1 flex flex-col min-h-0">
        <h2 className="font-heading text-2xl font-light tracking-tight mb-6 text-black">Schedule</h2>
        
        {scheduleInsights && scheduleInsights.length > 0 && (
          <div className="mb-6 bg-black/5 border-l-2 border-black p-4 rounded-none">
            <span className="text-black text-[10px] font-bold uppercase tracking-widest block mb-2">Schedule Intelligence</span>
            <ul className="space-y-2">
              {scheduleInsights.map((insight, idx) => (
                <li key={idx} className="text-sm font-serif italic text-black/80 leading-tight">"{insight}"</li>
              ))}
            </ul>
          </div>
        )}
        
        <div className="flex-1 overflow-y-auto w-full border-t border-black/10 pt-6 space-y-4">
           {events.length === 0 ? (
              <p className="text-black/40 text-sm italic font-serif">No schedule blocks remaining today.</p>
           ) : events.map((event) => (
            <Sheet key={event.id}>
              <SheetTrigger className="w-full text-left">
                 <div className="flex justify-between items-start group cursor-pointer border-b border-transparent hover:border-black/10 pb-1 transition-colors">
                   <div className="flex flex-col">
                     <span className="text-black text-sm group-hover:underline decoration-1 underline-offset-4">{event.title}</span>
                     {event.aiTravelBuffer && <span className="text-[10px] uppercase font-bold tracking-widest text-black/40 mt-1">[{event.aiTravelBuffer}]</span>}
                   </div>
                   <span className="text-black/60 text-xs tabular-nums mt-0.5">{event.time}</span>
                 </div>
              </SheetTrigger>
              <SheetContent side="right" className="w-[400px] sm:w-[540px] border-l border-black bg-white p-12 shadow-none sm:max-w-none text-black">
                <SheetHeader className="mb-12 flex flex-col items-start gap-4">
                  <span className="text-black bg-black/5 px-3 py-1 font-mono text-xs tracking-widest uppercase">{event.time}</span>
                  <SheetTitle className="font-heading text-4xl font-light tracking-tighter text-black">{event.title}</SheetTitle>
                  <SheetDescription className="text-black/60 text-base">
                    {event.location && event.location !== "TBD" ? `Location: ${event.location}` : "Synced from Google Calendar integration."}
                  </SheetDescription>
                </SheetHeader>
                <div className="space-y-8">
                  <div>
                    <h3 className="text-xs uppercase tracking-widest font-semibold text-black/40 mb-4">Event Context</h3>
                    <div className="space-y-4 text-black text-sm">
                       <p className="flex items-center gap-4"><span className="w-1.5 h-1.5 bg-black shrink-0" /><span>Travel Estimate: {event.aiTravelBuffer || "None"}</span></p>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-xs uppercase tracking-widest font-semibold text-black/40 mb-4">AI Prep Notes</h3>
                    <p className="border-l-2 border-black/10 pl-4 py-1 text-black/80 font-serif italic text-sm">
                      {event.aiPrepSuggestion ? `"${event.aiPrepSuggestion}"` : '"Routine schedule block. No executive briefing required."'}
                    </p>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
           ))}
        </div>
      </div>

      {/* To-Do List */}
      <div className="flex-1 flex flex-col min-h-0">
        <h2 className="font-heading text-2xl font-light tracking-tight mb-6 text-black">Tasks</h2>
        <div className="flex-1 overflow-y-auto border-t border-black/10 pt-6 space-y-4 pr-4">
          
          {tasks.length === 0 ? (
             <p className="text-black/40 text-sm italic font-serif">All clear. No pending tasks.</p>
          ) : tasks.map((task) => (
            <Sheet key={task.id}>
              <SheetTrigger className="w-full text-left">
                <div className="flex flex-col gap-2 cursor-pointer group">
                  <div className="flex items-start justify-between">
                    <span onClick={() => toggleTask(task.id)} className={`text-lg group-hover:underline decoration-1 underline-offset-4 ${task.completed ? "line-through text-black/40" : "text-black"}`}>{task.title}</span>
                    <span className="border border-black px-2 py-0.5 text-[10px] font-bold tracking-widest uppercase">[{task.context}]</span>
                  </div>
                  <p className="text-black/60 text-sm line-clamp-1">Action required.</p>
                </div>
              </SheetTrigger>
              <SheetContent side="right" className="w-[400px] sm:w-[540px] border-l border-black bg-white p-12 shadow-none sm:max-w-none text-black">
                <SheetHeader className="mb-12">
                  <SheetTitle className="font-heading text-4xl font-light tracking-tighter text-black">{task.title}</SheetTitle>
                  <SheetDescription className="text-black/60 pt-4 text-base">
                    Associated contexts: <span className="text-black border border-black/20 px-2 py-0.5 text-xs font-bold uppercase tracking-widest ml-2">[{task.context}]</span>
                  </SheetDescription>
                </SheetHeader>
                <div className="space-y-8">
                  <p className="text-sm uppercase tracking-widest font-semibold text-black/40">Status: {task.completed ? "COMPLETED" : "PENDING"}</p>
                </div>
              </SheetContent>
            </Sheet>
          ))}

        </div>
      </div>
      
      {/* Groceries */}
      <div className="flex-1 flex flex-col min-h-0">
        <h2 className="font-heading text-2xl font-light tracking-tight mb-6 text-black">Provisions</h2>
        <div className="flex-1 overflow-y-auto border-t border-black/10 pt-6 space-y-4">
          {groceries.length === 0 ? (
             <p className="text-black/40 text-sm italic font-serif">Inventory is fully stocked.</p>
          ) : groceries.map((item) => (
             <div key={item.id} className="flex items-center gap-4">
               <div className="w-1.5 h-1.5 bg-black shrink-0" />
               <span className="text-black text-sm uppercase tracking-widest font-medium">{item.name}</span>
             </div>
          ))}
        </div>
      </div>
      
    </div>
  )
}
