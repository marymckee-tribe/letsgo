"use client"

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Dialog, DialogContent, DialogTrigger, DialogTitle } from "@/components/ui/dialog"
import { Paperclip } from "lucide-react"
import { useHub } from "@/lib/store"
import { SignalPill } from "@/components/ui/signal-pill"

export function Bouncer({ className }: { className?: string }) {
  const { emails, actOnEmailAction, dismissEmailAction } = useHub()
  
  return (
    <div className={`flex flex-col h-full ${className}`}>
      <div className="flex items-end justify-between mb-8">
        <h2 className="font-heading text-4xl font-light tracking-tighter text-foreground">Inbox</h2>
        <span className="text-muted-foreground text-xs uppercase tracking-widest pb-1">3 Accounts Active</span>
      </div>

      <div className="flex-1 overflow-y-auto space-y-6 pr-4">
        <Accordion className="w-full">
           {emails.length === 0 ? (
              <p className="text-foreground/40 text-sm italic font-serif">Inbox zero achieved.</p>
           ) : emails.map(email => (
             <AccordionItem key={email.id} value={email.id} className="border border-border px-6 bg-card data-[state=open]:border-foreground transition-colors mb-4 group">
               <AccordionTrigger className="hover:no-underline py-6">
                  <div className="flex flex-col gap-2 text-left w-full">
                    <div className="flex items-center justify-between w-full">
                      <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground group-data-[state=open]:text-foreground">From: {email.sender}</span>
                      <span className="text-foreground/40 text-xs font-normal">Unread</span>
                    </div>
                    <div className="flex items-center justify-between w-full pr-4">
                      <h3 className="text-xl font-normal tracking-tight text-foreground truncate pr-4">{email.subject}</h3>
                      <SignalPill variant="neutral">[INBOX]</SignalPill>
                    </div>
                  </div>
               </AccordionTrigger>
               <AccordionContent className="pb-6">
                 <div className="pl-0 pt-4 border-t border-border">
                   <p className="text-sm text-foreground/80 leading-relaxed mb-6 font-serif italic border-l-2 border-border pl-4 py-1">
                     "{email.snippet}"
                   </p>

                   {email.suggestedActions && email.suggestedActions.length > 0 && (
                     <div className="flex flex-col gap-3 mt-8">
                       <span className="text-[10px] uppercase font-bold tracking-widest text-signal-ai mb-2">Pending AI Actions</span>
                       {email.suggestedActions.map(action => (
                         <div key={action.id} className={`flex items-center justify-between bg-signal-ai/8 p-4 border border-signal-ai/20 transition-opacity ${action.status !== 'PENDING' ? 'opacity-40 grayscale' : ''}`}>
                           <div className="flex flex-col gap-1">
                             <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{action.type.replace('_', ' ')}</span>
                             <span className="text-sm font-sans tracking-tight text-foreground font-medium">{action.title}</span>
                             {(action.date || action.time) && (
                               <span className="text-xs font-mono text-muted-foreground mt-1">{action.time} • Day {action.date}</span>
                             )}
                           </div>

                           {action.status === 'PENDING' ? (
                             <div className="flex flex-col gap-2 shrink-0 ml-4">
                               <button onClick={(e) => { e.preventDefault(); actOnEmailAction(email.id, action.id) }} className="bg-foreground text-background px-5 py-2 text-[10px] uppercase font-bold tracking-widest hover:bg-foreground/80 transition-colors w-full">Act</button>
                               <button onClick={(e) => { e.preventDefault(); dismissEmailAction(email.id, action.id) }} className="border bg-background border-border px-5 py-2 text-[10px] uppercase font-bold tracking-widest hover:bg-muted transition-colors w-full">Dismiss</button>
                             </div>
                           ) : (
                             <span className="text-[10px] font-bold tracking-widest uppercase border border-border px-3 py-1 bg-background">{action.status}</span>
                           )}
                         </div>
                       ))}
                     </div>
                   )}
                 </div>
               </AccordionContent>
             </AccordionItem>
           ))}
        </Accordion>
      </div>
    </div>
  )
}
