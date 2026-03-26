# AI Chat — Design Spec

**Date:** 2026-03-25
**Status:** Approved

## Overview

Make the AI command bar at the bottom of the app functional. Users type a message, the AI responds inline with streaming text, and can take real actions (add tasks, events, groceries, complete tasks) directly against the store.

## Architecture

Two changes:

1. **New API route** — `POST /api/chat` — powered by Vercel AI SDK `streamText` with tool definitions
2. **Updated command bar** — `src/components/ai-command-bar.tsx` — replace manual submit with `useChat` hook, add inline expansion panel

No new dependencies needed. `@ai-sdk/anthropic` and `ai` are already in the project.

## API Route: `/api/chat`

**File:** `src/app/api/chat/route.ts`

**Request body:**
```ts
{
  messages: Message[]          // Vercel AI SDK message format
  context: {
    tasks: Task[]
    events: Event[]
    emails: { subject: string, snippet: string }[]   // trimmed — no full body
    profiles: EntityProfile[]
    groceries: GroceryItem[]
  }
}
```

**Auth:** Bearer token from `Authorization` header (same pattern as `/api/inbox/digest` and `/api/calendar/digest`).

**Model:** `claude-haiku-4-5-20251001` via `anthropic()` from `@ai-sdk/anthropic`.

**System prompt:** Serializes the context snapshot into plain English. Includes today's date. Positions the AI as a "Chief of Staff" that knows the family's full context and can take actions on their behalf.

**Tools exposed to the model:**

| Tool | Args | Effect |
|------|------|--------|
| `add_task` | `title: string, context: string, due: "today"\|"this-week"\|"someday", who?: string` | Creates a task in the store |
| `add_event` | `title: string, date: number, time: string` | Creates a calendar event |
| `add_grocery` | `name: string, quantity?: string` | Adds a grocery item |
| `complete_task` | `id: string` | Marks a task complete |

**`maxSteps: 3`** — allows tool call → AI confirmation response chains.

**Runtime:** `nodejs` (consistent with other routes).

## Command Bar UI

**File:** `src/components/ai-command-bar.tsx`

Replace manual `useState` + `seedTerminal` submit with `useChat` from `ai/react`.

**`useChat` configuration:**
- `api: "/api/chat"`
- `body`: includes store context snapshot (pulled via `useHub()` at send time)
- `onToolCall`: dispatches tool results to the store

**Layout change:** Bar becomes `flex-col`. When `messages.length > 0`, a panel renders above the input row.

**Panel:**
- `max-h-72 overflow-y-auto`, grows upward
- User messages right-aligned, AI messages left-aligned
- Streaming renders word by word (handled natively by `useChat`)
- Loading state: "Thinking..." while waiting for first token
- `×` button top-right clears messages (`setMessages([])`) and collapses panel
- Panel hidden when no messages exist

**Quick prompts:** Remain visible when input is empty and no messages are shown. Clicking a prompt sets it as the input value (existing behaviour preserved).

**`registerSeed` wiring:** Bar calls `registerSeed` on mount so external components can pre-fill the input via the existing `TerminalProvider` pub-sub bus.

## Action Wiring

`onToolCall` in the `useChat` config dispatches directly to the store:

```ts
onToolCall({ toolCall }) {
  if (toolCall.toolName === "add_task")
    addTask({ id: crypto.randomUUID(), completed: false, ...toolCall.args })
  if (toolCall.toolName === "add_event")
    addEvent({ id: crypto.randomUUID(), ...toolCall.args })
  if (toolCall.toolName === "add_grocery")
    addGrocery({ id: crypto.randomUUID(), checked: false, ...toolCall.args })
  if (toolCall.toolName === "complete_task")
    toggleTask(toolCall.args.id)
}
```

Tool calls are silent in the UI — the AI's reply text confirms the action in plain language. Existing Toaster notifications fire naturally (e.g. task completion already triggers a toast from the planner store).

## Context Sent to AI

Serialized from the store at send time. No live API calls inside the chat route — the client provides the snapshot. This keeps latency low and avoids re-fetching Gmail/Calendar on every message.

```
Today is {date}.

TASKS ({n} active):
- "Pick up prescriptions" [PERSONAL, today, who: Mary]
- ...

CALENDAR (this week):
- Gymnastics, Tue 25, 16:00
- ...

EMAILS ({n} unread):
- From: School Admin | "Bake sale Friday"
- ...

PROFILES:
- Annie (child): Medical: peanut allergy. Routines: Gymnastics Tue 16:00.
- ...

GROCERIES ({n} items):
- Milk (unchecked)
- ...
```

## Error Handling

- Missing auth header → 401
- Tool call with unknown task ID for `complete_task` → AI notified via tool result, responds gracefully
- API error → `useChat` surfaces error state; bar shows "Something went wrong" inline

## Out of Scope

- Conversation persistence (history resets on page refresh)
- Voice input
- Multi-turn memory across sessions
- Autonomous background actions (all actions require user-initiated message)
