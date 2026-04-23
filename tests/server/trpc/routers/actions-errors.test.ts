import { actionsRouter } from '@/server/trpc/routers/actions'
import { resolveActionContext } from '@/lib/server/action-resolver'
import { getIdempotencyRecord } from '@/lib/server/idempotency-store'
import { createCalendarEvent, CalendarWriteError } from '@/lib/server/calendar-writer'
import { findDuplicateCalendarEvent } from '@/lib/server/calendar-duplicate-check'
import { createTask, TasksWriteError, getDefaultTaskListId } from '@/lib/server/tasks-writer'
import { updateActionStatus } from '@/lib/server/emails-store'
import { TRPCError } from '@trpc/server'

jest.mock('@/lib/server/action-resolver')
jest.mock('@/lib/server/idempotency-store', () => {
  const actual = jest.requireActual('@/lib/server/idempotency-store')
  return { ...actual, getIdempotencyRecord: jest.fn(), setIdempotencyRecord: jest.fn() }
})
jest.mock('@/lib/server/calendar-writer', () => {
  const actual = jest.requireActual('@/lib/server/calendar-writer')
  return { ...actual, createCalendarEvent: jest.fn() }
})
jest.mock('@/lib/server/calendar-duplicate-check')
jest.mock('@/lib/server/tasks-writer', () => {
  const actual = jest.requireActual('@/lib/server/tasks-writer')
  return { ...actual, createTask: jest.fn(), getDefaultTaskListId: jest.fn() }
})
jest.mock('@/lib/server/emails-store')

const calendarAction = {
  accessToken: 'at',
  account: { id: 'a1', email: 'mary@tribe.ai' },
  email: { id: 'e1' },
  action: {
    id: 'act1', type: 'CALENDAR_EVENT', status: 'EDITING',
    title: 'Zoo', date: Date.UTC(2026, 4, 15, 0, 0, 0), time: '09:30',
  },
}

const taskAction = {
  accessToken: 'at',
  account: { id: 'a1', email: 'mary@tribe.ai' },
  email: { id: 'e1' },
  action: {
    id: 'act1', type: 'TODO', status: 'EDITING',
    title: 'Sign slip', date: Date.UTC(2026, 4, 20, 0, 0, 0),
  },
}

describe('actions router — error matrix', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(getIdempotencyRecord as jest.Mock).mockResolvedValue(null)
    ;(findDuplicateCalendarEvent as jest.Mock).mockResolvedValue(null)
    ;(updateActionStatus as jest.Mock).mockResolvedValue(undefined)
  })

  it('5xx from Calendar → TIMEOUT; action is NOT flipped to FAILED (stays EDITING)', async () => {
    ;(resolveActionContext as jest.Mock).mockResolvedValue(calendarAction)
    ;(createCalendarEvent as jest.Mock).mockRejectedValue(new CalendarWriteError('boom', 503))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const caller = actionsRouter.createCaller({ uid: 'u1' } as any)
    await expect(
      caller.commitCalendar({ emailId: 'e1', actionId: 'act1', timeZone: 'UTC' }),
    ).rejects.toMatchObject({ code: 'TIMEOUT' })

    expect(updateActionStatus).not.toHaveBeenCalledWith(
      'u1', 'e1', 'act1',
      expect.objectContaining({ status: 'FAILED' }),
    )
  })

  it('network error (no HTTP status) → INTERNAL_SERVER_ERROR; stays EDITING', async () => {
    ;(resolveActionContext as jest.Mock).mockResolvedValue(calendarAction)
    ;(createCalendarEvent as jest.Mock).mockRejectedValue(new Error('ECONNRESET'))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const caller = actionsRouter.createCaller({ uid: 'u1' } as any)
    await expect(
      caller.commitCalendar({ emailId: 'e1', actionId: 'act1', timeZone: 'UTC' }),
    ).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' })

    expect(updateActionStatus).not.toHaveBeenCalledWith(
      'u1', 'e1', 'act1', expect.objectContaining({ status: 'FAILED' }),
    )
  })

  it('4xx (non-401) from Calendar → BAD_REQUEST; action flips to FAILED with message', async () => {
    ;(resolveActionContext as jest.Mock).mockResolvedValue(calendarAction)
    ;(createCalendarEvent as jest.Mock).mockRejectedValue(new CalendarWriteError('bad summary', 400))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const caller = actionsRouter.createCaller({ uid: 'u1' } as any)
    await expect(
      caller.commitCalendar({ emailId: 'e1', actionId: 'act1', timeZone: 'UTC' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })

    expect(updateActionStatus).toHaveBeenCalledWith(
      'u1', 'e1', 'act1',
      expect.objectContaining({ status: 'FAILED', errorMessage: 'bad summary' }),
    )
  })

  it('401 from Calendar → UNAUTHORIZED; action is NOT flipped to FAILED (token-refresh UX)', async () => {
    ;(resolveActionContext as jest.Mock).mockResolvedValue(calendarAction)
    ;(createCalendarEvent as jest.Mock).mockRejectedValue(new CalendarWriteError('expired', 401))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const caller = actionsRouter.createCaller({ uid: 'u1' } as any)
    await expect(
      caller.commitCalendar({ emailId: 'e1', actionId: 'act1', timeZone: 'UTC' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })

    expect(updateActionStatus).not.toHaveBeenCalledWith(
      'u1', 'e1', 'act1', expect.objectContaining({ status: 'FAILED' }),
    )
  })

  it('upstream refreshAccessToken failure → UNAUTHORIZED with re-link message', async () => {
    ;(resolveActionContext as jest.Mock).mockRejectedValue(
      new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Google token refresh failed (invalid_grant). Please re-add the account.',
      }),
    )

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const caller = actionsRouter.createCaller({ uid: 'u1' } as any)
    await expect(
      caller.commitCalendar({ emailId: 'e1', actionId: 'act1', timeZone: 'UTC' }),
    ).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      message: expect.stringContaining('re-add'),
    })
  })

  it('4xx from Tasks → BAD_REQUEST; action flips to FAILED', async () => {
    ;(resolveActionContext as jest.Mock).mockResolvedValue(taskAction)
    ;(getDefaultTaskListId as jest.Mock).mockResolvedValue('list-a')
    ;(createTask as jest.Mock).mockRejectedValue(new TasksWriteError('forbidden', 403))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const caller = actionsRouter.createCaller({ uid: 'u1' } as any)
    await expect(
      caller.commitTask({ emailId: 'e1', actionId: 'act1', timeZone: 'UTC' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })

    expect(updateActionStatus).toHaveBeenCalledWith(
      'u1', 'e1', 'act1',
      expect.objectContaining({ status: 'FAILED', errorMessage: 'forbidden' }),
    )
  })

  it('5xx from Tasks → TIMEOUT; stays EDITING', async () => {
    ;(resolveActionContext as jest.Mock).mockResolvedValue(taskAction)
    ;(getDefaultTaskListId as jest.Mock).mockResolvedValue('list-a')
    ;(createTask as jest.Mock).mockRejectedValue(new TasksWriteError('backend down', 502))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const caller = actionsRouter.createCaller({ uid: 'u1' } as any)
    await expect(
      caller.commitTask({ emailId: 'e1', actionId: 'act1', timeZone: 'UTC' }),
    ).rejects.toMatchObject({ code: 'TIMEOUT' })

    expect(updateActionStatus).not.toHaveBeenCalledWith(
      'u1', 'e1', 'act1', expect.objectContaining({ status: 'FAILED' }),
    )
  })
})
