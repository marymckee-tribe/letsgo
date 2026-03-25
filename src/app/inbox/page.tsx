"use client"

import { useHub } from "@/lib/store"
import { useState } from "react"
import { Paperclip, Inbox as InboxIcon, User, Activity } from "lucide-react"

export default function InboxPage() {
  const { emails, actOnEmailAction, dismissEmailAction } = useHub()
  const [selectedId, setSelectedId] = useState<string | null>(emails[0]?.id || null)

  const activeEmail = emails.find(e => e.id === selectedId)

  return (
    <main className="flex-1 w-full bg-[#f8f8f8] text-black flex flex-col p-8 lg:p-16 overflow-hidden h-[calc(100vh-6rem)]">
      <div className="mx-auto max-w-[1600px] w-full h-full flex flex-col bg-white border border-black/10 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.05)]">
        
        <div className="flex h-full min-h-0">
          
          {/* LEFT MASTER LIST */}
          <div className="w-1/3 flex flex-col border-r border-black/10 bg-white min-w-[320px] max-w-md shrink-0">
            <div className="p-8 border-b border-black/10 shrink-0">
              <h1 className="font-heading text-4xl tracking-tighter mb-2">Triage</h1>
              <p className="text-black/40 text-[10px] uppercase tracking-[0.2em] font-medium">Approval Queue Active</p>
            </div>
            
            <div className="flex-1 overflow-y-auto w-full">
              {emails.length === 0 ? (
                 <div className="p-8 text-black/40 italic font-serif text-sm">Inbox Zero Achieved.</div>
              ) : emails.map(email => {
                const isSelected = selectedId === email.id;
                return (
                  <button 
                    key={email.id} 
                    onClick={() => setSelectedId(email.id)}
                    className={`w-full text-left p-6 border-b border-black/5 transition-all
                      ${isSelected ? 'bg-black text-white' : 'hover:bg-black/5 bg-white text-black'}`}
                  >
                    <div className="flex justify-between items-center mb-2 gap-4">
                       <span className={`text-[10px] font-bold uppercase tracking-widest truncate ${isSelected ? 'text-white/60' : 'text-black/40'}`}>{email.sender}</span>
                       {email.attachments?.length > 0 && <Paperclip className={`w-3 h-3 shrink-0 ${isSelected ? 'text-white/60' : 'text-black/40'}`} />}
                    </div>
                    <h3 className={`font-medium mb-2 truncate ${isSelected ? 'text-white' : 'text-black/90'}`}>{email.subject}</h3>
                    <p className={`text-xs font-serif line-clamp-2 leading-relaxed ${isSelected ? 'text-white/60' : 'text-black/60'}`}>
                      {email.snippet}
                    </p>
                    
                    {email.suggestedActions?.some(a => a.status === 'PENDING') && (
                      <div className="mt-4 flex gap-2">
                        <span className={`text-[8px] font-bold uppercase py-1 px-2 tracking-widest flex items-center gap-1
                          ${isSelected ? 'bg-white/20 text-white' : 'bg-black/10 text-black'}
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
                 <div className="flex-1 flex flex-col border-r border-black/10 overflow-y-auto">
                   <div className="p-8 lg:p-12 border-b border-black/10 bg-white shrink-0">
                     <h2 className="font-heading text-4xl tracking-tighter mb-6">{activeEmail.subject}</h2>
                     <div className="flex items-center gap-4 text-xs font-mono text-black/60">
                        <span className="flex items-center gap-2"><User className="w-4 h-4" /> {activeEmail.sender}</span>
                        <span>•</span>
                        <span>{new Date(activeEmail.date).toLocaleString()}</span>
                     </div>
                   </div>

                   <div className="p-8 lg:p-12 font-serif text-sm leading-[1.8] text-black/80 whitespace-pre-wrap flex-1 bg-white">
                      {activeEmail.fullBody || activeEmail.snippet}
                   </div>

                   {activeEmail.attachments?.length > 0 && (
                     <div className="p-8 lg:p-12 bg-black/5 shrink-0 border-t border-black/10">
                       <h4 className="text-[10px] uppercase font-bold tracking-widest text-black/40 mb-4">Attachments Extracted</h4>
                       <div className="flex flex-wrap gap-4">
                         {activeEmail.attachments.map((att, i) => (
                           <div key={i} className="bg-white border border-black/20 px-4 py-3 flex items-center gap-3 text-xs font-medium cursor-pointer hover:border-black transition-colors">
                              <Paperclip className="w-4 h-4 text-black/60 shrink-0" />
                              <span className="truncate max-w-[200px]">{att.filename}</span>
                           </div>
                         ))}
                       </div>
                     </div>
                   )}
                 </div>

                 {/* AI Action Execution Sidebar */}
                 <div className="w-72 lg:w-80 shrink-0 bg-white flex flex-col p-6 lg:p-8 overflow-y-auto">
                    <h3 className="text-xs uppercase font-bold tracking-widest text-black/40 mb-8 border-b border-black/10 pb-4">AI Sweep Insights</h3>
                    
                    <p className="text-sm font-serif italic text-black/80 leading-relaxed mb-12 pl-4 border-l-2 border-black/20">
                      "{activeEmail.snippet}"
                    </p>

                    {(!activeEmail.suggestedActions || activeEmail.suggestedActions.length === 0) ? (
                      <p className="text-[10px] uppercase tracking-widest font-bold text-black/20 text-center py-12 border border-black/5">No Directives Found</p>
                    ) : (
                      <div className="flex flex-col gap-6">
                        {activeEmail.suggestedActions.map(action => (
                           <div key={action.id} className={`flex flex-col bg-white border ${action.status === 'PENDING' ? 'border-black' : 'border-black/10 opacity-50 grayscale'} p-5 shadow-[4px_4px_0_rgba(0,0,0,0.05)] transition-all`}>
                             
                             <div className="mb-6">
                               <span className="text-[10px] font-bold uppercase tracking-widest text-black/40 block mb-2">{action.type.replace('_', ' ')}</span>
                               <span className="text-sm font-medium leading-tight">{action.title}</span>
                               {(action.date || action.time) && (
                                 <span className="text-xs font-mono text-black/60 block mt-2">{action.time} • Day {action.date}</span>
                               )}
                             </div>

                             {action.status === 'PENDING' ? (
                               <div className="flex flex-col gap-2">
                                 <button onClick={() => actOnEmailAction(activeEmail.id, action.id)} className="w-full bg-black text-white text-[10px] font-bold uppercase tracking-widest py-3 hover:bg-black/80 transition-colors">Act</button>
                                 <button onClick={() => dismissEmailAction(activeEmail.id, action.id)} className="w-full border border-black/20 text-black/60 text-[10px] uppercase font-bold tracking-widest hover:bg-black/5 transition-colors py-3">Skip</button>
                               </div>
                             ) : (
                               <span className="text-[10px] font-bold uppercase tracking-widest text-black/40 text-center bg-black/5 py-2 w-full block border border-black/5">Status: {action.status}</span>
                             )}

                           </div>
                        ))}
                      </div>
                    )}
                 </div>

              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-black/20 gap-4 bg-white/50">
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
