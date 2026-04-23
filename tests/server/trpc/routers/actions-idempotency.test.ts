import { actionsRouter } from '@/server/trpc/routers/actions'
import { resolveActionContext } from '@/lib/server/action-resolver'
import { getIdempotencyRecord, setIdempotencyRecord } from '@/lib/server/idempotency-store'
import { createCalendarEvent } from '@/lib/server/calendar-writer'
import { findDuplicateCalendarEvent } from '@/lib/server/calendar-duplicate-check'
import { updateActionStatus } from '@/lib/server/emails-store'

jest.mock('@/lib/server/action-resolver')
jest.mock('@/lib/server/idempotency-store', () => {
  const actual = jest.requireActual('@/lib/server/idempotency-store')
  return { ...actual, getIdempotencyRecord: jest.fn(), setIdempotencyRecord: jest.fn() }
})
jest.mock('@/lib/server/calendar-writer')
jest.mock('@/lib/server/calendar-duplicate-check')
jest.mock('@/lib/server/emails-store')

const baseContext = {
  accessToken: 'at',
  account: { id: 'a1', email: 'mary@tribe.ai' },
  email: { id: 'e1' },
  action: {
    id: 'act1', type: 'CALENDAR_EVENT', status: 'EDITING',
    title: 'Ellie zoo trip', date: Date.UTC(2026, 4, 15, 0, 0, 0), time: '09:30',
  },
}

describe('actions router — idempotency + duplicate detection', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(resolveActionContext as jest.Mock).mockResolvedValue(baseContext)
    ;(findDuplicateCalendarEvent as jest.Mock).mockResolvedValue(null)
    ;(createCalendarEvent as jest.Mock).mockResolvedValue({ id: 'gcal-1' })
    ;(setIdempotencyRecord as jest.Mock).mockResolvedValue(undefined)
    ;(updateActionStatus as jest.Mock).mockResolvedValue(undefined)
  })

  it('second call with same key returns stored googleId without hitting Google', async () => {
    ;(getIdempotencyRecord as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ googleId: 'gcal-1', type: 'CALENDAR_EVENT', committedAt: 1 })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const caller = actionsRouter.createCaller({ uid: 'u1' } as any)

    const first = await caller.commitCalendar({
      emailId: 'e1', actionId: 'act1', timeZone: 'America/Los_Angeles',
    })
    const second = await caller.commitCalendar({
      emailId: 'e1', actionId: 'act1', timeZone: 'America/Los_Angeles',
    })

    expect(first.action.googleId).toBe('gcal-1')
    expect(second.action.googleId).toBe('gcal-1')
    expect(createCalendarEvent).toHaveBeenCalledTimes(1) // only the first call wrote to Google
  })

  it('duplicate detection throws CONFLICT with structured cause', async () => {
    ;(getIdempotencyRecord as jest.Mock).mockResolvedValue(null)
    ;(findDuplicateCalendarEvent as jest.Mock).mockResolvedValue({
      id: 'existing-evt-1',
      title: 'Ellie zoo trip',
      start: '2026-05-15T10:00:00-07:00',
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const caller = actionsRouter.createCaller({ uid: 'u1' } as any)

    await expect(
      caller.commitCalendar({
        emailId: 'e1', actionId: 'act1', timeZone: 'America/Los_Angeles',
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      cause: {
        existingEventId: 'existing-evt-1',
        existingTitle: 'Ellie zoo trip',
        existingStart: '2026-05-15T10:00:00-07:00',
      },
    })
    expect(createCalendarEvent).not.toHaveBeenCalled()
  })

  it('force: true bypasses duplicate detection and still writes', async () => {
    ;(getIdempotencyRecord as jest.Mock).mockResolvedValue(null)
    ;(findDuplicateCalendarEvent as jest.Mock).mockResolvedValue({
      id: 'existing-evt-1', title: 'Ellie zoo trip', start: '2026-05-15T10:00:00-07:00',
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const caller = actionsRouter.createCaller({ uid: 'u1' } as any)
    const result = await caller.commitCalendar({
      emailId: 'e1', actionId: 'act1', timeZone: 'America/Los_Angeles', force: true,
    })

    expect(result.action.googleId).toBe('gcal-1')
    expect(createCalendarEvent).toHaveBeenCalledTimes(1)
    // findDuplicateCalendarEvent should not even have been called because force short-circuits
    expect(findDuplicateCalendarEvent).not.toHaveBeenCalled()
  })

  it('duplicate detection is skipped for all-day events (no time)', async () => {
    ;(resolveActionContext as jest.Mock).mockResolvedValue({
      ...baseContext,
      action: { ...baseContext.action, time: undefined },
    })
    ;(getIdempotencyRecord as jest.Mock).mockResolvedValue(null)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const caller = actionsRouter.createCaller({ uid: 'u1' } as any)
    await caller.commitCalendar({
      emailId: 'e1', actionId: 'act1', timeZone: 'America/Los_Angeles',
    })
    expect(findDuplicateCalendarEvent).not.toHaveBeenCalled()
    expect(createCalendarEvent).toHaveBeenCalledTimes(1)
  })
})
