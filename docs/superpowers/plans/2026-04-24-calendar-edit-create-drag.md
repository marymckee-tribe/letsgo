# Calendar — Edit / Create / Drag-to-Reschedule

> **Status:** Parked as a downstream plan. Queued after Phase 5/6/7 unless promoted.

**Goal:** Turn the read-only Calendar v2 page into a lightweight editor. Land three interactions on top of the existing Schedule-X + tRPC foundation:

1. **Edit an existing event** — drawer flips into edit mode; change title / time / description / location; save calls `calendar.updateEvent`.
2. **Delete an event** — button in the drawer; optimistic removal with undo toast.
3. **Create a new event from an empty slot** — click an empty grid cell (or an explicit "+ New event" button); small inline modal; save calls `calendar.createEvent`.
4. **Drag to reschedule** — install `@schedule-x/drag-and-drop`; on drop, patch the event via `calendar.updateEvent` with the new start/end.

**Architecture:** Three new `protectedProcedure.mutation`s on the existing `calendarRouter` — `createEvent`, `updateEvent`, `deleteEvent`. Each wraps a `fetch()` call against `https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events` (POST / PATCH / DELETE) with the same account-resolution + token-refresh helpers used by Phase 4's `actions.commitCalendar`. Optimistic updates on the client use the same `snapshot → mutate → rollback-on-error → invalidate-on-success` pattern as `useCommitAction`.

**Tech:** Schedule-X v4, `@schedule-x/drag-and-drop` (new install), `date-fns-tz` (already in), existing `calendar-writer.ts` primitives from Phase 4 (add matching `updateCalendarEvent` + `deleteCalendarEvent` wrappers).

**Scope boundaries:**
- Only the primary user's calendars. No shared-calendar permission handling beyond what Google's default perms enforce.
- No recurring-event editing UX (Google surfaces "this / this+all" options — punt to v2 of this plan).
- No attendee management / invitations.
- No conflict detection (Phase 4 has fuzzy title match for inbox-originated events; reuse not planned here).

**Prerequisites:**
- Calendar v2 PR #10 merged (depends on `CalendarApp`, `FilterSidebar`, `EventDetailDrawer`, `calendar.getEventEnrichment`, `CalendarMapping.color`).
- Google Calendar `calendar.events` scope already granted (it is — see `SCOPES` in `google-oauth.ts`).

## Tasks (rough shape)

- **T0. Install `@schedule-x/drag-and-drop`** + `temporal-polyfill/global` is already loaded so no polyfill work.
- **T1. Server — `updateCalendarEvent` + `deleteCalendarEvent`** in `src/lib/server/calendar-writer.ts` alongside existing `createCalendarEvent`. Typed errors mirror `CalendarWriteError`.
- **T2. Server — new tRPC procedures** `calendar.createEvent`, `calendar.updateEvent`, `calendar.deleteEvent`. Inputs: Zod-validated. Auth via `listAccounts` + `refreshAccessToken`. Tests mirror Phase 4's `actions.test.ts` pattern.
- **T3. Drawer edit mode** in `src/components/calendar/event-detail-drawer.tsx` — a toggle button flips fields to inputs (title, start, end, description, location). "Save" + "Cancel" actions. Delete button with confirm.
- **T4. Schedule-X drag plugin** in `CalendarApp` — mount `createDragAndDropPlugin()`, hook `onEventUpdate` callback to `calendar.updateEvent.useMutation` with optimistic update.
- **T5. Empty-slot creation** — wire Schedule-X's `onDateTimeSelection` callback to a new `<NewEventPopover>` that captures title + duration, calls `calendar.createEvent`.
- **T6. Optimistic-update cohesion** — factor the snapshot/rollback/invalidate pattern into a shared hook (or extend `useCommitAction`) so each of the three mutations use the same pattern.
- **T7. Tests** — unit tests for new server primitives; integration tests for each router procedure; RTL test for drawer edit mode transitions.
- **T8. Manual smoke** — edit, delete, drag, click-to-create; cross-check that the event actually changed in Google Calendar.

## Out of scope — for later

- Recurring-event editing (pick one occurrence vs series).
- Attendee add/remove + RSVP.
- Multi-calendar move (change `calendarId` on an event).
- Event reminders / notification config.

## Open questions

- Should drag-across-calendars be allowed, or lock drag to within the source calendar? (Leaning: lock; changing calendar is a menu action, not a drag.)
- How do we visually distinguish "pending write" vs "committed" events during optimistic update? Phase 4 uses a `WRITING` status on action cards; calendar events don't have that concept — probably just a subtle opacity dip on the chip until invalidate completes.
