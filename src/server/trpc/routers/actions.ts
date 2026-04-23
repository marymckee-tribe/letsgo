import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, protectedProcedure } from '../index'
import { resolveActionContext } from '@/lib/server/action-resolver'
import {
  buildIdempotencyKey,
  getIdempotencyRecord,
  setIdempotencyRecord,
} from '@/lib/server/idempotency-store'
import { createCalendarEvent, CalendarWriteError } from '@/lib/server/calendar-writer'
import { findDuplicateCalendarEvent } from '@/lib/server/calendar-duplicate-check'
import { createTask, getDefaultTaskListId, TasksWriteError } from '@/lib/server/tasks-writer'
import { updateActionStatus, type StoredAction } from '@/lib/server/emails-store'
import { buildCalendarDateTime, buildCalendarAllDay } from '@/lib/server/tz-helpers'

const CommitInput = z.object({
  emailId: z.string().min(1),
  actionId: z.string().min(1),
  timeZone: z.string().min(1), // IANA, e.g. "America/Los_Angeles"
  force: z.boolean().optional(), // only read by commitCalendar
})

const DismissInput = z.object({
  emailId: z.string().min(1),
  actionId: z.string().min(1),
})

type CommitInputType = z.infer<typeof CommitInput>

function mapErrorToTRPC(err: unknown): TRPCError {
  if (err instanceof TRPCError) return err
  if (err instanceof CalendarWriteError || err instanceof TasksWriteError) {
    const status = err.statusCode
    if (status === 401) {
      return new TRPCError({ code: 'UNAUTHORIZED', message: err.message })
    }
    if (status >= 500) {
      // transient — server returns TIMEOUT so the client classifies it correctly
      return new TRPCError({ code: 'TIMEOUT', message: err.message })
    }
    return new TRPCError({ code: 'BAD_REQUEST', message: err.message })
  }
  const message = err instanceof Error ? err.message : 'Unknown error'
  return new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message })
}

function addOneHour(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const next = (h + 1) % 24
  return `${String(next).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

async function commitCalendarImpl(
  uid: string,
  input: CommitInputType,
): Promise<{ action: { id: string; status: 'COMMITTED'; googleId: string } }> {
  const key = buildIdempotencyKey(input.emailId, input.actionId)

  // Idempotency short-circuit: if this key already committed, return the stored state.
  const existing = await getIdempotencyRecord(uid, key)
  if (existing && existing.type === 'CALENDAR_EVENT') {
    await updateActionStatus(uid, input.emailId, input.actionId, {
      status: 'COMMITTED',
      googleId: existing.googleId,
    })
    return {
      action: {
        id: input.actionId,
        status: 'COMMITTED' as const,
        googleId: existing.googleId,
      },
    }
  }

  const { action, accessToken } = await resolveActionContext({
    uid,
    emailId: input.emailId,
    actionId: input.actionId,
  })

  if (action.type !== 'CALENDAR_EVENT') {
    throw new TRPCError({ code: 'BAD_REQUEST', message: `Action ${input.actionId} is not a CALENDAR_EVENT` })
  }

  const title = String(action.title ?? 'Untitled event')
  const dateEpochMs = Number(action.date ?? 0)
  const hasTime = typeof action.time === 'string' && action.time.length > 0

  const start = hasTime
    ? buildCalendarDateTime({ dateEpochMs, time: action.time as string, timeZone: input.timeZone })
    : buildCalendarAllDay({ dateEpochMs, timeZone: input.timeZone })

  // Duplicate detection (timed events only — all-day is ambiguous enough we skip it)
  if (hasTime && !input.force) {
    const startDateTime = (start as { dateTime: string }).dateTime
    const dupe = await findDuplicateCalendarEvent(accessToken, {
      title,
      startDateTime,
    })
    if (dupe) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: `An event titled "${dupe.title}" already exists near that time`,
        cause: {
          existingEventId: dupe.id,
          existingTitle: dupe.title,
          existingStart: dupe.start,
        },
      })
    }
  }

  const end = hasTime
    ? buildCalendarDateTime({
        dateEpochMs,
        time: addOneHour(action.time as string),
        timeZone: input.timeZone,
      })
    : buildCalendarAllDay({ dateEpochMs, timeZone: input.timeZone })

  let googleEvent
  try {
    googleEvent = await createCalendarEvent(accessToken, {
      summary: title,
      description: typeof action.sourceQuote === 'string' ? `From email: "${action.sourceQuote}"` : undefined,
      location: typeof action.location === 'string' ? action.location : undefined,
      start,
      end,
    })
  } catch (err) {
    // leave the action in EDITING for 5xx; flip to FAILED for 4xx. The UI decides based on the code.
    if (err instanceof CalendarWriteError && err.statusCode >= 400 && err.statusCode < 500 && err.statusCode !== 401) {
      await updateActionStatus(uid, input.emailId, input.actionId, {
        status: 'FAILED',
        errorMessage: err.message,
      })
    }
    throw mapErrorToTRPC(err)
  }

  await setIdempotencyRecord(uid, key, {
    googleId: googleEvent.id,
    type: 'CALENDAR_EVENT',
  })
  await updateActionStatus(uid, input.emailId, input.actionId, {
    status: 'COMMITTED',
    googleId: googleEvent.id,
  })

  return {
    action: {
      id: input.actionId,
      status: 'COMMITTED' as const,
      googleId: googleEvent.id,
    },
  }
}

async function commitTaskImpl(
  uid: string,
  input: CommitInputType,
): Promise<{ action: { id: string; status: 'COMMITTED'; googleId: string } }> {
  const key = buildIdempotencyKey(input.emailId, input.actionId)

  const existing = await getIdempotencyRecord(uid, key)
  if (existing && existing.type === 'TODO') {
    await updateActionStatus(uid, input.emailId, input.actionId, {
      status: 'COMMITTED',
      googleId: existing.googleId,
    })
    return {
      action: {
        id: input.actionId,
        status: 'COMMITTED' as const,
        googleId: existing.googleId,
      },
    }
  }

  const { action, accessToken } = await resolveActionContext({
    uid,
    emailId: input.emailId,
    actionId: input.actionId,
  })

  if (action.type !== 'TODO') {
    throw new TRPCError({ code: 'BAD_REQUEST', message: `Action ${input.actionId} is not a TODO` })
  }

  const title = String(action.title ?? 'Untitled task')
  const dateEpochMs = typeof action.date === 'number' ? action.date : null
  const due = dateEpochMs !== null
    ? new Date(dateEpochMs).toISOString().split('T')[0] + 'T00:00:00.000Z' // Google Tasks uses date-only
    : undefined

  let listId: string
  try {
    listId = await getDefaultTaskListId(accessToken)
  } catch (err) {
    throw mapErrorToTRPC(err)
  }

  let googleTask
  try {
    googleTask = await createTask(accessToken, listId, {
      title,
      notes: typeof action.sourceQuote === 'string' ? `From email: "${action.sourceQuote}"` : undefined,
      due,
    })
  } catch (err) {
    if (err instanceof TasksWriteError && err.statusCode >= 400 && err.statusCode < 500 && err.statusCode !== 401) {
      await updateActionStatus(uid, input.emailId, input.actionId, {
        status: 'FAILED',
        errorMessage: err.message,
      })
    }
    throw mapErrorToTRPC(err)
  }

  await setIdempotencyRecord(uid, key, {
    googleId: googleTask.id,
    type: 'TODO',
  })
  await updateActionStatus(uid, input.emailId, input.actionId, {
    status: 'COMMITTED',
    googleId: googleTask.id,
  })

  return {
    action: {
      id: input.actionId,
      status: 'COMMITTED' as const,
      googleId: googleTask.id,
    },
  }
}

export const actionsRouter = router({
  commitCalendar: protectedProcedure
    .input(CommitInput)
    .mutation(({ ctx, input }) => commitCalendarImpl(ctx.uid, input)),

  commitTask: protectedProcedure
    .input(CommitInput)
    .mutation(({ ctx, input }) => commitTaskImpl(ctx.uid, input)),

  dismiss: protectedProcedure
    .input(DismissInput)
    .mutation(async ({ ctx, input }) => {
      await updateActionStatus(ctx.uid, input.emailId, input.actionId, {
        status: 'DISMISSED',
      })
      return {
        action: { id: input.actionId, status: 'DISMISSED' as const } satisfies Partial<StoredAction>,
      }
    }),

  retry: protectedProcedure
    .input(CommitInput)
    .mutation(async ({ ctx, input }) => {
      // Thin wrapper: look at the action's type and dispatch to the same logic.
      const { action } = await resolveActionContext({
        uid: ctx.uid,
        emailId: input.emailId,
        actionId: input.actionId,
      })
      if (action.type === 'CALENDAR_EVENT') {
        return commitCalendarImpl(ctx.uid, input)
      }
      if (action.type === 'TODO') {
        return commitTaskImpl(ctx.uid, input)
      }
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Action type ${String(action.type)} is not retryable`,
      })
    }),
})
