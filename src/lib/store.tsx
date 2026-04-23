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
  knownDomains?: string[]
  knownSenders?: string[]
}

export type SenderIdentity = {
  personId?: string
  orgName?: string
  confidence: "low" | "medium" | "high"
}

export type Attachment = {
  id: string
  filename: string
  mimeType: string
  size: number
}

export type EmailActionType = "CALENDAR_EVENT" | "TODO" | "NEEDS_REPLY"

export type EmailActionStatus =
  | "PROPOSED"
  | "EDITING"
  | "WRITING"
  | "COMMITTED"
  | "DISMISSED"
  | "FAILED"

export type EmailAction = {
  id: string
  type: EmailActionType
  title: string
  date?: number
  time?: string
  context?: string
  sourceQuote: string
  confidence: "low" | "medium" | "high"
  status: EmailActionStatus
  googleId?: string
}

export type EmailClassification =
  | "CALENDAR_EVENT"
  | "TODO"
  | "NEEDS_REPLY"
  | "WAITING_ON"
  | "FYI"
  | "NEWSLETTER"

export type EmailHubStatus = "UNREAD" | "READ" | "CLEARED"

// Map legacy server action type strings to new EmailActionType names
const mapActionType = (raw: string): EmailActionType => {
  if (raw === 'CALENDAR_INVITE' || raw === 'CALENDAR_EVENT') return 'CALENDAR_EVENT'
  if (raw === 'TODO_ITEM' || raw === 'TODO') return 'TODO'
  return 'NEEDS_REPLY'
}

// Map legacy server status strings to new EmailActionStatus names
const mapActionStatus = (raw: string | undefined): EmailActionStatus => {
  if (raw === 'APPROVED' || raw === 'COMMITTED') return 'COMMITTED'
  if (raw === 'DISMISSED') return 'DISMISSED'
  return 'PROPOSED'
}

export type Email = {
  id: string
  accountId?: string
  accountEmail?: string
  subject: string
  sender: string
  senderIdentity?: SenderIdentity
  classification: EmailClassification
  snippet: string
  fullBody: string
  attachments: Attachment[]
  suggestedActions: EmailAction[]
  date: number
  hubStatus: EmailHubStatus
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
  setEventTitle: (id: string, title: string) => void
  setEventTime: (id: string, time: string) => void
  setEventLocation: (id: string, location: string) => void
  setEventNotes: (id: string, notes: string) => void
  toggleGrocery: (id: string) => void
  appendKnownDomain: (profileId: string, domain: string) => Promise<void>
}

const HubContext = createContext<HubState | undefined>(undefined)

const initialGroceries: GroceryItem[] = [
  { id: "1", name: "Milk" }
]

export function HubProvider({ children }: { children: React.ReactNode }) {
  const [additionalEvents, setAdditionalEvents] = useState<CalendarEvent[]>([])
  const [scheduleInsights] = useState<string[]>([])
  const [additionalTasks, setAdditionalTasks] = useState<Task[]>([])
  const [groceries, setGroceries] = useState<GroceryItem[]>(initialGroceries)
  const [emailOverrides, setEmailOverrides] = useState<Map<string, EmailAction[]>>(new Map())
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

  const { data: profilesData, error: profilesError } = trpc.profiles.list.useQuery(undefined, {
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

  useEffect(() => {
    if (profilesError) {
      toast("SYNC ERROR", { description: "Profiles: " + profilesError.message })
    }
  }, [profilesError])

  // --- Derived state via useMemo ---

  const serverEvents = useMemo<CalendarEvent[]>(() => {
    if (!calendarData?.events) return []
    return calendarData.events.map((e) => {
      const start = e.start ?? ''
      const isAllDay = !start.includes('T')
      const startDate = new Date(start)
      const time = isAllDay
        ? 'All day'
        : startDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true })
      return {
        id: e.id,
        title: e.title ?? '',
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
    return tasksData.tasks.map((t) => ({
      id: t.id,
      title: t.title ?? '',
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
    return inboxData.emails.map((e) => {
      return {
        id: e.id,
        accountId: (e as { accountId?: string }).accountId,
        accountEmail: (e as { accountEmail?: string }).accountEmail,
        subject: e.subject,
        sender: e.sender,
        // TODO(P2 Task 10): classification/hubStatus come from the AI digest once the
        // server router is rewritten. Until then, every email defaults to FYI/UNREAD
        // regardless of true classification or Gmail read-state.
        classification: 'FYI' as EmailClassification,
        snippet: e.snippet,
        fullBody: (e as { fullBody?: string }).fullBody ?? '',
        attachments: [],
        date: (e as { date?: number }).date ?? 0,
        hubStatus: 'UNREAD' as EmailHubStatus,
        suggestedActions: emailOverrides.has(e.id)
          ? emailOverrides.get(e.id)!
          : e.suggestedActions.map((a) => ({
              id: a.id,
              type: mapActionType(a.type),
              title: a.title,
              date: a.date ?? undefined,
              time: a.time ?? undefined,
              context: a.context ?? undefined,
              sourceQuote: '',
              confidence: 'low' as const,
              status: mapActionStatus((a as { status?: string }).status),
            })),
      }
    })
  }, [inboxData, emailOverrides])

  const profiles = useMemo<EntityProfile[]>(() => {
    if (!profilesData?.profiles) return []
    return profilesData.profiles
  }, [profilesData])

  // --- Mutations ---

  const utils = trpc.useUtils()
  const learnDomainMutation = trpc.profiles.learnDomain.useMutation({
    onSuccess: () => utils.profiles.list.invalidate(),
    onError: (e) => toast("ERROR", { description: e.message }),
  })

  const appendKnownDomain = async (profileId: string, domain: string) => {
    await learnDomainMutation.mutateAsync({ profileId, domain })
  }

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

  return (
    <HubContext.Provider value={{ events, scheduleInsights, tasks, groceries, emails, profiles, addEvent, addTask, addGrocery, toggleTask, setEventTitle, setEventTime, setEventLocation, setEventNotes, toggleGrocery, appendKnownDomain }}>
      {children}
    </HubContext.Provider>
  )
}

export function useHub() {
  const context = useContext(HubContext)
  if (!context) throw new Error("useHub must be used within HubProvider")
  return context
}

export function useInboxEmails() {
  return trpc.inbox.digest.useQuery(undefined, { staleTime: 60_000 })
}

export function useClearEmail() {
  const utils = trpc.useUtils()
  return trpc.inbox.markCleared.useMutation({
    async onMutate({ emailId }) {
      await utils.inbox.digest.cancel()
      const previous = utils.inbox.digest.getData()
      utils.inbox.digest.setData(undefined, (old) => {
        if (!old) return old
        return {
          ...old,
          emails: old.emails.map((e) => (e.id === emailId ? { ...e, hubStatus: 'CLEARED' as const } : e)),
        }
      })
      return { previous }
    },
    onError(_err, _input, ctx) {
      if (ctx?.previous) utils.inbox.digest.setData(undefined, ctx.previous)
      toast('SYNC ERROR', { description: 'Could not clear email. Restored.' })
    },
    onSettled() {
      utils.inbox.digest.invalidate()
    },
  })
}

export function useRestoreEmail() {
  const utils = trpc.useUtils()
  return trpc.inbox.markUnread.useMutation({
    async onMutate({ id }) {
      await utils.inbox.digest.cancel()
      const previous = utils.inbox.digest.getData()
      utils.inbox.digest.setData(undefined, (old) => {
        if (!old) return old
        return {
          ...old,
          emails: old.emails.map((e) => (e.id === id ? { ...e, hubStatus: 'UNREAD' as const } : e)),
        }
      })
      return { previous }
    },
    onError(_err, _input, ctx) {
      if (ctx?.previous) utils.inbox.digest.setData(undefined, ctx.previous)
      toast('SYNC ERROR', { description: 'Could not restore email.' })
    },
    onSettled() {
      utils.inbox.digest.invalidate()
    },
  })
}
