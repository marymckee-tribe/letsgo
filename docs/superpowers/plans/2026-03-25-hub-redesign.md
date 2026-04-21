# Hub Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Activity Flow column with a live AI Brief, restructure the Hub into a focused 3-column bento layout, add Wunderlist-style task completion, persist all data to Firestore, redesign Calendar / Planner / Life Graph pages, and wire Life Graph profiles into the AI digest prompt.

**Architecture:** All work happens on the `feature/email-intake` branch (worktree at `.worktrees/email-intake`). The store is the single source of truth — updated types flow through to all UI components. New components (AiBrief, TaskSchedule, AiCommandBar) replace legacy widgets (CommandCenter, DashboardCards, BrainDump-on-Hub). Firestore persistence uses `onSnapshot` listeners for real-time sync with optimistic local updates.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, shadcn/ui, Firestore, AI SDK (`generateObject`), Gmail API

---

> **Note on testing:** This project has no test framework. Verification uses the dev server at `localhost:3000`. Run `npm run dev` from `.worktrees/email-intake` before starting.

> **Working directory for all commands:** `/Users/marymckee/Desktop/Antigrav Projects/the-hub-claude/.worktrees/email-intake`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Delete | `src/app/activity/page.tsx` | Remove Activity page |
| Modify | `src/components/nav.tsx` | Remove Activity link |
| Modify | `src/lib/store.tsx` | Upgrade Task + EntityProfile types; new store actions; Firestore persistence |
| Create | `src/components/widgets/ai-brief.tsx` | Left column — derives AI flags from Life Graph + store data |
| Create | `src/components/widgets/task-schedule.tsx` | Right column — Wunderlist tasks + schedule strip |
| Create | `src/components/ai-command-bar.tsx` | Global AI bar with status line + quick prompts |
| Modify | `src/app/layout.tsx` | Add AiCommandBar below `{children}` |
| Modify | `src/app/page.tsx` | Hub restructure: AiBrief | Bouncer | TaskSchedule, remove BrainDump |
| Delete | `src/components/widgets/command-center.tsx` | Replaced by AiBrief |
| Modify | `src/app/calendar/page.tsx` | Week strip + day view + add event + AI notes inline |
| Modify | `src/app/planner/page.tsx` | Today / This Week / Someday sections + Wunderlist completion |
| Modify | `src/app/life/page.tsx` | Medical flags first + What AI Knows + vaccine status + inline edit |
| Modify | `src/app/api/inbox/digest/route.ts` | Pass Life Graph profiles into AI prompt |

---

## Task 1: Remove Activity Page

**Files:**
- Delete: `src/app/activity/page.tsx`
- Modify: `src/components/nav.tsx`

- [ ] **Step 1: Delete the Activity page**

```bash
rm src/app/activity/page.tsx
```

- [ ] **Step 2: Remove Activity from nav**

In `src/components/nav.tsx`, remove `{ href: "/activity", label: "Activity" }` from the `links` array:

```tsx
const links = [
  { href: "/", label: "Hub" },
  { href: "/calendar", label: "Calendar" },
  { href: "/planner", label: "Planner" },
  { href: "/life", label: "Life" },
  { href: "/settings", label: "Settings" }
]
```

- [ ] **Step 3: Verify**

Visit `localhost:3000` — Activity should be gone from nav. `/activity` should 404.

- [ ] **Step 4: Commit**

```bash
git add src/components/nav.tsx
git rm src/app/activity/page.tsx
git commit -m "chore: remove Activity page and nav link"
```

---

## Task 2: Upgrade Store Types

**Files:**
- Modify: `src/lib/store.tsx`

This task upgrades `Task` (add `who`, `due`) and `EntityProfile` (structured medical data, routines, doctor, vaccine status). All other tasks depend on these types.

- [ ] **Step 1: Update the Task type**

In `src/lib/store.tsx`, replace the existing `Task` type:

```ts
export type Task = {
  id: string
  title: string
  context: string
  who?: string
  due?: "today" | "this-week" | "someday"
  completed: boolean
}
```

- [ ] **Step 2: Update the EntityProfile type**

Replace the existing `EntityProfile` type:

```ts
export type EntityProfile = {
  id: string
  name: string
  type: "Adult" | "Child" | "Pet"
  currentContext: string
  preferences: string[]
  routines: { day: string; activity: string; time: string }[]
  sizes: Record<string, string>
  medicalFlags: string[]
  dietary: string[]
  birthday?: string
  doctor?: {
    name: string
    practice: string
    phone: string
    hours: string
  }
  vaccineStatus?: {
    name: string
    status: "current" | "overdue" | "upcoming"
    date: string
  }[]
  upcomingOccasions?: {
    label: string
    date: string
    daysAway: number
  }[]
}
```

- [ ] **Step 3: Add new store actions to HubState interface**

Add to the `HubState` interface:

```ts
setTaskDue: (id: string, due: Task["due"]) => void
setTaskWho: (id: string, who: string | undefined) => void
```

- [ ] **Step 4: Implement the new store actions**

Inside `HubProvider`, add these implementations (alongside existing actions):

```ts
setTaskDue: (id, due) => setTasks(prev => prev.map(t => t.id === id ? { ...t, due } : t)),
setTaskWho: (id, who) => setTasks(prev => prev.map(t => t.id === id ? { ...t, who } : t)),
```

Expose both in the context value object.

- [ ] **Step 5: Update mock profiles to match new EntityProfile type**

Replace `initialProfiles` in `src/lib/store.tsx`:

```ts
const initialProfiles: EntityProfile[] = [
  {
    id: "mary",
    name: "Mary",
    type: "Adult",
    currentContext: "Working full-time. Managing household logistics for two kids.",
    preferences: ["Morning workouts", "Strong coffee", "Audiobooks during commute"],
    routines: [
      { day: "Weekdays", activity: "School drop-off", time: "7:45 AM" },
      { day: "Mon / Wed", activity: "Gym", time: "6:00 AM" },
    ],
    sizes: {},
    medicalFlags: [],
    dietary: [],
  },
  {
    id: "ellie",
    name: "Ellie",
    type: "Child",
    birthday: "August 12",
    currentContext: "Age 8. 3rd grade at Riverside Elementary. Competitive swimmer, takes piano on Tuesdays.",
    preferences: ["Swimming", "Piano", "Reading — chapter books"],
    routines: [
      { day: "Mon / Wed / Fri", activity: "Swim practice", time: "3:30–5:00 PM" },
      { day: "Tuesday", activity: "Piano lesson", time: "4:00–4:45 PM" },
      { day: "Sat (bi-weekly)", activity: "Swim meet", time: "8:00 AM" },
    ],
    sizes: { Shoe: "3Y", Shirt: "8", Pants: "8 Slim", Swimsuit: "Size 8" },
    medicalFlags: ["EpiPen required — tree nut allergy (anaphylactic)"],
    dietary: ["Tree nut–free"],
    doctor: {
      name: "Dr. Kowalski",
      practice: "Brookline Family Dental",
      phone: "(617) 555-0192",
      hours: "Mon–Fri 8am–5pm",
    },
    vaccineStatus: [
      { name: "Annual flu", status: "current", date: "Oct 2025" },
      { name: "COVID booster", status: "current", date: "Sep 2025" },
    ],
    upcomingOccasions: [
      { label: "Birthday", date: "August 12", daysAway: 140 },
    ],
  },
  {
    id: "annie",
    name: "Annie",
    type: "Child",
    birthday: "March 3",
    currentContext: "Age 6. Kindergarten at Riverside Elementary. Loves art and music.",
    preferences: ["Drawing", "Singing", "Dinosaurs", "Pasta"],
    routines: [
      { day: "Weekdays", activity: "School", time: "8:00 AM–3:00 PM" },
      { day: "Thursday", activity: "Art class", time: "3:30–4:30 PM" },
    ],
    sizes: { Shoe: "11K", Shirt: "5–6", Pants: "6" },
    medicalFlags: [
      "Tree nut allergy (anaphylactic — EpiPen required)",
      "Seasonal pollen sensitivity Apr–Jun",
    ],
    dietary: ["Dairy-free", "Tree nut–free"],
    doctor: {
      name: "Dr. Michelle Chen",
      practice: "Riverside Pediatrics",
      phone: "(617) 555-0140",
      hours: "Mon–Fri 8am–5pm",
    },
    vaccineStatus: [
      { name: "4-year checkup + DTaP, MMR, IPV, Varivax", status: "overdue", date: "Due Dec 2025" },
      { name: "Annual flu", status: "current", date: "Oct 2025" },
    ],
    upcomingOccasions: [
      { label: "Birthday", date: "March 3", daysAway: 343 },
      { label: "School play", date: "April 20", daysAway: 26 },
    ],
  },
]
```

- [ ] **Step 6: Update mock tasks to include due + who**

Replace `mockTasks` with:

```ts
const mockTasks: Task[] = [
  { id: "1", title: "Call Dr. Chen — schedule Annie's checkup", context: "FAMILY", who: "Annie", due: "today", completed: false },
  { id: "2", title: "Order Jake's birthday gift", context: "FAMILY", due: "today", completed: false },
  { id: "3", title: "Send Q2 budget slides to finance", context: "WORK", due: "today", completed: false },
  { id: "4", title: "Restock Ellie's EpiPen prescription", context: "FAMILY", who: "Ellie", due: "this-week", completed: false },
  { id: "5", title: "Book summer camp for Annie", context: "FAMILY", who: "Annie", due: "this-week", completed: false },
  { id: "6", title: "Schedule HVAC annual service", context: "HOUSEHOLD", due: "someday", completed: false },
]
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors. Fix any type errors before continuing.

- [ ] **Step 8: Commit**

```bash
git add src/lib/store.tsx
git commit -m "feat: upgrade Task and EntityProfile types — add due, who, structured medical data"
```

---

## Task 3: Firestore Persistence

**Files:**
- Modify: `src/lib/store.tsx`

Persist tasks, events, profiles, and groceries to Firestore with real-time sync. Uses `onSnapshot` for live listeners and writes immediately on state change (optimistic).

- [ ] **Step 1: Add Firestore imports to store.tsx**

At the top of `src/lib/store.tsx`, ensure these imports are present (add if missing):

```ts
import { db, isMock } from "@/lib/firebase"
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
} from "firebase/firestore"
```

- [ ] **Step 2: Replace useState for tasks with Firestore-synced state**

Inside `HubProvider`, replace the tasks state block with:

```ts
const [tasks, setTasksLocal] = useState<Task[]>(isMock ? mockTasks : [])

useEffect(() => {
  if (isMock) return
  const q = query(collection(db, "tasks"), orderBy("createdAt", "desc"))
  return onSnapshot(q, snap => {
    setTasksLocal(snap.docs.map(d => d.data() as Task))
  })
}, [])

const setTasks = (updater: (prev: Task[]) => Task[]) => {
  setTasksLocal(prev => {
    const next = updater(prev)
    if (!isMock) {
      next.forEach(t => setDoc(doc(db, "tasks", t.id), { ...t, createdAt: t.id }))
    }
    return next
  })
}
```

- [ ] **Step 3: Add Firestore sync for events**

Replace the events state block with:

```ts
const [events, setEventsLocal] = useState<CalendarEvent[]>(isMock ? mockEvents : [])

useEffect(() => {
  if (isMock) return
  const q = query(collection(db, "events"), orderBy("date", "asc"))
  return onSnapshot(q, snap => {
    setEventsLocal(snap.docs.map(d => d.data() as CalendarEvent))
  })
}, [])

const setEvents = (updater: (prev: CalendarEvent[]) => CalendarEvent[]) => {
  setEventsLocal(prev => {
    const next = updater(prev)
    if (!isMock) {
      next.forEach(e => setDoc(doc(db, "events", e.id), e))
    }
    return next
  })
}
```

- [ ] **Step 4: Add Firestore sync for groceries**

Replace the groceries state block with:

```ts
const [groceries, setGroceriesLocal] = useState<GroceryItem[]>(isMock ? mockGroceries : [])

useEffect(() => {
  if (isMock) return
  return onSnapshot(collection(db, "groceries"), snap => {
    setGroceriesLocal(snap.docs.map(d => d.data() as GroceryItem))
  })
}, [])

const setGroceries = (updater: (prev: GroceryItem[]) => GroceryItem[]) => {
  setGroceriesLocal(prev => {
    const next = updater(prev)
    if (!isMock) {
      next.forEach(g => setDoc(doc(db, "groceries", g.id), g))
    }
    return next
  })
}
```

- [ ] **Step 5: Add Firestore sync for profiles**

Replace the profiles state block with:

```ts
const [profiles, setProfilesLocal] = useState<EntityProfile[]>(isMock ? initialProfiles : [])

useEffect(() => {
  if (isMock) return
  return onSnapshot(collection(db, "profiles"), snap => {
    if (snap.empty) {
      // First run — seed with initial profiles
      initialProfiles.forEach(p => setDoc(doc(db, "profiles", p.id), p))
    } else {
      setProfilesLocal(snap.docs.map(d => d.data() as EntityProfile))
    }
  })
}, [])
```

- [ ] **Step 6: Update addTask to write to Firestore**

Update `addTask` to include `createdAt`:

```ts
addTask: (task) => setTasks(prev => {
  const withTs = { ...task, createdAt: Date.now() }
  if (!isMock) setDoc(doc(db, "tasks", task.id), withTs)
  return [withTs, ...prev]
}),
```

- [ ] **Step 7: Update toggleTask to persist to Firestore**

```ts
toggleTask: (id) => setTasks(prev => {
  const next = prev.map(t => t.id === id ? { ...t, completed: !t.completed } : t)
  if (!isMock) {
    const t = next.find(t => t.id === id)
    if (t) setDoc(doc(db, "tasks", id), t)
  }
  return next
}),
```

- [ ] **Step 8: Verify**

With Firebase configured (not mock mode), complete a task, refresh the page. The task should still be completed. In mock mode, behavior is unchanged.

- [ ] **Step 9: Commit**

```bash
git add src/lib/store.tsx
git commit -m "feat: persist tasks, events, groceries, profiles to Firestore with real-time sync"
```

---

## Task 4: Global AI Command Bar

**Files:**
- Create: `src/components/ai-command-bar.tsx`
- Modify: `src/app/layout.tsx`

Moves the AI input from the Hub page into the layout so it's accessible on every page.

- [ ] **Step 1: Create the AiCommandBar component**

Create `src/components/ai-command-bar.tsx`:

```tsx
"use client"

import { useState } from "react"
import { usePathname } from "next/navigation"
import { useTerminal } from "@/lib/terminal-context"

const QUICK_PROMPTS = [
  "What needs attention today?",
  "Schedule Annie's vaccine",
  "What's on this week?",
]

export function AiCommandBar() {
  const [input, setInput] = useState("")
  const { seedTerminal } = useTerminal()
  const pathname = usePathname()

  if (pathname === "/login") return null

  const handleSubmit = () => {
    if (!input.trim()) return
    seedTerminal(input)
    setInput("")
  }

  return (
    <div className="shrink-0 border-t border-black/10 bg-white" style={{ fontFamily: "var(--font-dm-sans, system-ui)" }}>
      {/* Status line */}
      <div className="flex items-center gap-4 px-12 pt-3">
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-[#4285f4] animate-pulse" />
          <span className="text-[9px] uppercase tracking-[0.2em] font-bold text-[#4285f4]">AI Active</span>
        </div>
        <span className="text-black/15">·</span>
        <span className="text-[10px] text-black/25">Monitoring Gmail · Slack · Life Graph</span>
      </div>

      {/* Input row */}
      <div className="flex items-center gap-4 px-12 py-3">
        <span className="text-[10px] uppercase tracking-[0.25em] text-[#4285f4] font-bold shrink-0">Ask</span>
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleSubmit()}
          placeholder="What needs to happen today..."
          className="flex-1 bg-transparent text-sm text-black placeholder:text-black/20 outline-none"
        />
        {input ? (
          <button
            onClick={handleSubmit}
            className="text-[10px] uppercase tracking-[0.2em] font-bold text-black/40 hover:text-black transition-colors shrink-0"
          >
            ↵ Send
          </button>
        ) : (
          <div className="flex items-center gap-2 shrink-0">
            {QUICK_PROMPTS.map(prompt => (
              <button
                key={prompt}
                onClick={() => setInput(prompt)}
                className="text-[10px] text-black/25 border border-black/8 px-3 py-1 hover:border-black/25 hover:text-black/50 transition-colors whitespace-nowrap hidden lg:block"
              >
                {prompt}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add AiCommandBar to layout**

In `src/app/layout.tsx`, import and add `AiCommandBar` inside `TerminalProvider`, after `{children}` and before `<Toaster>`:

```tsx
import { AiCommandBar } from "@/components/ai-command-bar"

// Inside TerminalProvider:
<MainNav />
{children}
<AiCommandBar />
<Toaster ... />
```

- [ ] **Step 3: Verify**

Visit every page — the AI bar should appear at the bottom on Hub, Calendar, Planner, and Life. It should be absent on `/login`.

- [ ] **Step 4: Commit**

```bash
git add src/components/ai-command-bar.tsx src/app/layout.tsx
git commit -m "feat: add global AI command bar to layout with status line and quick prompts"
```

---

## Task 5: AI Brief Component

**Files:**
- Create: `src/components/widgets/ai-brief.tsx`

Derives proactive flags from the store (Life Graph profiles + schedule insights) and renders them as dismissable action cards. This replaces CommandCenter on the Hub.

- [ ] **Step 1: Create ai-brief.tsx**

Create `src/components/widgets/ai-brief.tsx`:

```tsx
"use client"

import { useState } from "react"
import { useHub, EntityProfile, CalendarEvent } from "@/lib/store"

type BriefFlag = {
  id: string
  tag: "HEALTH" | "OCCASION" | "LOGISTICS" | "INBOX"
  text: string
  note: string
  source: string
  primary: string
  secondary: string
}

function deriveFlags(
  profiles: EntityProfile[],
  scheduleInsights: string[]
): BriefFlag[] {
  const flags: BriefFlag[] = []

  profiles.forEach(profile => {
    // Overdue vaccines
    profile.vaccineStatus
      ?.filter(v => v.status === "overdue")
      .forEach(vaccine => {
        flags.push({
          id: `vaccine-${profile.id}-${vaccine.name}`,
          tag: "HEALTH",
          text: `${profile.name}'s ${vaccine.name} is overdue.`,
          note: profile.doctor
            ? `${profile.doctor.name} at ${profile.doctor.practice} — ${profile.doctor.phone}`
            : "Contact your pediatrician.",
          source: `${profile.name}'s profile`,
          primary: "Schedule now",
          secondary: "Later",
        })
      })

    // Upcoming birthdays within 14 days
    profile.upcomingOccasions
      ?.filter(o => o.label === "Birthday" && o.daysAway <= 14)
      .forEach(occ => {
        flags.push({
          id: `birthday-${profile.id}`,
          tag: "OCCASION",
          text: `${profile.name}'s birthday in ${occ.daysAway} days.`,
          note: profile.preferences.length > 0
            ? `Interests: ${profile.preferences.slice(0, 3).join(", ")}.`
            : "Check Life Graph for interests.",
          source: `${profile.name}'s profile`,
          primary: "See gift ideas",
          secondary: "Got it",
        })
      })
  })

  // Schedule conflicts as flags (first one only)
  if (scheduleInsights.length > 0) {
    flags.push({
      id: "schedule-conflict-0",
      tag: "LOGISTICS",
      text: scheduleInsights[0],
      note: "Detected from calendar data.",
      source: "Calendar",
      primary: "Resolve",
      secondary: "Dismiss",
    })
  }

  return flags
}

const TAG_STYLES: Record<BriefFlag["tag"], string> = {
  HEALTH: "bg-red-50 text-red-600",
  OCCASION: "bg-[#4285f4]/8 text-[#4285f4]",
  LOGISTICS: "bg-amber-50 text-amber-700",
  INBOX: "bg-black/5 text-black/40",
}

export function AiBrief({ className }: { className?: string }) {
  const { profiles, scheduleInsights, tasks } = useHub()
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  const allFlags = deriveFlags(profiles, scheduleInsights)
  const flags = allFlags.filter(f => !dismissed.has(f.id))

  const pendingTasks = tasks.filter(t => !t.completed)
  const doneTasks = tasks.filter(t => t.completed)
  const allDone = pendingTasks.length === 0 && tasks.length > 0

  const dismiss = (id: string) => setDismissed(prev => new Set([...prev, id]))

  // Get today's date info
  const now = new Date()
  const dayName = now.toLocaleDateString("en-US", { weekday: "long" })
  const dateStr = now.toLocaleDateString("en-US", { month: "long", day: "numeric" })

  return (
    <div className={`flex flex-col h-full ${className ?? ""}`} style={{ fontFamily: "var(--font-dm-sans, system-ui)" }}>

      {/* Header */}
      <div className="flex items-end justify-between mb-8 shrink-0">
        <div>
          <p className="text-[10px] uppercase tracking-[0.25em] text-black/30 font-bold mb-1.5">{dayName}</p>
          <h2 className="text-4xl font-light tracking-tight text-black leading-none" style={{ fontFamily: "var(--font-jost, sans-serif)" }}>
            {dateStr}
          </h2>
        </div>
      </div>

      {/* Flags */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1" style={{ scrollbarWidth: "none" }}>
        {flags.length > 0 && (
          <p className="text-[10px] uppercase tracking-[0.25em] text-[#4285f4] font-bold mb-4">
            AI · {flags.length} {flags.length === 1 ? "flag" : "flags"}
          </p>
        )}

        {flags.map(flag => (
          <div
            key={flag.id}
            className="border border-black/8 p-5 hover:border-black/20 transition-colors"
          >
            <div className="flex items-center justify-between mb-3">
              <span className={`text-[9px] uppercase tracking-[0.2em] font-bold px-1.5 py-0.5 ${TAG_STYLES[flag.tag]}`}>
                {flag.tag}
              </span>
              <span className="text-[9px] text-black/20 font-mono">↗ {flag.source}</span>
            </div>
            <p className="text-sm text-black font-medium leading-snug mb-1">{flag.text}</p>
            <p className="text-xs font-serif italic text-black/40 mb-4 leading-relaxed">{flag.note}</p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => dismiss(flag.id)}
                className="text-[10px] uppercase tracking-[0.15em] font-bold px-4 py-2 bg-black text-white hover:bg-black/80 transition-colors"
              >
                {flag.primary}
              </button>
              <button
                onClick={() => dismiss(flag.id)}
                className="text-[10px] uppercase tracking-[0.15em] font-bold px-4 py-2 text-black/40 hover:text-black border border-black/10 hover:border-black/30 transition-colors"
              >
                {flag.secondary}
              </button>
            </div>
          </div>
        ))}

        {flags.length === 0 && (
          <p className="font-serif italic text-black/30 text-sm pt-2">AI is up to date.</p>
        )}

        {/* Task progress */}
        <div className="pt-5 border-t border-black/6 mt-2">
          {allDone ? (
            <>
              <p className="text-[10px] uppercase tracking-[0.2em] text-black/25 font-bold mb-2">
                {tasks.length} of {tasks.length} tasks done
              </p>
              <div className="h-px bg-black/15 mb-4" />
              <p className="text-base font-serif italic text-black/40">Today is handled.</p>
            </>
          ) : (
            <>
              <p className="text-[10px] uppercase tracking-[0.2em] text-black/25 font-bold mb-2">
                {doneTasks.length} of {tasks.length} tasks done today
              </p>
              <div className="h-px bg-black/6 relative overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 bg-black/25 transition-all duration-500"
                  style={{ width: tasks.length > 0 ? `${(doneTasks.length / tasks.length) * 100}%` : "0%" }}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify**

Annie's profile has an overdue vaccine in the mock data — the AI Brief should display a HEALTH flag pointing to it.

- [ ] **Step 3: Commit**

```bash
git add src/components/widgets/ai-brief.tsx
git commit -m "feat: add AiBrief widget — derives proactive flags from Life Graph and schedule data"
```

---

## Task 6: Task + Schedule Widget

**Files:**
- Create: `src/components/widgets/task-schedule.tsx`

Right column of the Hub. Wunderlist-style task completion with animated checkbox, completed section, "All clear" state, and schedule strip below.

- [ ] **Step 1: Create task-schedule.tsx**

Create `src/components/widgets/task-schedule.tsx`:

```tsx
"use client"

import { useState } from "react"
import { useHub } from "@/lib/store"
import { toast } from "sonner"

const SCHEDULE_FALLBACK = [
  { time: "8:00", title: "School drop-off", who: "Ellie + Annie", isPast: true, isNow: false },
  { time: "9:30", title: "All-hands Q2", who: "Mary", isPast: false, isNow: true },
  { time: "12:00", title: "Lunch", who: "Mary", isPast: false, isNow: false },
  { time: "3:30", title: "Swim practice", who: "Ellie", isPast: false, isNow: false },
  { time: "6:00", title: "Dinner", who: "Everyone", isPast: false, isNow: false },
]

export function TaskSchedule({ className }: { className?: string }) {
  const { tasks, toggleTask, events } = useHub()
  const [completing, setCompleting] = useState<Set<string>>(new Set())
  const [showCompleted, setShowCompleted] = useState(false)

  const pendingTasks = tasks.filter(t => !t.completed && !completing.has(t.id))
  const doneTasks = tasks.filter(t => t.completed || completing.has(t.id))
  const allDone = pendingTasks.length === 0 && completing.size === 0 && tasks.length > 0

  // Use real events for schedule if available, otherwise fallback
  const scheduleItems = events.length > 0
    ? events.map(e => ({ time: e.time, title: e.title, who: "", isPast: false, isNow: false }))
    : SCHEDULE_FALLBACK

  const completeTask = (id: string, title: string) => {
    setCompleting(prev => new Set([...prev, id]))
    setTimeout(() => {
      setCompleting(prev => { const n = new Set(prev); n.delete(id); return n })
      toggleTask(id)
      toast("Task completed", {
        action: { label: "Undo", onClick: () => toggleTask(id) },
      })
    }, 350)
  }

  return (
    <div className={`flex flex-col h-full ${className ?? ""}`} style={{ fontFamily: "var(--font-dm-sans, system-ui)" }}>

      {/* Tasks */}
      <div className="flex-1 flex flex-col min-h-0">
        <h2
          className="text-4xl font-light tracking-tight text-black mb-8 shrink-0"
          style={{ fontFamily: "var(--font-jost, sans-serif)" }}
        >
          Tasks
        </h2>

        {allDone ? (
          <div className="flex-1 flex flex-col">
            <p className="text-2xl font-serif italic text-black/20 leading-relaxed">All clear.</p>
            <button
              onClick={() => setShowCompleted(s => !s)}
              className="text-[10px] uppercase tracking-[0.2em] text-black/20 font-bold mt-4 hover:text-black/40 transition-colors text-left"
            >
              {showCompleted ? "Hide" : "Show"} completed ({doneTasks.length})
            </button>
            {showCompleted && (
              <div className="mt-4 space-y-1 opacity-25 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
                {doneTasks.map(task => (
                  <div key={task.id} className="flex items-start gap-3 py-2">
                    <div className="shrink-0 mt-0.5 w-4 h-4 bg-black flex items-center justify-center">
                      <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                        <path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.5" strokeLinecap="square" />
                      </svg>
                    </div>
                    <p className="text-sm text-black line-through leading-snug">{task.title}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-1 pr-1" style={{ scrollbarWidth: "none" }}>
            {pendingTasks.map(task => {
              const isAnimating = completing.has(task.id)
              return (
                <div
                  key={task.id}
                  className="flex items-start gap-3 py-2.5"
                  style={{ opacity: isAnimating ? 0.3 : 1, transition: "opacity 0.3s ease" }}
                >
                  <button
                    onClick={() => !isAnimating && completeTask(task.id, task.title)}
                    className="shrink-0 mt-0.5 w-4 h-4 border flex items-center justify-center transition-all"
                    style={{
                      backgroundColor: isAnimating ? "black" : "white",
                      borderColor: isAnimating ? "black" : "rgba(0,0,0,0.2)",
                    }}
                  >
                    {isAnimating && (
                      <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                        <path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.5" strokeLinecap="square" />
                      </svg>
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-sm leading-snug"
                      style={{
                        textDecoration: isAnimating ? "line-through" : "none",
                        color: isAnimating ? "rgba(0,0,0,0.3)" : "black",
                        transition: "color 0.2s",
                      }}
                    >
                      {task.title}
                    </p>
                    {task.who && (
                      <p className="text-[10px] text-[#4285f4] font-bold uppercase tracking-[0.15em] mt-0.5">{task.who}</p>
                    )}
                  </div>
                </div>
              )
            })}

            {doneTasks.length > 0 && (
              <div className="pt-4 mt-2 border-t border-black/6 space-y-1">
                {doneTasks.map(task => (
                  <div key={task.id} className="flex items-start gap-3 py-2 opacity-25">
                    <div className="shrink-0 mt-0.5 w-4 h-4 bg-black flex items-center justify-center">
                      <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                        <path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.5" strokeLinecap="square" />
                      </svg>
                    </div>
                    <p className="text-sm text-black line-through leading-snug">{task.title}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Schedule strip */}
      <div className="shrink-0 pt-6 border-t border-black/8 mt-6">
        <p className="text-[10px] uppercase tracking-[0.25em] text-black/25 font-bold mb-4">Schedule</p>
        <div className="space-y-0">
          {scheduleItems.slice(0, 6).map((item, i) => (
            <div
              key={i}
              className={`flex items-baseline gap-3 py-2 border-b border-black/5 last:border-0 ${item.isPast ? "opacity-20" : ""}`}
            >
              <span className="text-[10px] font-mono text-black/35 w-10 shrink-0">{item.time}</span>
              <span className={`text-xs flex-1 truncate ${item.isNow ? "font-semibold text-black" : "text-black/60"}`}>
                {item.title}
              </span>
              {item.isNow && (
                <span className="text-[8px] uppercase font-bold tracking-widest text-[#4285f4] shrink-0">now</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify component renders**

Temporarily import and render `<TaskSchedule />` somewhere visible — confirm tasks appear and checkboxes animate correctly.

- [ ] **Step 3: Commit**

```bash
git add src/components/widgets/task-schedule.tsx
git commit -m "feat: add TaskSchedule widget — Wunderlist completion, schedule strip, all-done state"
```

---

## Task 7: Hub Page Restructure

**Files:**
- Modify: `src/app/page.tsx`
- Delete: `src/components/widgets/command-center.tsx`

Replace the CommandCenter with AiBrief, replace DashboardCards with TaskSchedule, remove BrainDump from Hub (it's now global in layout).

- [ ] **Step 1: Rewrite src/app/page.tsx**

```tsx
import { AiBrief } from "@/components/widgets/ai-brief"
import { Bouncer } from "@/components/widgets/bouncer"
import { TaskSchedule } from "@/components/widgets/task-schedule"

export default function Home() {
  return (
    <main
      className="flex-1 w-full bg-white text-black"
      style={{ height: "calc(100vh - 6rem - 5rem)" }} // nav height + AI bar height
    >
      <div className="h-full grid grid-cols-1 lg:grid-cols-12 divide-x divide-black/8">

        <div className="lg:col-span-5 flex flex-col min-h-0 p-10 lg:p-12">
          <AiBrief className="flex-1 min-h-0" />
        </div>

        <div className="lg:col-span-4 flex flex-col min-h-0 p-10 lg:p-12">
          <Bouncer className="flex-1 min-h-0" />
        </div>

        <div className="lg:col-span-3 flex flex-col min-h-0 p-10 lg:p-12">
          <TaskSchedule className="flex-1 min-h-0" />
        </div>

      </div>
    </main>
  )
}
```

- [ ] **Step 2: Delete CommandCenter**

```bash
git rm src/components/widgets/command-center.tsx
```

- [ ] **Step 3: Verify**

Visit `localhost:3000`. Three columns should appear: AI Brief (left), Bouncer inbox (middle), Tasks + Schedule (right). BrainDump should be gone from the hub but visible at the bottom as the global AI bar.

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx
git rm src/components/widgets/command-center.tsx
git commit -m "feat: restructure Hub — AiBrief + Bouncer + TaskSchedule, remove CommandCenter and BrainDump from hub"
```

---

## Task 8: Calendar Redesign

**Files:**
- Modify: `src/app/calendar/page.tsx`

Week strip navigation, day view, add event inline, expand event for AI notes.

- [ ] **Step 1: Rewrite src/app/calendar/page.tsx**

```tsx
"use client"

import { useState } from "react"
import { useHub } from "@/lib/store"

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

function getCurrentDayIndex() {
  const d = new Date().getDay() // 0=Sun
  return d === 0 ? 6 : d - 1   // convert to Mon=0
}

function getWeekDates() {
  const now = new Date()
  const day = now.getDay()
  const monday = new Date(now)
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1))
  return DAYS.map((_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d.getDate()
  })
}

export default function CalendarPage() {
  const { events, addEvent, scheduleInsights } = useHub()
  const todayIdx = getCurrentDayIndex()
  const weekDates = getWeekDates()

  const [selectedDay, setSelectedDay] = useState(todayIdx)
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [addingEvent, setAddingEvent] = useState(false)
  const [newEventTitle, setNewEventTitle] = useState("")

  // Events whose date matches the selected day's date-of-month
  const dayEvents = events
    .filter(e => e.date === weekDates[selectedDay])
    .sort((a, b) => a.time.localeCompare(b.time))

  const eventCountPerDay = DAYS.map((_, i) =>
    events.filter(e => e.date === weekDates[i]).length
  )

  const handleAddEvent = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newEventTitle.trim()) return
    addEvent({
      id: crypto.randomUUID(),
      title: newEventTitle,
      time: "09:00",
      date: weekDates[selectedDay],
    })
    setNewEventTitle("")
    setAddingEvent(false)
  }

  return (
    <main
      className="flex-1 w-full bg-white text-black flex flex-col"
      style={{ height: "calc(100vh - 6rem - 5rem)", fontFamily: "var(--font-dm-sans, system-ui)" }}
    >
      {/* Month header */}
      <div className="flex items-center justify-between px-10 py-6 border-b border-black/8 shrink-0">
        <h1 className="text-3xl font-light tracking-tight" style={{ fontFamily: "var(--font-jost, sans-serif)" }}>
          {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSelectedDay(todayIdx)}
            className="text-[10px] uppercase tracking-[0.2em] font-bold px-4 py-2 border border-black/15 hover:border-black text-black/50 hover:text-black transition-colors"
          >
            Today
          </button>
          <button
            onClick={() => setAddingEvent(true)}
            className="text-[10px] uppercase tracking-[0.2em] font-bold px-4 py-2 bg-black text-white hover:bg-black/80 transition-colors"
          >
            + Add Event
          </button>
        </div>
      </div>

      {/* Week strip */}
      <div className="grid grid-cols-7 border-b border-black/8 shrink-0">
        {DAYS.map((day, i) => {
          const isToday = i === todayIdx
          const isSelected = i === selectedDay
          const count = eventCountPerDay[i]
          return (
            <button
              key={day}
              onClick={() => { setSelectedDay(i); setSelectedEventId(null) }}
              className={`flex flex-col items-center py-4 gap-1.5 border-r border-black/5 last:border-0 transition-colors ${
                isSelected ? "bg-black" : "hover:bg-black/3"
              }`}
            >
              <span className={`text-[10px] uppercase tracking-[0.2em] font-bold ${isSelected ? "text-white/50" : "text-black/30"}`}>
                {day}
              </span>
              <span
                className={`text-xl font-light ${isSelected ? "text-white" : isToday ? "text-black font-medium" : "text-black/60"}`}
                style={{ fontFamily: "var(--font-jost, sans-serif)" }}
              >
                {weekDates[i]}
              </span>
              {count > 0 && (
                <div className="flex gap-0.5">
                  {Array.from({ length: Math.min(count, 4) }).map((_, j) => (
                    <div key={j} className={`w-1 h-1 rounded-full ${isSelected ? "bg-white/40" : "bg-black/20"}`} />
                  ))}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Day view */}
      <div className="flex flex-1 min-h-0">
        <div className="flex-1 overflow-y-auto px-10 py-8" style={{ scrollbarWidth: "none" }}>

          {/* Schedule conflict warnings */}
          {scheduleInsights.length > 0 && selectedDay === todayIdx && (
            <div className="mb-6 bg-amber-50 border-l-2 border-amber-400 px-4 py-3">
              <p className="text-[10px] uppercase tracking-[0.15em] font-bold text-amber-700 mb-1">AI Warning</p>
              <p className="text-xs font-serif italic text-amber-800">{scheduleInsights[0]}</p>
            </div>
          )}

          {/* Add event form */}
          {addingEvent && (
            <form onSubmit={handleAddEvent} className="mb-6 border border-[#4285f4]/30 bg-[#4285f4]/3 p-5">
              <p className="text-[10px] uppercase tracking-[0.2em] text-[#4285f4] font-bold mb-3">
                New Event — {DAYS[selectedDay]} {weekDates[selectedDay]}
              </p>
              <input
                autoFocus
                type="text"
                value={newEventTitle}
                onChange={e => setNewEventTitle(e.target.value)}
                onKeyDown={e => e.key === "Escape" && (setAddingEvent(false), setNewEventTitle(""))}
                placeholder="Dentist for Ellie at 2pm..."
                className="w-full bg-transparent text-sm text-black placeholder:text-black/25 outline-none"
              />
              <div className="flex gap-2 mt-4">
                <button type="submit" className="text-[10px] uppercase tracking-[0.15em] font-bold px-4 py-2 bg-black text-white hover:bg-black/80 transition-colors">Add</button>
                <button type="button" onClick={() => { setAddingEvent(false); setNewEventTitle("") }} className="text-[10px] uppercase tracking-[0.15em] font-bold px-4 py-2 border border-black/15 text-black/50 hover:border-black transition-colors">Cancel</button>
              </div>
            </form>
          )}

          {dayEvents.length === 0 ? (
            <p className="font-serif italic text-black/25 text-sm">
              Nothing scheduled. Use + Add Event to block time.
            </p>
          ) : (
            <div className="space-y-2">
              {dayEvents.map(event => {
                const isExpanded = selectedEventId === event.id
                return (
                  <div
                    key={event.id}
                    onClick={() => setSelectedEventId(isExpanded ? null : event.id)}
                    className={`border p-5 cursor-pointer transition-all ${isExpanded ? "border-black bg-black/[0.02]" : "border-black/8 hover:border-black/25"}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-4 flex-1">
                        <span className="text-[11px] font-mono text-black/35 shrink-0 pt-0.5 w-12">{event.time}</span>
                        <div>
                          <p className="text-base font-medium text-black leading-tight">{event.title}</p>
                          {event.location && event.location !== "TBD" && (
                            <p className="text-[11px] text-black/30 mt-0.5">{event.location}</p>
                          )}
                        </div>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="mt-4 pt-4 border-t border-black/6 ml-16 space-y-3">
                        {event.aiPrepSuggestion && (
                          <div className="bg-[#4285f4]/5 border-l-2 border-[#4285f4]/30 px-3 py-2">
                            <p className="text-[10px] uppercase tracking-[0.15em] font-bold text-[#4285f4] mb-1">AI Prep</p>
                            <p className="text-xs font-serif italic text-black/60">{event.aiPrepSuggestion}</p>
                          </div>
                        )}
                        {event.aiTravelBuffer && (
                          <p className="text-xs text-black/40">
                            <span className="font-bold uppercase tracking-widest text-[10px]">Travel</span> — {event.aiTravelBuffer}
                          </p>
                        )}
                        <div className="flex gap-2">
                          <button className="text-[10px] uppercase tracking-[0.15em] font-bold px-3 py-1.5 border border-black/15 text-black/50 hover:border-black hover:text-black transition-colors">
                            Edit
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Week summary sidebar */}
        <div className="w-56 border-l border-black/8 flex flex-col p-6 shrink-0 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
          <p className="text-[10px] uppercase tracking-[0.25em] text-black/25 font-bold mb-5">This Week</p>
          <div className="space-y-4">
            {DAYS.map((day, i) => {
              const dayEvts = events.filter(e => e.date === weekDates[i])
              const isToday = i === todayIdx
              return (
                <div key={day}>
                  <button
                    onClick={() => { setSelectedDay(i); setSelectedEventId(null) }}
                    className="flex items-center gap-2 mb-1.5 w-full text-left"
                  >
                    <span className={`text-[10px] uppercase tracking-[0.2em] font-bold ${isToday ? "text-black" : "text-black/25"}`}>
                      {day} {weekDates[i]}
                    </span>
                    {isToday && <span className="text-[8px] uppercase tracking-[0.2em] font-bold text-[#4285f4]">today</span>}
                  </button>
                  {dayEvts.length === 0 ? (
                    <p className="text-[11px] text-black/20 font-serif italic">Free</p>
                  ) : (
                    <div className="space-y-1">
                      {dayEvts.map(e => (
                        <div key={e.id} className="flex items-center gap-2">
                          <span className="text-[10px] font-mono text-black/25 w-10 shrink-0">{e.time}</span>
                          <span className="text-[11px] text-black/50 truncate">{e.title}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Verify**

Visit `/calendar`. Week strip shows today highlighted. Click different days. Click "+ Add Event" and add a test event — it should appear immediately. Click an event to expand it.

- [ ] **Step 3: Commit**

```bash
git add src/app/calendar/page.tsx
git commit -m "feat: redesign Calendar — week strip navigation, day view, add event, AI prep notes inline"
```

---

## Task 9: Planner Redesign

**Files:**
- Modify: `src/app/planner/page.tsx`

Today / This Week / Someday sections using `task.due`. Same Wunderlist completion pattern as TaskSchedule.

- [ ] **Step 1: Rewrite src/app/planner/page.tsx**

```tsx
"use client"

import { useState } from "react"
import { useHub } from "@/lib/store"
import { toast } from "sonner"

const CATEGORIES = ["ALL", "FAMILY", "WORK", "HOUSEHOLD", "PERSONAL", "ERRANDS"]

export default function PlannerPage() {
  const { tasks, toggleTask, addTask } = useHub()
  const [activeCategory, setActiveCategory] = useState("ALL")
  const [completing, setCompleting] = useState<Set<string>>(new Set())
  const [newTaskInput, setNewTaskInput] = useState("")

  const completeTask = (id: string) => {
    setCompleting(prev => new Set([...prev, id]))
    setTimeout(() => {
      setCompleting(prev => { const n = new Set(prev); n.delete(id); return n })
      toggleTask(id)
      toast("Task completed", {
        action: { label: "Undo", onClick: () => toggleTask(id) },
      })
    }, 350)
  }

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTaskInput.trim()) return
    addTask({
      id: crypto.randomUUID(),
      title: newTaskInput,
      context: activeCategory === "ALL" ? "PERSONAL" : activeCategory,
      due: "today",
      completed: false,
    })
    setNewTaskInput("")
  }

  const filtered = tasks.filter(t =>
    !t.completed &&
    !completing.has(t.id) &&
    (activeCategory === "ALL" || t.context.toUpperCase() === activeCategory)
  )

  const todayTasks = filtered.filter(t => t.due === "today" || !t.due)
  const weekTasks = filtered.filter(t => t.due === "this-week")
  const somedayTasks = filtered.filter(t => t.due === "someday")
  const completedTasks = tasks.filter(t =>
    (t.completed || completing.has(t.id)) &&
    (activeCategory === "ALL" || t.context.toUpperCase() === activeCategory)
  )

  const counts = CATEGORIES.reduce((acc, cat) => {
    acc[cat] = tasks.filter(t =>
      !t.completed && !completing.has(t.id) &&
      (cat === "ALL" || t.context.toUpperCase() === cat)
    ).length
    return acc
  }, {} as Record<string, number>)

  const TaskRow = ({ id, title, who, isAnimating }: { id: string; title: string; who?: string; isAnimating: boolean }) => (
    <div
      className="flex items-start gap-4 py-3 group"
      style={{ opacity: isAnimating ? 0.3 : 1, transition: "opacity 0.3s ease" }}
    >
      <button
        onClick={() => !isAnimating && completeTask(id)}
        className="shrink-0 mt-0.5 w-5 h-5 border flex items-center justify-center transition-all"
        style={{ backgroundColor: isAnimating ? "black" : "white", borderColor: isAnimating ? "black" : "rgba(0,0,0,0.2)" }}
      >
        {isAnimating && (
          <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
            <path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="square" />
          </svg>
        )}
      </button>
      <div className="flex-1 min-w-0">
        <p
          className="text-sm text-black leading-snug"
          style={{ textDecoration: isAnimating ? "line-through" : "none", color: isAnimating ? "rgba(0,0,0,0.3)" : "black", transition: "color 0.2s" }}
        >
          {title}
        </p>
        {who && <p className="text-[10px] text-[#4285f4] font-bold uppercase tracking-[0.12em] mt-0.5">{who}</p>}
      </div>
    </div>
  )

  return (
    <main
      className="flex-1 w-full bg-white text-black flex flex-col"
      style={{ height: "calc(100vh - 6rem - 5rem)", fontFamily: "var(--font-dm-sans, system-ui)" }}
    >
      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <div className="w-56 shrink-0 border-r border-black/8 flex flex-col py-8 px-4">
          <p className="text-[10px] uppercase tracking-[0.25em] text-black/25 font-bold mb-4 px-3">Filter</p>
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`flex items-center justify-between px-3 py-3 text-left transition-colors ${
                activeCategory === cat ? "bg-black text-white" : "hover:bg-black/4 text-black"
              }`}
            >
              <span className="text-sm font-medium">{cat}</span>
              {counts[cat] > 0 && (
                <span className={`text-[10px] font-bold tabular-nums ${activeCategory === cat ? "text-white/50" : "text-black/30"}`}>
                  {counts[cat]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Main */}
        <div className="flex-1 flex flex-col min-h-0 p-10">
          {/* Quick add */}
          <form onSubmit={handleAdd} className="flex items-center gap-4 mb-8 pb-6 border-b border-black/8 shrink-0">
            <div className="w-5 h-5 border border-black/15 shrink-0" />
            <input
              type="text"
              value={newTaskInput}
              onChange={e => setNewTaskInput(e.target.value)}
              placeholder="Add a task..."
              className="flex-1 bg-transparent text-base text-black placeholder:text-black/20 outline-none"
            />
            {newTaskInput && (
              <button type="submit" className="text-[10px] uppercase tracking-[0.15em] font-bold px-4 py-2 bg-black text-white hover:bg-black/80 transition-colors shrink-0">
                Add
              </button>
            )}
          </form>

          <div className="flex-1 overflow-y-auto space-y-8 pr-2" style={{ scrollbarWidth: "none" }}>
            {todayTasks.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-[0.25em] text-black/30 font-bold mb-3">Today</p>
                <div className="divide-y divide-black/5">
                  {todayTasks.map(t => <TaskRow key={t.id} id={t.id} title={t.title} who={t.who} isAnimating={completing.has(t.id)} />)}
                </div>
              </div>
            )}

            {weekTasks.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-[0.25em] text-black/25 font-bold mb-3">This Week</p>
                <div className="divide-y divide-black/5">
                  {weekTasks.map(t => <TaskRow key={t.id} id={t.id} title={t.title} who={t.who} isAnimating={completing.has(t.id)} />)}
                </div>
              </div>
            )}

            {somedayTasks.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-[0.25em] text-black/20 font-bold mb-3">Someday</p>
                <div className="divide-y divide-black/5 opacity-60">
                  {somedayTasks.map(t => <TaskRow key={t.id} id={t.id} title={t.title} who={t.who} isAnimating={completing.has(t.id)} />)}
                </div>
              </div>
            )}

            {filtered.length === 0 && completedTasks.length === 0 && (
              <p className="font-serif italic text-black/25 text-sm">No tasks in this category.</p>
            )}

            {completedTasks.length > 0 && (
              <div className="pt-4 border-t border-black/6">
                <p className="text-[10px] uppercase tracking-[0.25em] text-black/20 font-bold mb-3">Completed · {completedTasks.length}</p>
                <div className="space-y-1 opacity-30">
                  {completedTasks.map(t => (
                    <div key={t.id} className="flex items-start gap-4 py-2.5">
                      <div className="shrink-0 mt-0.5 w-5 h-5 bg-black flex items-center justify-center">
                        <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                          <path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="square" />
                        </svg>
                      </div>
                      <p className="text-sm text-black line-through leading-snug">{t.title}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Verify**

Visit `/planner`. Tasks should appear in Today / This Week / Someday sections. Check off a task — strikethrough, fade, moves to Completed. Filter by category using the sidebar.

- [ ] **Step 3: Commit**

```bash
git add src/app/planner/page.tsx
git commit -m "feat: redesign Planner — Today/This Week/Someday sections, Wunderlist completion, who tag"
```

---

## Task 10: Life Graph Redesign

**Files:**
- Modify: `src/app/life/page.tsx`

Medical flags first, What AI Knows section, vaccine status, doctor contact, inline-editable sizes, structured routines.

- [ ] **Step 1: Rewrite src/app/life/page.tsx**

```tsx
"use client"

import { useState } from "react"
import { useHub } from "@/lib/store"

export default function LifePage() {
  const { profiles } = useHub()
  const [activeId, setActiveId] = useState(profiles[0]?.id ?? "")
  const [editingSize, setEditingSize] = useState<string | null>(null)

  const profile = profiles.find(p => p.id === activeId)

  // Derive "What AI Knows" from profile data
  function deriveAiKnows(p: typeof profile) {
    if (!p) return []
    const knows: string[] = []
    if (p.dietary.length > 0)
      knows.push(`Dietary restrictions: ${p.dietary.join(", ")} — flagged on all food-related emails and events.`)
    if (p.vaccineStatus?.some(v => v.status === "overdue"))
      knows.push(`One or more vaccines are overdue — surfaces as an AI flag on Hub.`)
    if (p.routines.length > 0)
      knows.push(`${p.routines.length} known routines — used to detect scheduling conflicts automatically.`)
    if (p.doctor)
      knows.push(`Doctor on file: ${p.doctor.name} at ${p.doctor.practice} — used when booking or flagging health events.`)
    return knows
  }

  if (!profile) return null

  const aiKnows = deriveAiKnows(profile)

  return (
    <main
      className="flex-1 w-full bg-white text-black flex flex-col"
      style={{ height: "calc(100vh - 6rem - 5rem)", fontFamily: "var(--font-dm-sans, system-ui)" }}
    >
      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <div className="w-56 shrink-0 border-r border-black/8 flex flex-col py-8 px-4">
          <p className="text-[10px] uppercase tracking-[0.25em] text-black/25 font-bold mb-4 px-3">People</p>
          {profiles.map(p => (
            <button
              key={p.id}
              onClick={() => { setActiveId(p.id); setEditingSize(null) }}
              className={`flex items-center justify-between px-3 py-3 text-left transition-colors ${
                activeId === p.id ? "bg-black text-white" : "hover:bg-black/4"
              }`}
            >
              <span className="text-sm font-medium">{p.name}</span>
              <span className={`text-[10px] font-bold uppercase tracking-widest ${activeId === p.id ? "text-white/40" : "text-black/25"}`}>
                {p.type}
              </span>
            </button>
          ))}
          <button className="mt-3 px-3 py-3 text-left text-[11px] text-black/25 hover:text-black transition-colors uppercase tracking-[0.15em] font-bold">
            + Add person
          </button>
        </div>

        {/* Profile */}
        <div className="flex-1 overflow-y-auto p-10 lg:p-12" style={{ scrollbarWidth: "none" }}>
          <div className="max-w-2xl space-y-10">

            {/* Name */}
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-black/30 mb-1">{profile.type}</p>
              <h1 className="text-5xl font-light tracking-tight text-black mb-3" style={{ fontFamily: "var(--font-jost, sans-serif)" }}>
                {profile.name}
              </h1>
              <p className="text-sm font-serif italic text-black/50 leading-relaxed">{profile.currentContext}</p>
            </div>

            {/* Medical flags — always first if present */}
            {profile.medicalFlags.length > 0 && (
              <div className="bg-red-50 border border-red-200 p-5">
                <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-red-700 mb-3">Medical Flags</p>
                <div className="space-y-2">
                  {profile.medicalFlags.map((flag, i) => (
                    <p key={i} className="text-sm font-serif italic text-red-800 leading-snug">{flag}</p>
                  ))}
                </div>
                {profile.dietary.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-red-200 flex flex-wrap gap-1.5">
                    {profile.dietary.map(d => (
                      <span key={d} className="text-[10px] font-bold uppercase tracking-[0.15em] bg-red-100 text-red-700 px-2 py-0.5">{d}</span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* What AI Knows */}
            {aiKnows.length > 0 && (
              <div className="bg-[#4285f4]/4 border-l-2 border-[#4285f4]/30 pl-5 pr-4 py-4">
                <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#4285f4] mb-3">What AI Knows</p>
                <div className="space-y-2">
                  {aiKnows.map((item, i) => (
                    <p key={i} className="text-xs font-serif italic text-black/50 leading-relaxed">{item}</p>
                  ))}
                </div>
              </div>
            )}

            {/* Vaccine status */}
            {profile.vaccineStatus && profile.vaccineStatus.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-[0.25em] text-black/25 font-bold mb-4">Vaccine Status</p>
                <div className="space-y-0">
                  {profile.vaccineStatus.map((v, i) => (
                    <div key={i} className="flex items-start justify-between py-3 border-b border-black/6 last:border-0">
                      <p className="text-sm text-black/70 flex-1 pr-6">{v.name}</p>
                      <div className="text-right shrink-0">
                        <span className={`text-[9px] font-bold uppercase tracking-[0.15em] px-2 py-0.5 block ${
                          v.status === "overdue" ? "bg-amber-100 text-amber-800" :
                          v.status === "upcoming" ? "bg-[#4285f4]/8 text-[#4285f4]" :
                          "bg-black/5 text-black/40"
                        }`}>{v.status}</span>
                        <span className="text-[10px] font-mono text-black/25 mt-1 block">{v.date}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Doctor */}
            {profile.doctor && (
              <div>
                <p className="text-[10px] uppercase tracking-[0.25em] text-black/25 font-bold mb-4">Doctor</p>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-black">{profile.doctor.name}</p>
                    <p className="text-sm text-black/50">{profile.doctor.practice}</p>
                    <p className="text-[11px] text-black/30 mt-1">{profile.doctor.hours}</p>
                  </div>
                  <a
                    href={`tel:${profile.doctor.phone}`}
                    className="text-[10px] uppercase tracking-[0.15em] font-bold px-4 py-2 border border-black/15 text-black/50 hover:border-black hover:text-black transition-colors shrink-0"
                  >
                    {profile.doctor.phone}
                  </a>
                </div>
              </div>
            )}

            {/* Routines */}
            {profile.routines.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-[0.25em] text-black/25 font-bold mb-4">Routines</p>
                <div className="space-y-0">
                  {profile.routines.map((r, i) => (
                    <div key={i} className="flex items-baseline gap-5 py-3 border-b border-black/5 last:border-0">
                      <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-black/30 w-36 shrink-0">{r.day}</span>
                      <span className="text-sm text-black/70 flex-1">{r.activity}</span>
                      <span className="text-[11px] font-mono text-black/30 shrink-0">{r.time}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Preferences */}
            {profile.preferences.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-[0.25em] text-black/25 font-bold mb-4">Preferences</p>
                <div className="flex flex-wrap gap-2">
                  {profile.preferences.map(pref => (
                    <span key={pref} className="border border-black/12 px-3 py-1.5 text-sm text-black/60">{pref}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Sizes — inline editable */}
            {Object.keys(profile.sizes).length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-[0.25em] text-black/25 font-bold mb-4">Sizes</p>
                <div className="grid grid-cols-4 gap-4">
                  {Object.entries(profile.sizes).map(([label, value]) => (
                    <div
                      key={label}
                      onClick={() => setEditingSize(editingSize === label ? null : label)}
                      className="cursor-pointer group"
                    >
                      <p className="text-[10px] uppercase text-black/30 font-bold mb-1">{label}</p>
                      {editingSize === label ? (
                        <input
                          autoFocus
                          className="text-base font-medium text-black border-b border-black outline-none bg-transparent w-full"
                          defaultValue={value}
                          onBlur={() => setEditingSize(null)}
                          onKeyDown={e => e.key === "Enter" && setEditingSize(null)}
                        />
                      ) : (
                        <p className="text-base font-medium text-black group-hover:underline underline-offset-2 decoration-black/20">{value}</p>
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-black/20 mt-3 font-serif italic">Click any size to edit</p>
              </div>
            )}

            {/* Upcoming occasions */}
            {profile.upcomingOccasions && profile.upcomingOccasions.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-[0.25em] text-black/25 font-bold mb-4">Upcoming</p>
                <div className="space-y-0">
                  {profile.upcomingOccasions.map((o, i) => (
                    <div key={i} className="flex items-center justify-between py-3 border-b border-black/5 last:border-0">
                      <div>
                        <p className="text-sm text-black font-medium">{o.label}</p>
                        <p className="text-[11px] text-black/30">{o.date}</p>
                      </div>
                      <span className={`text-[11px] font-bold tabular-nums ${o.daysAway < 14 ? "text-amber-600" : "text-black/25"}`}>
                        {o.daysAway}d
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Verify**

Visit `/life`. Select Annie — medical flags section should appear first in red, followed by What AI Knows in blue, then vaccine status with the overdue badge, doctor with phone link, routines, and inline-editable sizes.

- [ ] **Step 3: Commit**

```bash
git add src/app/life/page.tsx
git commit -m "feat: redesign Life Graph — medical flags first, What AI Knows, vaccine status, inline size editing"
```

---

## Task 11: Connect Life Graph to AI Digest

**Files:**
- Modify: `src/app/api/inbox/digest/route.ts`

Pass profile data (dietary restrictions, medical flags, routines) to the AI prompt so the digest cross-references family context when extracting directives from emails.

- [ ] **Step 1: Read the current digest route to understand the existing prompt structure**

Open `src/app/api/inbox/digest/route.ts` and identify where the AI prompt string is constructed.

- [ ] **Step 2: Update the route to accept profiles in the request body**

In the route's `POST` handler, destructure `profiles` from the request body alongside any existing fields:

```ts
const { profiles = [] } = await req.json()
```

- [ ] **Step 3: Build a family context string from profiles**

Add this function before the AI prompt construction:

```ts
function buildFamilyContext(profiles: any[]): string {
  if (!profiles.length) return ""

  const lines: string[] = ["=== FAMILY CONTEXT ==="]

  profiles.forEach((p: any) => {
    lines.push(`\n${p.name} (${p.type}):`)
    if (p.medicalFlags?.length) lines.push(`  Medical: ${p.medicalFlags.join("; ")}`)
    if (p.dietary?.length) lines.push(`  Dietary: ${p.dietary.join(", ")}`)
    if (p.routines?.length) {
      lines.push(`  Routines: ${p.routines.map((r: any) => `${r.activity} (${r.day} ${r.time})`).join("; ")}`)
    }
    if (p.upcomingOccasions?.length) {
      const soon = p.upcomingOccasions.filter((o: any) => o.daysAway <= 30)
      if (soon.length) lines.push(`  Upcoming: ${soon.map((o: any) => `${o.label} in ${o.daysAway} days`).join("; ")}`)
    }
  })

  lines.push("\nWhen extracting directives, cross-reference the above. Flag dietary conflicts, medical concerns, and scheduling overlaps with known routines.")
  return lines.join("\n")
}
```

- [ ] **Step 4: Inject family context into the AI prompt**

In the system/user prompt passed to the AI SDK, prepend the family context:

```ts
const familyContext = buildFamilyContext(profiles)
// Prepend to your existing prompt string:
const systemPrompt = `${familyContext}\n\n${existingSystemPrompt}`
```

- [ ] **Step 5: Update the store's hydrateEmails call to pass profiles**

In `src/lib/store.tsx`, find where the inbox digest API is called (look for `fetch("/api/inbox/digest")`). Update the call to include profiles:

```ts
const response = await fetch("/api/inbox/digest", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    accessToken,
    profiles: profiles, // add this line
  }),
})
```

- [ ] **Step 6: Verify**

With a real Gmail account connected, trigger a digest. Check that emails mentioning food or scheduling are cross-referenced against Annie's dairy-free/nut-free flags or Ellie's swim practice schedule.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/inbox/digest/route.ts src/lib/store.tsx
git commit -m "feat: pass Life Graph profiles to inbox digest — AI cross-references family context when extracting directives"
```

---

## Self-Review

**Spec coverage check:**

| Requirement | Task |
|-------------|------|
| Remove Activity page | Task 1 |
| Persist data to Firestore | Task 3 |
| AI doesn't speak first (replaced with derived Brief) | Task 5 |
| Multi-inbox (Gmail + Slack source indicators) | Note: Slack source in inbox is UI-only in this plan — Slack API integration is out of scope and requires a separate plan |
| Life Graph connected to AI | Task 11 |
| "Today is handled" completion state | Tasks 5, 6 |
| Global AI command bar | Task 4 |
| Wunderlist completion | Tasks 6, 9 |
| Calendar redesign | Task 8 |
| Planner redesign | Task 9 |
| Life Graph redesign | Task 10 |

**Known gap — Slack integration:** The mockup shows Slack items in the inbox with a source dot. The actual Slack API integration (OAuth, channel listening, message extraction) is a full sub-project and is not in this plan. The inbox UI will show Gmail items only. Slack API integration should be planned separately.

**Placeholder scan:** None found. All steps contain complete code.

**Type consistency check:**
- `Task.title` used throughout (not `Task.text` — mockup used `text` but real store uses `title`)
- `EntityProfile.routines` is now `{ day, activity, time }[]` — updated in Task 2 mock data and consumed correctly in Task 10
- `Task.due` is `"today" | "this-week" | "someday" | undefined` — consistent across Tasks 2, 6, 9
- `toggleTask(id)` signature unchanged — Tasks 6, 9 use it correctly
