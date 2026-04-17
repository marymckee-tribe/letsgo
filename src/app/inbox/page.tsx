"use client"

import { useHub } from "@/lib/store"
import { useState } from "react"
import { Paperclip, Inbox as InboxIcon, User, Activity } from "lucide-react"

export default function InboxPage() {
  const { emails, actOnEmailAction, dismissEmailAction } = useHub()
  const [selectedId, setSelectedId] = useState<string | null>(emails[0]?.id || null)

  const activeEmail = emails.find(e => e.id === selectedId)

  return (
    <main className="flex-1 w-full bg-[#f8f8f8] text-foreground flex flex-col p-8 lg:p-16 overflow-hidden h-[calc(100vh-6rem)]">
      <div className="mx-auto max-w-[1600px] w-full h-full flex flex-col bg-white border border-border shadow-[0_20px_60px_-15px_rgba(0,0,0,0.05)]">

        <div className="flex h-full min-h-0">

          {/* LEFT MASTER LIST */}
          <div className="w-1/3 flex flex-col border-r border-border bg-white min-w-[320px] max-w-md shrink-0">
            <div className="p-8 border-b border-border shrink-0">
              <h1 className="font-heading text-4xl tracking-tighter mb-2">Triage</h1>
              <p className="text-foreground/40 text-[10px] uppercase tracking-[0.2em] font-medium">Approval Queue Active</p>
            </div>

            <div className="flex-1 overflow-y-auto w-full">
              {emails.length === 0 ? (
                 <div className="p-8 text-foreground/40 italic font-serif text-sm">Inbox Zero Achieved.</div>
              ) : emails.map(email => {
                const isSelected = selectedId === email.id;
                return (
                  <button
                    key={email.id}
                    onClick={() => setSelectedId(email.id)}
                    className={`w-full text-left p-6 border-b border-border/50 transition-all
                      ${isSelected ? 'bg-foreground text-background' : 'hover:bg-muted bg-white text-foreground'}`}
                  >
                    <div className="flex justify-between items-center mb-2 gap-4">
                       <span className={`text-[10px] font-bold uppercase tracking-widest truncate ${isSelected ? 'text-background/60' : 'text-foreground/40'}`}>{email.sender}</span>
                       {email.attachments?.length > 0 && <Paperclip className={`w-3 h-3 shrink-0 ${isSelected ? 'text-background/60' : 'text-foreground/40'}`} />}
                    </div>
                    <h3 className={`font-medium mb-2 truncate ${isSelected ? 'text-background' : 'text-foreground/90'}`}>{email.subject}</h3>
                    <p className={`text-xs font-serif line-clamp-2 leading-relaxed ${isSelected ? 'text-background/60' : 'text-muted-foreground'}`}>
                      {email.snippet}
                    </p>

                    {email.suggestedActions?.some(a => a.status === 'PENDING') && (
                      <div className="mt-4 flex gap-2">
                        <span className={`text-[8px] font-bold uppercase py-1 px-2 tracking-widest flex items-center gap-1
                          ${isSelected ? 'bg-background/20 text-background' : 'bg-foreground/10 text-foreground'}
                        `}>
                          <Activity className="w-3 h-3" /> ACTION REQUIRED
                        </span>
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* RIGHT DETAIL READING PANE */}
          <div className="flex-1 flex flex-col bg-[#fdfdfd] min-w-0">
            {activeEmail ? (
              <div className="flex h-full min-h-0">

                 {/* Email Body */}
                 <div className="flex-1 flex flex-col border-r border-border overflow-y-auto">
                   <div className="p-8 lg:p-12 border-b border-border bg-white shrink-0">
                     <h2 className="font-heading text-4xl tracking-tighter mb-6">{activeEmail.subject}</h2>
                     <div className="flex items-center gap-4 text-xs font-mono text-muted-foreground">
                        <span className="flex items-center gap-2"><User className="w-4 h-4" /> {activeEmail.sender}</span>
                        <span>•</span>
                        <span>{new Date(activeEmail.date).toLocaleString()}</span>
                     </div>
                   </div>

                   <div className="p-8 lg:p-12 font-serif text-sm leading-[1.8] text-foreground/80 whitespace-pre-wrap flex-1 bg-white">
                      {activeEmail.fullBody || activeEmail.snippet}
                   </div>

                   {activeEmail.attachments?.length > 0 && (
                     <div className="p-8 lg:p-12 bg-muted shrink-0 border-t border-border">
                       <h4 className="text-[10px] uppercase font-bold tracking-widest text-foreground/40 mb-4">Attachments Extracted</h4>
                       <div className="flex flex-wrap gap-4">
                         {activeEmail.attachments.map((att, i) => (
                           <div key={i} className="bg-white border border-border px-4 py-3 flex items-center gap-3 text-xs font-medium cursor-pointer hover:border-foreground transition-colors">
                              <Paperclip className="w-4 h-4 text-muted-foreground shrink-0" />
                              <span className="truncate max-w-[200px]">{att.filename}</span>
                           </div>
                         ))}
                       </div>
                     </div>
                   )}
                 </div>

                 {/* AI Action Execution Sidebar */}
                 <div className="w-72 lg:w-80 shrink-0 bg-white flex flex-col p-6 lg:p-8 overflow-y-auto">
                    <h3 className="text-xs uppercase font-bold tracking-widest text-foreground/40 mb-8 border-b border-border pb-4">AI Sweep Insights</h3>

                    <p className="text-sm font-serif italic text-foreground/80 leading-relaxed mb-12 pl-4 border-l-2 border-border">
                      "{activeEmail.snippet}"
                    </p>

                    {(!activeEmail.suggestedActions || activeEmail.suggestedActions.length === 0) ? (
                      <p className="text-[10px] uppercase tracking-widest font-bold text-foreground/20 text-center py-12 border border-border/50">No Directives Found</p>
                    ) : (
                      <div className="flex flex-col gap-6">
                        {activeEmail.suggestedActions.map(action => (
                           <div key={action.id} className={`flex flex-col bg-white border ${action.status === 'PENDING' ? 'border-foreground' : 'border-border opacity-50 grayscale'} p-5 shadow-[4px_4px_0_rgba(0,0,0,0.05)] transition-all`}>

                             <div className="mb-6">
                               <span className="text-[10px] font-bold uppercase tracking-widest text-foreground/40 block mb-2">{action.type.replace('_', ' ')}</span>
                               <span className="text-sm font-medium leading-tight">{action.title}</span>
                               {(action.date || action.time) && (
                                 <span className="text-xs font-mono text-muted-foreground block mt-2">{action.time} • Day {action.date}</span>
                               )}
                             </div>

                             {action.status === 'PENDING' ? (
                               <div className="flex flex-col gap-2">
                                 <button onClick={() => actOnEmailAction(activeEmail.id, action.id)} className="w-full bg-foreground text-background text-[10px] font-bold uppercase tracking-widest py-3 hover:bg-foreground/80 transition-colors">Act</button>
                                 <button onClick={() => dismissEmailAction(activeEmail.id, action.id)} className="w-full border border-border text-muted-foreground text-[10px] uppercase font-bold tracking-widest hover:bg-muted transition-colors py-3">Skip</button>
                               </div>
                             ) : (
                               <span className="text-[10px] font-bold uppercase tracking-widest text-foreground/40 text-center bg-muted py-2 w-full block border border-border/50">Status: {action.status}</span>
                             )}

                           </div>
                        ))}
                      </div>
                    )}
                 </div>

              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-foreground/20 gap-4 bg-white/50">
                 <InboxIcon className="w-12 h-12" />
                 <span className="text-sm uppercase font-bold tracking-widest">Select Thread</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
