// @ts-nocheck
"use client"

import { useChat } from "@ai-sdk/react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Send, ChevronUp, ChevronDown } from "lucide-react"
import { useHub } from "@/lib/store"
import { db, isMock } from "@/lib/firebase"
import { collection, addDoc } from "firebase/firestore"
import { useState, useRef, useEffect } from "react"

export function BrainDump({ className }: { className?: string }) {
  const hubState = useHub()
  const [isExpanded, setIsExpanded] = useState(false)
  const [localInput, setLocalInput] = useState("")
  const scrollRef = useRef<HTMLDivElement>(null)
  const executedCommands = useRef<Set<string>>(new Set())
  
  const pushLog = async (msg: string) => {
    if (isMock) return;
    try {
      await addDoc(collection(db, "activity_logs"), { message: msg, timestamp: Date.now() })
    } catch(e) {}
  }
  
  const chatState = useChat({
    body: {
      contextState: {
        events: hubState.events,
        tasks: hubState.tasks,
        groceries: hubState.groceries,
        profiles: hubState.profiles,
        emails: hubState.emails
      }
    }
  })

  const { messages, sendMessage } = chatState;

  // Auto-scroll and regex state engine
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
    if (messages.length > 0 && !isExpanded) {
      setIsExpanded(true)
    }

    // Inline Agent Payload Engine
    const lastMsg = messages[messages.length - 1];
    if (lastMsg && lastMsg.role === 'assistant' && !executedCommands.current.has(lastMsg.id)) {
      const match = lastMsg.content.match(/```json\n(\[[\s\S]*?\])\n```/);
      if (match) {
        try {
          const cmds = JSON.parse(match[1]);
          executedCommands.current.add(lastMsg.id); // guard before executing

          cmds.forEach((cmd: any) => {
            if (cmd.action === 'create_gcal_event') {
              hubState.addEvent({ id: Math.random().toString(), title: cmd.payload.title, time: cmd.payload.time, date: cmd.payload.date });
              pushLog(`Scheduled event: ${cmd.payload.title}`);
            }
            if (cmd.action === 'create_gtask') {
              hubState.addTask({ id: Math.random().toString(), title: cmd.payload.title, context: cmd.payload.context, completed: false });
              pushLog(`Created task: ${cmd.payload.title} [${cmd.payload.context}]`);
            }
            if (cmd.action === 'update_grocery_list') {
              hubState.addGrocery({ id: Math.random().toString(), name: cmd.payload.name });
              pushLog(`Added provision: ${cmd.payload.name}`);
            }
          });
        } catch(e) {}
      }
    }
  }, [messages])

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!localInput || localInput.trim() === '') return
    setIsExpanded(true)
    sendMessage({ role: 'user', content: localInput })
    setLocalInput('')
  }

  return (
    <div className={`flex flex-col gap-4 relative bg-white px-8 py-6 -mx-8 sm:mx-0 sm:px-0 sm:py-0 transition-all ${className}`}>
      <div className="flex justify-between items-center cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
        <h2 className="font-heading text-lg font-light tracking-tight text-black flex items-center gap-4">
          Terminal
          {messages.length > 0 && !isExpanded && (
             <span className="text-black/40 text-[10px] uppercase font-mono tracking-widest leading-none mt-1 line-clamp-1">
               {messages[messages.length - 1].role === 'assistant' ? messages[messages.length - 1].content : "Processing..."}
             </span>
          )}
        </h2>
        <button className="text-black/20 hover:text-black transition-colors shrink-0">
          {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
        </button>
      </div>

      {isExpanded && messages.length > 0 && (
        <div ref={scrollRef} className="flex flex-col gap-6 max-h-[50vh] overflow-y-auto py-8 border-b border-black/5 mb-2 pr-4 scroll-smooth">
          {messages.map((m, i) => {
            const displayStr = m.content.replace(/```json\n\[[\s\S]*?\]\n```/g, '').trim();
            if (!displayStr) return null;

            return (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] sm:max-w-[70%] p-5 text-sm leading-relaxed ${m.role === 'user' ? 'bg-black/5 text-black' : 'bg-transparent border-l-2 border-black pl-6 text-black/80 font-serif'}`}>
                  {displayStr}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <form className="flex gap-4 items-center" onSubmit={onSubmit}>
        <Input 
          value={localInput}
          onChange={(e) => setLocalInput(e.target.value)}
          placeholder={isExpanded ? "Message Chief of Staff..." : "Awaiting directive..."} 
          className="flex-1 border-0 border-b border-black/20 rounded-none px-0 text-lg bg-transparent focus-visible:ring-0 focus-visible:border-black transition-colors shadow-none" 
        />
        <Button type="submit" size="icon" className="rounded-none bg-black text-white hover:bg-black/80 w-12 h-12 shadow-none border-0 shrink-0">
          <Send className="w-5 h-5" />
        </Button>
      </form>
    </div>
  )
}
