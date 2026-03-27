"use client"

import React, { createContext, useContext, useState, useEffect } from "react"
import { toast } from "sonner"
import { useAuth } from "@/lib/auth-provider"

export type CalendarEvent = {
  id: string
  title: string
  time: string
  date: number
  location?: string
  notes?: string           // undefined = not yet generated; string = cached (may be empty)
  fromEmail?: boolean
  aiTravelBuffer?: string | null
  aiPrepSuggestion?: string | null
}

export type Task = {
  id: string
  title: string
  context: string
  completed: boolean
  who?: string
}

export type GroceryItem = {
  id: string
  name: string
  checked?: boolean
}

export type EntityProfile = {
  id: string
  name: string
  type: "Adult" | "Child" | "Pet"
  currentContext: string
  preferences: string[]
  routines: string[]
  sizes: Record<string, string>
  medicalNotes: string
}

export type EmailAction = {
  id: string
  type: "CALENDAR_INVITE" | "TODO_ITEM" | "OTHER"
  title: string
  date?: number
  time?: string
  context?: string
  status: "PENDING" | "APPROVED" | "DISMISSED"
}

export type Email = {
  id: string
  subject: string
  sender: string
  snippet: string
  fullBody: string
  attachments: { filename: string, mimeType: string }[]
  suggestedActions: EmailAction[]
  date: number
}

interface HubState {
  events: CalendarEvent[]
  scheduleInsights: string[]
  tasks: Task[]
  groceries: GroceryItem[]
  emails: Email[]
  profiles: EntityProfile[]
  
  addEvent: (event: CalendarEvent) => void
  addTask: (task: Task) => void
  addGrocery: (item: GroceryItem) => void
  toggleTask: (id: string) => void
  actOnEmailAction: (emailId: string, actionId: string) => void
  dismissEmailAction: (emailId: string, actionId: string) => void
  setEventTitle: (id: string, title: string) => void
  setEventTime: (id: string, time: string) => void
  setEventLocation: (id: string, location: string) => void
  setEventNotes: (id: string, notes: string) => void
  toggleGrocery: (id: string) => void
}

const mockEvents: CalendarEvent[] = [
  { id: "1", title: "Gymnastics", time: "16:00", date: 20 },
  { id: "2", title: "Parent Teacher Conf.", time: "09:00", date: 24 }
]
const mockTasks: Task[] = [
  { id: "1", title: "Review Board Deck", context: "WORK", completed: false },
  { id: "2", title: "Approve Architecture Draft", context: "WORK", completed: false }
]
const mockGroceries: GroceryItem[] = [
  { id: "1", name: "Almond Milk" },
  { id: "2", name: "Coffee Beans" }
]
const mockEmails: Email[] = [
  { 
    id: "1", subject: "School Permission Slip", sender: "School Admin", snippet: "The school requires a signed waiver for the upcoming zoo field trip...", 
    fullBody: "Hello parents, don't forget the waiver for the zoo outting next week.", attachments: [{ filename: "waiver.pdf", mimeType: "application/pdf" }],
    suggestedActions: [{ id: "A1", type: "TODO_ITEM", title: "Sign Waiver", context: "FAMILY", status: "PENDING" }], date: Date.now() - 600000 
  }
]

const HubContext = createContext<HubState | undefined>(undefined)

const initialGroceries: GroceryItem[] = [
  { id: "1", name: "Milk" }
]

const initialProfiles: EntityProfile[] = [
  { id: "mary", name: "Mary", type: "Adult", currentContext: "Focused on the architecture phase for the Family OS. Organizing upcoming travel logistics.", preferences: ["V60 Coffee", "Window seats", "Minimalist aesthetics"], routines: ["Morning deep work 8-11am"], sizes: {}, medicalNotes: "" },
  { id: "doug", name: "Doug", type: "Adult", currentContext: "Preparing for Q2 board meetings.", preferences: ["Espresso", "Aisle seats"], routines: [], sizes: {}, medicalNotes: "" },
  { id: "ellie", name: "Ellie", type: "Child", currentContext: "Getting ready for middle school transition. Needs new gymnastics gear for the upcoming season.", preferences: ["Gymnastics", "Pasta"], routines: ["Tues/Thurs Gymnastics 4pm"], sizes: { "Shoe": "4 Youth", "Shirt": "Medium Youth" }, medicalNotes: "Peanut allergy" },
  { id: "annie", name: "Annie", type: "Child", currentContext: "Starting the new art program this week.", preferences: ["Painting", "Mac & Cheese"], routines: ["Wed Art Class 3:30pm"], sizes: { "Shoe": "2 Youth" }, medicalNotes: "" },
  { id: "ness", name: "Ness", type: "Pet", currentContext: "Due for annual vet checkup next month.", preferences: ["Salmon treats"], routines: ["Morning walk 7am", "Evening walk 6pm"], sizes: {}, medicalNotes: "Sensitive stomach" },
]

export function HubProvider({ children }: { children: React.ReactNode }) {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [scheduleInsights, setScheduleInsights] = useState<string[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [groceries, setGroceries] = useState<GroceryItem[]>(initialGroceries)
  const [emails, setEmails] = useState<Email[]>([])
  const [profiles, setProfiles] = useState<EntityProfile[]>(initialProfiles)
  const { accessToken } = useAuth()

  useEffect(() => {
    if (!accessToken) return;

    if (accessToken === "mock-token") {
      setEvents(mockEvents)
      setTasks(mockTasks)
      setGroceries(mockGroceries)
      setEmails(mockEmails)
      return
    }

    // Fetch live Calendar Events securely via AI Digest (Start of Day logic handled in backend)
    const hydrateCalendar = async () => {
      try {
        const res = await fetch(`/api/calendar/digest`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ profiles: initialProfiles }) // Pass static profiles for prompt injection
        })
        const data = await res.json()
        if (data.error) {
          console.error("Calendar Sync:", JSON.stringify(data.error))
          toast("SYNC ERROR", { description: "Calendar API: " + (data.error.message || "Access denied") })
        } else if (data.events) {
          setEvents(data.events)
          setScheduleInsights(data.insights || [])
        }
      } catch (err) {
        toast("SYNC ERROR", { description: "Failed to pull live Calendar data." })
      }
    }

    // Fetch live Tasks securely
    const hydrateTasks = async () => {
      try {
        const res = await fetch(`https://tasks.googleapis.com/tasks/v1/users/@me/lists`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        })
        const data = await res.json()
        if (data.error) {
          console.error("Tasks Sync:", JSON.stringify(data.error))
          toast("SYNC ERROR", { description: "Tasks API: " + (data.error.message || "Access denied") })
        } else if (data.items && data.items.length > 0) {
          const listId = data.items[0].id
          const taskRes = await fetch(`https://tasks.googleapis.com/tasks/v1/lists/${listId}/tasks`, {
            headers: { Authorization: `Bearer ${accessToken}` }
          })
          const taskData = await taskRes.json()
          if (taskData.items) {
             const liveTasks = taskData.items.map((item: any) => ({
               id: item.id,
               title: item.title,
               context: "PERSONAL",
               completed: item.status === "completed"
             }))
             setTasks(liveTasks)
          }
        }
      } catch (err) {
        toast("SYNC ERROR", { description: "Failed to pull live Tasks data." })
      }
    }

    // Fetch live Gmail via AI Digest Route
    const hydrateEmails = async () => {
      try {
        const res = await fetch(`/api/inbox/digest`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}` }
        })
        const data = await res.json()
        if (data.error) {
          console.error("Gmail Sync:", JSON.stringify(data.error))
          toast("SYNC ERROR", { description: "Gmail API: " + (data.error.message || "Access denied") })
        } else if (data.emails) {
          setEmails(data.emails)
        }
      } catch (err) {
        toast("SYNC ERROR", { description: "Failed to pull live Inbox data." })
      }
    }

    hydrateCalendar()
    hydrateTasks()
    hydrateEmails()
  }, [accessToken])

  const addEvent = (event: CalendarEvent) => {
    setEvents(prev => prev.some(e => e.id === event.id) ? prev : [...prev, event])
    toast("ACTION CONFIRMED", { description: `Added event: ${event.title}` })
  }

  const setEventTitle = (id: string, title: string) => {
    setEvents(prev => prev.map(e => e.id === id ? { ...e, title } : e))
  }

  const setEventTime = (id: string, time: string) => {
    setEvents(prev => prev.map(e => e.id === id ? { ...e, time } : e))
  }

  const setEventLocation = (id: string, location: string) => {
    setEvents(prev => prev.map(e => e.id === id ? { ...e, location } : e))
  }

  const setEventNotes = (id: string, notes: string) => {
    setEvents(prev => prev.map(e => e.id === id ? { ...e, notes } : e))
  }

  const toggleGrocery = (id: string) => {
    setGroceries(prev => prev.map(g => g.id === id ? { ...g, checked: !g.checked } : g))
  }

  const addTask = (task: Task) => {
    setTasks(prev => prev.some(t => t.id === task.id) ? prev : [...prev, task])
    toast("ACTION CONFIRMED", { description: `Added task: ${task.title}` })
  }

  const addGrocery = (item: GroceryItem) => {
    setGroceries(prev => prev.some(g => g.id === item.id) ? prev : [...prev, item])
    toast("ACTION CONFIRMED", { description: `Added to provisions: ${item.name}` })
  }

  const toggleTask = (id: string) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, completed: !t.completed } : t))
  }

  const actOnEmailAction = (emailId: string, actionId: string) => {
    let actionItem: EmailAction | null = null;
    setEmails(prev => prev.map(e => {
      if (e.id === emailId) {
        return {
          ...e,
          suggestedActions: e.suggestedActions.map(a => {
            if (a.id === actionId) {
               actionItem = a;
               return { ...a, status: "APPROVED" }
            }
            return a;
          })
        }
      }
      return e;
    }))

    if (actionItem) {
      const act = actionItem as EmailAction;
      if (act.type === 'CALENDAR_INVITE') {
         addEvent({ id: Math.random().toString(), title: act.title, time: act.time || "12:00", date: act.date || 1, fromEmail: true })
      } else if (act.type === 'TODO_ITEM') {
         addTask({ id: Math.random().toString(), title: act.title, context: act.context || "PERSONAL", completed: false })
      }
    }
  }

  const dismissEmailAction = (emailId: string, actionId: string) => {
    setEmails(prev => prev.map(e => {
      if (e.id === emailId) {
        return { ...e, suggestedActions: e.suggestedActions.map(a => a.id === actionId ? { ...a, status: "DISMISSED" } : a) }
      }
      return e;
    }))
    toast("SYSTEM", { description: "Action dismissed." })
  }

  return (
    <HubContext.Provider value={{ events, scheduleInsights, tasks, groceries, emails, profiles, addEvent, addTask, addGrocery, toggleTask, actOnEmailAction, dismissEmailAction, setEventTitle, setEventTime, setEventLocation, setEventNotes, toggleGrocery }}>
      {children}
    </HubContext.Provider>
  )
}

export function useHub() {
  const context = useContext(HubContext)
  if (!context) throw new Error("useHub must be used within HubProvider")
  return context
}
