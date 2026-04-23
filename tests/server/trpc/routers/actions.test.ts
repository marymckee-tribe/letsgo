import { actionsRouter } from '@/server/trpc/routers/actions'
import { resolveActionContext } from '@/lib/server/action-resolver'
import {
  getIdempotencyRecord,
  setIdempotencyRecord,
  buildIdempotencyKey,
} from '@/lib/server/idempotency-store'
import { createCalendarEvent } from '@/lib/server/calendar-writer'
import { findDuplicateCalendarEvent } from '@/lib/server/calendar-duplicate-check'
import { createTask, getDefaultTaskListId } from '@/lib/server/tasks-writer'
import { updateActionStatus } from '@/lib/server/emails-store'

jest.mock('@/lib/server/action-resolver')
jest.mock('@/lib/server/idempotency-store', () => {
  const actual = jest.requireActual('@/lib/server/idempotency-store')
  return {
    ...actual,
    getIdempotencyRecord: jest.fn(),
    setIdempotencyRecord: jest.fn(),
  }
})
jest.mock('@/lib/server/calendar-writer')
jest.mock('@/lib/server/calendar-duplicate-check')
jest.mock('@/lib/server/tasks-writer')
jest.mock('@/lib/server/emails-store')

describe('actions router — happy paths', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(resolveActionContext as jest.Mock).mockResolvedValue({
      accessToken: 'at',
      account: { id: 'a1', email: 'mary@tribe.ai' },
      email: { id: 'e1' },
      action: {
        id: 'act1',
        type: 'CALENDAR_EVENT',
        status: 'EDITING',
        title: 'Ellie zoo trip',
        date: Date.UTC(2026, 4, 15, 0, 0, 0),
        time: '09:30',
      },
    })
    ;(getIdempotencyRecord as jest.Mock).mockResolvedValue(null)
    ;(findDuplicateCalendarEvent as jest.Mock).mockResolvedValue(null)
    ;(createCalendarEvent as jest.Mock).mockResolvedValue({ id: 'gcal-evt-1', htmlLink: 'https://x' })
    ;(getDefaultTaskListId as jest.Mock).mockResolvedValue('list-a')
    ;(createTask as jest.Mock).mockResolvedValue({ id: 'gt-1' })
    ;(setIdempotencyRecord as jest.Mock).mockResolvedValue(undefined)
    ;(updateActionStatus as jest.Mock).mockResolvedValue(undefined)
  })

  it('commitCalendar writes the event, stores googleId, returns the action', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const caller = actionsRouter.createCaller({ uid: 'u1' } as any)
    const result = await caller.commitCalendar({
      emailId: 'e1',
      actionId: 'act1',
      timeZone: 'America/Los_Angeles',
    })

    expect(createCalendarEvent).toHaveBeenCalledWith(
      'at',
      expect.objectContaining({
        summary: 'Ellie zoo trip',
        start: expect.objectContaining({ timeZone: 'America/Los_Angeles' }),
      }),
    )
    expect(setIdempotencyRecord).toHaveBeenCalledWith('u1', 'e1:act1', {
      googleId: 'gcal-evt-1',
      type: 'CALENDAR_EVENT',
    })
    expect(updateActionStatus).toHaveBeenCalledWith(
      'u1', 'e1', 'act1',
      expect.objectContaining({ status: 'COMMITTED', googleId: 'gcal-evt-1' }),
    )
    expect(result.action.status).toBe('COMMITTED')
    expect(result.action.googleId).toBe('gcal-evt-1')
  })

  it('commitTask writes a task on the default list, stores googleId', async () => {
    ;(resolveActionContext as jest.Mock).mockResolvedValue({
      accessToken: 'at',
      account: { id: 'a1' },
      email: { id: 'e1' },
      action: {
        id: 'act1', type: 'TODO', status: 'EDITING',
        title: 'Sign permission slip', date: Date.UTC(2026, 4, 20, 0, 0, 0),
      },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const caller = actionsRouter.createCaller({ uid: 'u1' } as any)
    const result = await caller.commitTask({
      emailId: 'e1',
      actionId: 'act1',
      timeZone: 'America/Los_Angeles',
    })
    expect(getDefaultTaskListId).toHaveBeenCalledWith('at')
    expect(createTask).toHaveBeenCalledWith(
      'at', 'list-a',
      expect.objectContaining({ title: 'Sign permission slip' }),
    )
    expect(setIdempotencyRecord).toHaveBeenCalledWith('u1', 'e1:act1', {
      googleId: 'gt-1', type: 'TODO',
    })
    expect(result.action.status).toBe('COMMITTED')
  })

  it('dismiss moves the action to DISMISSED without a Google write', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const caller = actionsRouter.createCaller({ uid: 'u1' } as any)
    await caller.dismiss({ emailId: 'e1', actionId: 'act1' })
    expect(createCalendarEvent).not.toHaveBeenCalled()
    expect(createTask).not.toHaveBeenCalled()
    expect(updateActionStatus).toHaveBeenCalledWith(
      'u1', 'e1', 'act1',
      { status: 'DISMISSED' },
    )
  })

  it('commitCalendar rejects unauthenticated callers', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const caller = actionsRouter.createCaller({} as any)
    await expect(
      caller.commitCalendar({ emailId: 'e1', actionId: 'act1', timeZone: 'UTC' }),
    ).rejects.toThrow()
  })

  it('buildIdempotencyKey is used verbatim', () => {
    expect(buildIdempotencyKey('e1', 'act1')).toBe('e1:act1')
  })
})
