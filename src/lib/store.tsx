"use client"

import React, { createContext, useContext, useState, useEffect, useMemo } from "react"
import { toast } from "sonner"
import { useAuth } from "@/lib/auth-provider"
import { trpc } from "@/lib/trpc/client"

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
  profileId?: string | null
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
  accountId?: string
  accountEmail?: string
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
  const [additionalEvents, setAdditionalEvents] = useState<CalendarEvent[]>([])
  const [scheduleInsights] = useState<string[]>([])
  const [additionalTasks, setAdditionalTasks] = useState<Task[]>([])
  const [groceries, setGroceries] = useState<GroceryItem[]>(initialGroceries)
  const [emailOverrides, setEmailOverrides] = useState<Map<string, EmailAction[]>>(new Map())
  const [profiles] = useState<EntityProfile[]>(initialProfiles)
  const { user, loading } = useAuth()

  // --- tRPC queries ---

  const { data: calendarData, error: calendarError } = trpc.calendar.list.useQuery(undefined, {
    enabled: !loading && !!user,
  })

  const { data: tasksData, error: tasksError } = trpc.tasks.list.useQuery(undefined, {
    enabled: !loading && !!user,
  })

  const { data: inboxData, error: inboxError } = trpc.inbox.digest.useQuery(undefined, {
    enabled: !loading && !!user,
  })

  // --- Error toasts ---

  useEffect(() => {
    if (calendarError) {
      toast("SYNC ERROR", { description: "Calendar: " + calendarError.message })
    }
  }, [calendarError])

  useEffect(() => {
    if (tasksError) {
      toast("SYNC ERROR", { description: "Tasks: " + tasksError.message })
    }
  }, [tasksError])

  useEffect(() => {
    if (inboxError) {
      toast("SYNC ERROR", { description: "Gmail: " + inboxError.message })
    }
  }, [inboxError])

  // --- Derived state via useMemo ---

  const serverEvents = useMemo<CalendarEvent[]>(() => {
    if (!calendarData?.events) return []
    return (calendarData.events as unknown as { id: string; title: string; start: string; location?: string; profileId?: string | null }[]).map((e) => {
      const isAllDay = !e.start.includes('T')
      const startDate = new Date(e.start)
      const time = isAllDay
        ? 'All day'
        : startDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true })
      return {
        id: e.id,
        title: e.title,
        time,
        date: startDate.getDate(),
        location: e.location,
        fromEmail: false,
        profileId: e.profileId ?? null,
      }
    })
  }, [calendarData])

  // Merge server events with local overrides/additions; local state wins on ID collision
  const events = useMemo<CalendarEvent[]>(() => {
    const additionalIds = new Set(additionalEvents.map(e => e.id))
    // Server events not overridden locally
    const serverOnly = serverEvents.filter(e => !additionalIds.has(e.id))
    return [...serverOnly, ...additionalEvents]
  }, [serverEvents, additionalEvents])

  const serverTasks = useMemo<Task[]>(() => {
    if (!tasksData?.tasks) return []
    return (tasksData.tasks as unknown as { id: string; title: string; completed: boolean }[]).map((t) => ({
      id: t.id,
      title: t.title,
      context: 'PERSONAL',
      completed: t.completed,
    }))
  }, [tasksData])

  // Merge server tasks with locally-added tasks; apply local toggle overrides
  const [taskToggles, setTaskToggles] = useState<Map<string, boolean>>(new Map())

  const tasks = useMemo<Task[]>(() => {
    const serverIds = new Set(serverTasks.map(t => t.id))
    const localOnly = additionalTasks.filter(t => !serverIds.has(t.id))
    const allTasks = [...serverTasks, ...localOnly]
    return allTasks.map(t =>
      taskToggles.has(t.id) ? { ...t, completed: taskToggles.get(t.id)! } : t
    )
  }, [serverTasks, additionalTasks, taskToggles])

  const emails = useMemo<Email[]>(() => {
    if (!inboxData?.emails) return []
    return inboxData.emails.map((e) => ({
      id: e.id,
      accountId: (e as { accountId?: string }).accountId,
      accountEmail: (e as { accountEmail?: string }).accountEmail,
      subject: e.subject,
      sender: e.sender,
      snippet: e.snippet,
      fullBody: (e as { fullBody?: string }).fullBody ?? '',
      attachments: [],
      date: (e as { date?: number }).date ?? 0,
      suggestedActions: emailOverrides.has(e.id)
        ? emailOverrides.get(e.id)!
        : e.suggestedActions.map((a) => ({
            id: a.id,
            type: a.type as "CALENDAR_INVITE" | "TODO_ITEM" | "OTHER",
            title: a.title,
            date: a.date ?? undefined,
            time: a.time ?? undefined,
            context: a.context ?? undefined,
            status: (a as { status?: "PENDING" | "APPROVED" | "DISMISSED" }).status ?? "PENDING",
          })),
    }))
  }, [inboxData, emailOverrides])

  // --- Mutations ---

  const addEvent = (event: CalendarEvent) => {
    setAdditionalEvents(prev => prev.some(e => e.id === event.id) ? prev : [...prev, event])
    toast("ACTION CONFIRMED", { description: `Added event: ${event.title}` })
  }

  const setEventTitle = (id: string, title: string) => {
    setAdditionalEvents(prev => {
      if (prev.some(e => e.id === id)) return prev.map(e => e.id === id ? { ...e, title } : e)
      const serverEvent = serverEvents.find(e => e.id === id)
      return serverEvent ? [...prev, { ...serverEvent, title }] : prev
    })
  }

  const setEventTime = (id: string, time: string) => {
    setAdditionalEvents(prev => {
      if (prev.some(e => e.id === id)) return prev.map(e => e.id === id ? { ...e, time } : e)
      const serverEvent = serverEvents.find(e => e.id === id)
      return serverEvent ? [...prev, { ...serverEvent, time }] : prev
    })
  }

  const setEventLocation = (id: string, location: string) => {
    setAdditionalEvents(prev => {
      if (prev.some(e => e.id === id)) return prev.map(e => e.id === id ? { ...e, location } : e)
      const serverEvent = serverEvents.find(e => e.id === id)
      return serverEvent ? [...prev, { ...serverEvent, location }] : prev
    })
  }

  const setEventNotes = (id: string, notes: string) => {
    // Notes can be set on any event (server or local). Store in additionalEvents if present,
    // otherwise add a stub to track notes for server-sourced events.
    setAdditionalEvents(prev => {
      const existing = prev.find(e => e.id === id)
      if (existing) {
        return prev.map(e => e.id === id ? { ...e, notes } : e)
      }
      // Find the server event and copy it in so we can track notes
      const serverEvent = serverEvents.find(e => e.id === id)
      if (serverEvent) {
        return [...prev, { ...serverEvent, notes }]
      }
      return prev
    })
  }

  const toggleGrocery = (id: string) => {
    setGroceries(prev => prev.map(g => g.id === id ? { ...g, checked: !g.checked } : g))
  }

  const addTask = (task: Task) => {
    setAdditionalTasks(prev => prev.some(t => t.id === task.id) ? prev : [...prev, task])
    toast("ACTION CONFIRMED", { description: `Added task: ${task.title}` })
  }

  const addGrocery = (item: GroceryItem) => {
    setGroceries(prev => prev.some(g => g.id === item.id) ? prev : [...prev, item])
    toast("ACTION CONFIRMED", { description: `Added to provisions: ${item.name}` })
  }

  const toggleTask = (id: string) => {
    setTaskToggles(prev => {
      const current = prev.get(id)
      // Find the current effective state
      const task = tasks.find(t => t.id === id)
      const currentCompleted = task?.completed ?? false
      const next = new Map(prev)
      next.set(id, current !== undefined ? !current : !currentCompleted)
      return next
    })
    // Also toggle in local list if it's a locally-added task
    setAdditionalTasks(prev => prev.map(t => t.id === id ? { ...t, completed: !t.completed } : t))
  }

  const actOnEmailAction = (emailId: string, actionId: string) => {
    let actionItem: EmailAction | null = null

    setEmailOverrides(prev => {
      const currentActions = prev.has(emailId)
        ? prev.get(emailId)!
        : (emails.find(e => e.id === emailId)?.suggestedActions ?? [])

      const updated = currentActions.map(a => {
        if (a.id === actionId) {
          actionItem = a
          return { ...a, status: "APPROVED" as const }
        }
        return a
      })

      const next = new Map(prev)
      next.set(emailId, updated)
      return next
    })

    if (actionItem) {
      const act = actionItem as EmailAction
      if (act.type === 'CALENDAR_INVITE') {
        addEvent({ id: Math.random().toString(), title: act.title, time: act.time || "12:00", date: act.date || 1, fromEmail: true })
      } else if (act.type === 'TODO_ITEM') {
        addTask({ id: Math.random().toString(), title: act.title, context: act.context || "PERSONAL", completed: false })
      }
    }
  }

  const dismissEmailAction = (emailId: string, actionId: string) => {
    setEmailOverrides(prev => {
      const currentActions = prev.has(emailId)
        ? prev.get(emailId)!
        : (emails.find(e => e.id === emailId)?.suggestedActions ?? [])

      const updated = currentActions.map(a =>
        a.id === actionId ? { ...a, status: "DISMISSED" as const } : a
      )

      const next = new Map(prev)
      next.set(emailId, updated)
      return next
    })
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
