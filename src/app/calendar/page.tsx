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

      <div className="flex flex-1 min-h-0">
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

        {selectedEvent && (
          <div className="w-72 shrink-0 border-l border-black/8 px-6 py-8 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
            <button
              onClick={() => setSelectedEventId(null)}
              className="text-[9px] uppercase tracking-[0.2em] text-black/25 hover:text-black transition-colors mb-6 block"
            >
              × Close
            </button>

            <input
              key={`title-${selectedEvent.id}`}
              className="w-full text-base font-medium text-black bg-transparent border-b border-black/10 pb-1 mb-5 outline-none focus:border-black/40 transition-colors"
              defaultValue={selectedEvent.title}
              onBlur={e => setEventTitle(selectedEvent.id, e.target.value)}
            />

            <div className="mb-4">
              <p className="text-[9px] uppercase tracking-[0.2em] text-black/30 font-bold mb-1">Time</p>
              <input
                key={`time-${selectedEvent.id}`}
                className="text-sm text-black bg-transparent border-b border-black/10 pb-1 outline-none focus:border-black/40 transition-colors w-full"
                defaultValue={selectedEvent.time}
                onBlur={e => setEventTime(selectedEvent.id, e.target.value)}
              />
            </div>

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
