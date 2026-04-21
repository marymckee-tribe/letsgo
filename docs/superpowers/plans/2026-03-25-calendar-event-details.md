# Calendar Event Details + Grocery List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a split detail panel to the calendar page with AI-generated editable prep notes, and add a Provisions (grocery) section to the hub's Tasks widget.

**Architecture:** Store gains new fields (`CalendarEvent.notes/location/fromEmail`, `GroceryItem.checked`) and actions. A new `/api/calendar/event-notes` route generates bullet-point prep notes via Claude Haiku on first click. The calendar page restructures its day view into a flex split: event list left, detail panel right. The TaskSchedule widget adds a Provisions section between tasks and schedule.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind v4, `@ai-sdk/anthropic`, `generateText` from `ai`, Firestore (via existing store pattern)

---

### Task 1: Store — new fields and actions

**Files:**
- Modify: `src/lib/store.tsx`

This task must be completed before Tasks 2, 3, and 4.

- [ ] **Step 1: Add new fields to `CalendarEvent` type**

In `src/lib/store.tsx`, find the `CalendarEvent` type (around line 17) and replace it:

```ts
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
```

- [ ] **Step 2: Add `checked` to `GroceryItem` type**

Find the `GroceryItem` type and replace it:

```ts
export type GroceryItem = {
  id: string
  name: string
  checked?: boolean
}
```

- [ ] **Step 3: Add new actions to `HubState` interface**

Find the `interface HubState` block and add these six lines inside it (after `setTaskWho`):

```ts
  setEventTitle: (id: string, title: string) => void
  setEventTime: (id: string, time: string) => void
  setEventLocation: (id: string, location: string) => void
  setEventNotes: (id: string, notes: string) => void
  toggleGrocery: (id: string) => void
```

- [ ] **Step 4: Implement the five new actions inside `HubProvider`**

Find where `addEvent` is defined (around line 406). Add these five functions directly after `addEvent`:

```ts
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
    setGroceries(prev => {
      const next = prev.map(g => g.id === id ? { ...g, checked: !g.checked } : g)
      if (!isMock) {
        const g = next.find(g => g.id === id)
        if (g) setDoc(doc(db, "groceries", g.id), g)
      }
      return next
    })
  }
```

- [ ] **Step 5: Add the new actions to the context Provider value**

Find the `<HubContext.Provider value={{` block at the bottom of `HubProvider`. Add the five new actions to the value object:

```ts
      setEventTitle, setEventTime, setEventLocation, setEventNotes, toggleGrocery,
```

- [ ] **Step 6: Update `actOnEmailAction` to set `fromEmail: true`**

Find the `actOnEmailAction` function. In the `CALENDAR_INVITE` branch, update `addEvent` call to include `fromEmail: true`:

```ts
      if (act.type === 'CALENDAR_INVITE') {
         addEvent({ id: Math.random().toString(), title: act.title, time: act.time || "12:00", date: act.date || 1, fromEmail: true })
```

- [ ] **Step 7: Run TypeScript check**

```bash
cd "/Users/marymckee/Desktop/Antigrav Projects/the-hub-claude/.worktrees/email-intake"
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
cd "/Users/marymckee/Desktop/Antigrav Projects/the-hub-claude/.worktrees/email-intake"
git add src/lib/store.tsx
git commit -m "feat: add CalendarEvent notes/location/fromEmail, GroceryItem checked, new store actions"
```

---

### Task 2: Create `/api/calendar/event-notes` route

**Files:**
- Create: `src/app/api/calendar/event-notes/route.ts`

Requires Task 1 to be merged first (no direct dependency, but run after for clean git history).

- [ ] **Step 1: Create the route file**

```ts
// src/app/api/calendar/event-notes/route.ts
export const runtime = 'nodejs'
export const maxDuration = 30

import { anthropic } from '@ai-sdk/anthropic'
import { generateText } from 'ai'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { event, profiles = [], nearbyEvents = [] } = await req.json()

    const profileLines = (profiles as any[]).map(p => {
      const parts = [`${p.name} (${p.type})`]
      if (p.medicalFlags?.length) parts.push(`Medical: ${p.medicalFlags.join(', ')}`)
      if (p.dietary?.length) parts.push(`Dietary: ${p.dietary.join(', ')}`)
      if (p.routines?.length) {
        parts.push(`Routines: ${(p.routines as any[]).map(r => `${r.activity} ${r.day} ${r.time}`).join(', ')}`)
      }
      return parts.join(' | ')
    })

    const nearbyLine = (nearbyEvents as any[]).length > 0
      ? `Same-day events: ${(nearbyEvents as any[]).map((e: any) => `${e.title} at ${e.time}`).join(', ')}`
      : ''

    const { text } = await generateText({
      model: anthropic('claude-haiku-4-5-20251001'),
      prompt: `Generate 2-4 concise prep notes for this calendar event as markdown bullet points.

Event: ${event.title}
Date: ${event.date}, Time: ${event.time}${event.location ? `\nLocation: ${event.location}` : ''}
${profileLines.length > 0 ? `\nFamily:\n${profileLines.join('\n')}` : ''}
${nearbyLine}

Rules:
- Use markdown bullets (- item)
- Each bullet is one actionable prep item or useful context
- Cross-reference family profiles for conflicts, allergies, who is involved
- Flag travel time concerns if same-day events are close in time
- Mention materials to bring if relevant
- Keep each bullet under 12 words
- No generic filler like "arrive on time"`,
    })

    return NextResponse.json({ notes: text })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
```

- [ ] **Step 2: Type-check**

```bash
cd "/Users/marymckee/Desktop/Antigrav Projects/the-hub-claude/.worktrees/email-intake"
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Quick smoke test**

```bash
curl -s -X POST http://localhost:3001/api/calendar/event-notes \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test" \
  -d '{"event":{"title":"Parent Teacher Conf.","date":24,"time":"09:00"},"profiles":[],"nearbyEvents":[]}' \
  | head -5
```

Expected: JSON with a `notes` field containing markdown bullets.

- [ ] **Step 4: Commit**

```bash
cd "/Users/marymckee/Desktop/Antigrav Projects/the-hub-claude/.worktrees/email-intake"
git add src/app/api/calendar/event-notes/route.ts
git commit -m "feat: add /api/calendar/event-notes AI prep note generation route"
```

---

### Task 3: Rewrite calendar page with split detail panel

**Files:**
- Modify: `src/app/calendar/page.tsx`

Requires Task 1 (new store actions).

- [ ] **Step 1: Replace the entire file contents**

```tsx
// src/app/calendar/page.tsx
"use client"

import { useState, useEffect } from "react"
import { useHub } from "@/lib/store"
import { useAuth } from "@/lib/auth-provider"

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

function getCurrentDayIndex() {
  const d = new Date().getDay()
  return d === 0 ? 6 : d - 1
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
  const {
    events, addEvent, scheduleInsights,
    setEventTitle, setEventTime, setEventLocation, setEventNotes,
    profiles,
  } = useHub()
  const { accessToken } = useAuth()
  const todayIdx = getCurrentDayIndex()
  const weekDates = getWeekDates()

  const [selectedDay, setSelectedDay] = useState(todayIdx)
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [addingEvent, setAddingEvent] = useState(false)
  const [newEventTitle, setNewEventTitle] = useState("")
  const [notesLoading, setNotesLoading] = useState(false)

  const dayEvents = events
    .filter(e => e.date === weekDates[selectedDay])
    .sort((a, b) => a.time.localeCompare(b.time))

  const eventCountPerDay = DAYS.map((_, i) =>
    events.filter(e => e.date === weekDates[i]).length
  )

  const selectedEvent = selectedEventId
    ? events.find(e => e.id === selectedEventId) ?? null
    : null

  // Generate AI notes on first selection of an event
  useEffect(() => {
    if (!selectedEvent || selectedEvent.notes !== undefined || notesLoading) return

    if (!accessToken || accessToken === "mock-token") {
      setEventNotes(selectedEvent.id, "- Review any relevant materials beforehand\n- Allow buffer time for travel")
      return
    }

    const nearbyEvents = dayEvents
      .filter(e => e.id !== selectedEvent.id)
      .map(e => ({ title: e.title, date: e.date, time: e.time }))

    setNotesLoading(true)
    fetch("/api/calendar/event-notes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        event: {
          title: selectedEvent.title,
          date: selectedEvent.date,
          time: selectedEvent.time,
          location: selectedEvent.location,
        },
        profiles,
        nearbyEvents,
      }),
    })
      .then(r => r.json())
      .then(data => {
        setEventNotes(selectedEvent.id, data.notes ?? "- No prep notes available")
      })
      .catch(() => {
        setEventNotes(selectedEvent.id, "- Couldn't generate notes")
      })
      .finally(() => setNotesLoading(false))
  }, [selectedEventId]) // eslint-disable-line react-hooks/exhaustive-deps

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
              onClick={() => { setSelectedDay(i); setSelectedEventId(null); setAddingEvent(false) }}
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

      {/* Day view — splits when an event is selected */}
      <div className="flex flex-1 min-h-0">

        {/* Event list */}
        <div className="flex-1 overflow-y-auto px-10 py-8" style={{ scrollbarWidth: "none" }}>
          {scheduleInsights.length > 0 && selectedDay === todayIdx && (
            <div className="mb-6 bg-amber-50 border-l-2 border-amber-400 px-4 py-3">
              <p className="text-[10px] uppercase tracking-[0.15em] font-bold text-amber-700 mb-1">AI Warning</p>
              <p className="text-xs font-serif italic text-amber-800">{scheduleInsights[0]}</p>
            </div>
          )}

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
                placeholder="Event name..."
                className="w-full bg-transparent text-sm text-black placeholder:text-black/20 outline-none mb-4"
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="text-[10px] uppercase tracking-[0.15em] font-bold px-4 py-2 bg-black text-white hover:bg-black/80 transition-colors"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => setAddingEvent(false)}
                  className="text-[10px] uppercase tracking-[0.15em] font-bold px-4 py-2 text-black/40 hover:text-black border border-black/10 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {dayEvents.length === 0 && !addingEvent ? (
            <p className="font-serif italic text-black/25 text-sm">Nothing scheduled.</p>
          ) : (
            <div className="space-y-2">
              {dayEvents.map(event => {
                const isSelected = selectedEventId === event.id
                return (
                  <div
                    key={event.id}
                    onClick={() => setSelectedEventId(isSelected ? null : event.id)}
                    className={`border p-4 cursor-pointer transition-colors ${
                      isSelected
                        ? "border-black bg-black/2"
                        : "border-black/8 hover:border-black/20"
                    }`}
                  >
                    <div className="flex items-baseline gap-4">
                      <span className="text-[10px] font-mono text-black/30 shrink-0 w-12">{event.time}</span>
                      <span className="text-sm text-black font-medium">{event.title}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Detail panel — slides in when event selected */}
        {selectedEvent && (
          <div className="w-72 shrink-0 border-l border-black/8 px-6 py-8 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
            <button
              onClick={() => setSelectedEventId(null)}
              className="text-[9px] uppercase tracking-[0.2em] text-black/25 hover:text-black transition-colors mb-6 block"
            >
              × Close
            </button>

            {/* Title */}
            <input
              key={`title-${selectedEvent.id}`}
              className="w-full text-base font-medium text-black bg-transparent border-b border-black/10 pb-1 mb-5 outline-none focus:border-black/40 transition-colors"
              defaultValue={selectedEvent.title}
              onBlur={e => setEventTitle(selectedEvent.id, e.target.value)}
            />

            {/* Time */}
            <div className="mb-4">
              <p className="text-[9px] uppercase tracking-[0.2em] text-black/30 font-bold mb-1">Time</p>
              <input
                key={`time-${selectedEvent.id}`}
                className="text-sm text-black bg-transparent border-b border-black/10 pb-1 outline-none focus:border-black/40 transition-colors w-full"
                defaultValue={selectedEvent.time}
                onBlur={e => setEventTime(selectedEvent.id, e.target.value)}
              />
            </div>

            {/* Location */}
            <div className="mb-6">
              <p className="text-[9px] uppercase tracking-[0.2em] text-black/30 font-bold mb-1">Location</p>
              <input
                key={`location-${selectedEvent.id}`}
                className="text-sm text-black bg-transparent border-b border-black/10 pb-1 outline-none focus:border-black/40 transition-colors w-full placeholder:text-black/20"
                defaultValue={selectedEvent.location ?? ""}
                placeholder="Add location…"
                onBlur={e => setEventLocation(selectedEvent.id, e.target.value)}
              />
            </div>

            {/* AI Prep Notes */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <p className="text-[9px] uppercase tracking-[0.2em] text-[#4285f4] font-bold">AI Prep Notes</p>
                {selectedEvent.fromEmail && (
                  <span className="text-[8px] uppercase tracking-widest font-bold text-[#4285f4] border border-[#4285f4]/30 px-1.5 py-0.5">
                    Via email
                  </span>
                )}
              </div>
              {notesLoading ? (
                <p className="text-xs font-serif italic text-black/30">Generating…</p>
              ) : (
                <textarea
                  key={`notes-${selectedEvent.id}`}
                  className="w-full text-xs font-serif italic text-black/60 bg-transparent outline-none resize-none leading-relaxed"
                  rows={7}
                  defaultValue={selectedEvent.notes ?? ""}
                  placeholder="No prep notes yet."
                  onBlur={e => setEventNotes(selectedEvent.id, e.target.value)}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
cd "/Users/marymckee/Desktop/Antigrav Projects/the-hub-claude/.worktrees/email-intake"
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Verify in browser**

Navigate to `http://localhost:3001/calendar`. Click any event — detail panel should open on the right. If the event has no notes yet, the panel should show "Generating…" then display bullet points. Click a different event — panel switches to new event. Click the selected event or "× Close" — panel collapses.

- [ ] **Step 4: Commit**

```bash
cd "/Users/marymckee/Desktop/Antigrav Projects/the-hub-claude/.worktrees/email-intake"
git add src/app/calendar/page.tsx
git commit -m "feat: calendar split panel with editable fields and AI prep notes"
```

---

### Task 4: Add Provisions section to TaskSchedule widget

**Files:**
- Modify: `src/components/widgets/task-schedule.tsx`

Requires Task 1 (`toggleGrocery` action, `GroceryItem.checked`).

- [ ] **Step 1: Add groceries to the destructured store values**

Find the line:
```tsx
  const { tasks, toggleTask, events } = useHub()
```

Replace with:
```tsx
  const { tasks, toggleTask, events, groceries, toggleGrocery } = useHub()
```

- [ ] **Step 2: Add the Provisions section between task list and schedule strip**

Find the comment `{/* Schedule strip */}` and insert the Provisions section immediately before it:

```tsx
      {/* Provisions */}
      {groceries.length > 0 && (
        <div className="shrink-0 pt-5 border-t border-black/8 mt-5">
          <p className="text-[10px] uppercase tracking-[0.25em] text-black/25 font-bold mb-3">Provisions</p>
          <div className="space-y-1">
            {groceries.slice(0, 6).map(item => (
              <div
                key={item.id}
                className="flex items-center gap-2.5 py-1 cursor-pointer group"
                onClick={() => toggleGrocery(item.id)}
              >
                <div
                  className="shrink-0 w-3.5 h-3.5 border flex items-center justify-center transition-all"
                  style={{
                    backgroundColor: item.checked ? "black" : "white",
                    borderColor: item.checked ? "black" : "rgba(0,0,0,0.2)",
                  }}
                >
                  {item.checked && (
                    <svg width="7" height="5" viewBox="0 0 7 5" fill="none">
                      <path d="M1 2.5L2.5 4L6 1" stroke="white" strokeWidth="1.5" strokeLinecap="square" />
                    </svg>
                  )}
                </div>
                <span
                  className="text-xs"
                  style={{
                    color: item.checked ? "rgba(0,0,0,0.25)" : "rgba(0,0,0,0.6)",
                    textDecoration: item.checked ? "line-through" : "none",
                  }}
                >
                  {item.name}
                </span>
              </div>
            ))}
            {groceries.length > 6 && (
              <p className="text-[10px] text-black/25 pl-6">+{groceries.length - 6} more</p>
            )}
          </div>
        </div>
      )}

      {/* Schedule strip */}
```

- [ ] **Step 3: Type-check**

```bash
cd "/Users/marymckee/Desktop/Antigrav Projects/the-hub-claude/.worktrees/email-intake"
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 4: Verify in browser**

Navigate to `http://localhost:3001`. The Tasks widget should show a "Provisions" section with the grocery list below the task list. Click a grocery item — it should toggle checked state with strikethrough styling.

- [ ] **Step 5: Commit**

```bash
cd "/Users/marymckee/Desktop/Antigrav Projects/the-hub-claude/.worktrees/email-intake"
git add src/components/widgets/task-schedule.tsx
git commit -m "feat: add Provisions grocery list to Tasks widget"
```

---

### Task 5: Final type check and cleanup

- [ ] **Step 1: Full type check**

```bash
cd "/Users/marymckee/Desktop/Antigrav Projects/the-hub-claude/.worktrees/email-intake"
npx tsc --noEmit 2>&1
```

Expected: no output (clean).

- [ ] **Step 2: End-to-end smoke test**

1. Open `http://localhost:3001`
2. Verify Provisions section appears in the Tasks widget with the mock grocery items (Almond Milk, Coffee Beans)
3. Click a grocery item — confirm it checks/unchecks
4. Navigate to `/calendar`
5. Click any event — confirm detail panel opens on the right
6. Confirm "Generating…" shows briefly, then AI bullet notes appear
7. Edit the title field, blur out — confirm title updates in the event list
8. Accept an email action of type CALENDAR_INVITE in the inbox — confirm "Via email" badge appears in the created event's detail panel
