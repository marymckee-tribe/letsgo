"use client"

import { useHub } from "@/lib/store"
import { Clock, MapPin, AlertTriangle } from "lucide-react"

export default function CalendarPage() {
  const { events, scheduleInsights } = useHub()

  return (
    <main className="flex-1 w-full bg-white text-black flex flex-col p-12 lg:p-24 overflow-hidden h-[calc(100vh-6rem)]">
      <div className="mx-auto max-w-[1600px] w-full h-full flex flex-col">
        
        <div className="flex justify-between items-end mb-12 shrink-0">
          <div>
            <h1 className="font-heading text-6xl font-light tracking-tighter text-black mb-2">Calendar</h1>
            <p className="text-black/60 text-sm uppercase tracking-widest font-mono">Aggregated Household Timeline</p>
          </div>
          <button className="border border-black px-6 py-2 text-xs uppercase tracking-widest hover:bg-black hover:text-white transition-colors">
            Sync Calendar
          </button>
        </div>

        <div className="flex flex-1 min-h-0 gap-16">
          {/* Timeline View */}
          <div className="flex-1 flex flex-col border-t border-black/10 pt-8 overflow-y-auto pr-8">
            
            {scheduleInsights.length > 0 && (
              <div className="mb-12 bg-red-50/50 border border-red-200 p-6 flex items-start gap-4">
                <AlertTriangle className="w-5 h-5 text-red-800 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-xs uppercase tracking-widest font-bold text-red-900 mb-2">AI Optimization Warnings</h3>
                  <ul className="space-y-1">
                    {scheduleInsights.map((insight, i) => (
                      <li key={i} className="text-sm font-serif italic text-red-800">"{insight}"</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            <div className="space-y-12">
              {events.length === 0 ? (
                <p className="text-black/40 italic font-serif">No calendar blocks scheduled.</p>
              ) : (
                <div className="relative border-l border-black/10 ml-8 pl-12 space-y-16 pb-12">
                  {events.map((event) => (
                    <div key={event.id} className="relative group cursor-pointer">
                      
                      {/* Timeline Node */}
                      <div className="absolute -left-[53px] top-1 w-3 h-3 bg-white border border-black group-hover:bg-black transition-colors" />

                      <div className="flex justify-between items-start gap-8">
                        <div>
                           <span className="text-black/40 text-xs font-mono font-bold tracking-widest uppercase block mb-2">{event.time}</span>
                           <h2 className="font-heading text-4xl font-light tracking-tighter text-black mb-4 group-hover:underline underline-offset-4 decoration-1">{event.title}</h2>
                           
                           {event.location && event.location !== "TBD" && (
                             <p className="flex items-center gap-3 text-sm text-black/60 mb-2">
                               <MapPin className="w-4 h-4" /> {event.location}
                             </p>
                           )}

                           {event.aiTravelBuffer && (
                             <p className="flex items-center gap-3 text-sm text-black/60 font-medium">
                               <Clock className="w-4 h-4" /> AI Estimate: {event.aiTravelBuffer}
                             </p>
                           )}
                        </div>
                        
                        {event.aiPrepSuggestion && (
                          <div className="w-72 shrink-0 bg-black/5 p-4 border-l-2 border-black/20 group-hover:border-black transition-colors">
                            <span className="text-xs uppercase tracking-widest font-semibold text-black/40 block mb-2">Executive Prep</span>
                            <p className="text-sm font-serif italic text-black/80">"{event.aiPrepSuggestion}"</p>
                          </div>
                        )}
                      </div>

                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </main>
  )
}
