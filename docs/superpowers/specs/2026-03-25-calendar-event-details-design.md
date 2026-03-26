# Calendar Event Details + Grocery List in Tasks — Design Spec

**Date:** 2026-03-25
**Status:** Approved

---

## Overview

Two features:

1. **Calendar event details** — clicking an event opens a split detail panel with editable fields and AI-generated prep notes (generated on first click, cached).
2. **Grocery list in Tasks widget** — the hub's TaskSchedule widget gains a "Provisions" section showing the grocery list with checkboxes.

---

## Feature 1: Calendar Event Details

### Layout

The calendar day view splits when an event is selected:
- **Left**: existing event list (unchanged)
- **Right**: detail panel, same width as the event list column

Clicking the selected event again (or clicking elsewhere) collapses the panel. The panel slides in with a simple CSS transition.

### Detail Panel Fields

| Field | Behaviour |
|-------|-----------|
| **Title** | Editable inline input. Dispatches `setEventTitle(id, title)` on blur. |
| **Date + Time** | Displayed, editable. Dispatches `setEventTime(id, time)` on blur. |
| **Location** | Optional editable input. Dispatches `setEventLocation(id, location)` on blur. Placeholder "Add location…" when empty. |
| **AI Prep Notes** | Generated on first click if `event.notes === undefined`. Shows "Generating…" while loading, then an editable textarea. Dispatches `setEventNotes(id, notes)` on load and on user edit (debounced). |
| **Source badge** | Shown only when the event was created from an accepted email action. Displays "Via email" in blue. Requires adding `fromEmail?: boolean` to `CalendarEvent`. |

### AI Prep Note Generation

**Trigger:** First click on an event with `notes === undefined`.

**API route:** `POST /api/calendar/event-notes`

**Request body:**
```ts
{
  event: { title, date, time, location? }
  profiles: EntityProfile[]
  nearbyEvents: { title, date, time }[]  // same-day events for travel buffer context
}
```

**Response:**
```ts
{ notes: string }  // markdown bullet list, 2–4 items
```

**Model:** `claude-haiku-4-5-20251001`

**System prompt guidance:** Generate concise bullet-point prep notes for this event. Cross-reference family profiles for conflicts (allergies, routines, who is involved). Surface travel time concerns if nearby events exist. Flag any materials to bring. Keep to 2–4 bullets.

**Caching:** Result stored in `CalendarEvent.notes` via `setEventNotes`. Subsequent clicks use the cached value — no re-generation unless the user clears notes manually.

**Error handling:** If the API fails, show "Couldn't generate notes" in the panel. User can still edit the textarea manually.

### Auto-populate for AI-suggested Events

When an email action of type `CALENDAR_INVITE` is accepted (via `actOnEmailAction`), the created event gets `fromEmail: true`. The detail panel shows the source badge and generates prep notes on first click like any other event — no special pre-population beyond what the email already provided (title, date, time).

---

## Feature 2: Grocery List in Tasks Widget

### Location

A "Provisions" section added to `task-schedule.tsx`, between the task list and the schedule strip.

### Behaviour

- Shows `groceries` from `useHub()`
- Each item has a checkbox that calls `toggleGrocery(id)`
- Checked items shown with strikethrough at 30% opacity
- Section hidden if `groceries.length === 0`
- Max 6 items shown; "Show all" link if more

### Store Changes Required

`GroceryItem` gets `checked?: boolean` (defaults to `false` for existing items).

New store action: `toggleGrocery(id: string)` — flips `checked`. Persists to Firestore if not in mock mode.

---

## Store Changes Summary

### `CalendarEvent` type additions
```ts
location?: string
notes?: string           // undefined = not yet generated; empty string = user cleared
fromEmail?: boolean
```

### New store actions
```ts
setEventTitle(id: string, title: string): void
setEventTime(id: string, time: string): void
setEventLocation(id: string, location: string): void
setEventNotes(id: string, notes: string): void
```

### `GroceryItem` type addition
```ts
checked?: boolean
```

### New store action
```ts
toggleGrocery(id: string): void
```

---

## Files Changed

| File | Change |
|------|--------|
| `src/lib/store.tsx` | Add fields + actions above |
| `src/app/calendar/page.tsx` | Restructure day view to split panel, wire detail fields |
| `src/app/api/calendar/event-notes/route.ts` | New route |
| `src/components/widgets/task-schedule.tsx` | Add Provisions section |

---

## Out of Scope

- Recurring event support
- Editing the date (date picker UI complexity)
- Deleting events from the detail panel
- Re-generating notes on demand (user can just edit the textarea)
