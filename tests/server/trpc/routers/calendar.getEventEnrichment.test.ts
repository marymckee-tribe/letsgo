import { calendarRouter } from '@/server/trpc/routers/calendar'
import { listAccounts, getDecryptedRefreshToken } from '@/lib/server/accounts'
import { refreshAccessToken } from '@/lib/server/google-oauth'
import { fetchCalendarEvents } from '@/lib/server/calendar-fetcher'
import { listCalendarMappings } from '@/lib/server/calendar-mappings'
import * as aiModule from 'ai'

jest.mock('@/lib/server/accounts')
jest.mock('@/lib/server/google-oauth')
jest.mock('@/lib/server/calendar-fetcher')
jest.mock('@/lib/server/calendar-mappings')
jest.mock('ai', () => ({
  generateObject: jest.fn(),
}))
jest.mock('@ai-sdk/openai', () => ({ openai: jest.fn() }))

describe('calendar.getEventEnrichment', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(listAccounts as jest.Mock).mockResolvedValue([{ id: 'a1', email: 'mary@tribe.ai' }])
    ;(getDecryptedRefreshToken as jest.Mock).mockResolvedValue('rt')
    ;(refreshAccessToken as jest.Mock).mockResolvedValue({ accessToken: 'at', expiresAt: 0 })
    ;(listCalendarMappings as jest.Mock).mockResolvedValue([])
    ;(fetchCalendarEvents as jest.Mock).mockResolvedValue([
      {
        id: 'e1',
        title: 'Dentist',
        start: '2026-04-23T15:00:00.000Z',
        end: '2026-04-23T16:00:00.000Z',
        location: '123 Main St, San Francisco, CA',
        calendarId: 'cal1',
      },
      {
        id: 'e2',
        title: 'Lunch',
        start: '2026-04-23T12:00:00.000Z',
        calendarId: 'cal1',
      },
    ])
  })

  describe('per-event shape ({ eventId })', () => {
    it('returns perEvent populated and dailyInsights empty', async () => {
      ;(aiModule.generateObject as jest.Mock).mockResolvedValue({
        object: {
          prepSuggestion: 'Bring insurance card and recent X-rays.',
        },
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const caller = calendarRouter.createCaller({ uid: 'mary-uid' } as any)
      const result = await caller.getEventEnrichment({ eventId: 'e1' })
      expect(result.perEvent?.prepSuggestion).toContain('insurance')
      expect(result.dailyInsights).toEqual([])
    })

    it('throws NOT_FOUND when the event does not exist', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const caller = calendarRouter.createCaller({ uid: 'mary-uid' } as any)
      await expect(caller.getEventEnrichment({ eventId: 'nonexistent' }))
        .rejects.toThrow(/NOT_FOUND|not found/i)
    })

    it("passes the target event's fields into the prompt context", async () => {
      const generateObject = aiModule.generateObject as jest.Mock
      generateObject.mockResolvedValue({
        object: { prepSuggestion: null },
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const caller = calendarRouter.createCaller({ uid: 'mary-uid' } as any)
      await caller.getEventEnrichment({ eventId: 'e1' })
      const promptArg = generateObject.mock.calls[0][0].prompt as string
      expect(promptArg).toContain('Dentist')
      expect(promptArg).toContain('123 Main St')
    })
  })

  describe('per-day shape ({ dayISO })', () => {
    it('returns dailyInsights populated and perEvent null', async () => {
      ;(aiModule.generateObject as jest.Mock).mockResolvedValue({
        object: {
          insights: ['Your morning is clear — good block for deep work.'],
        },
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const caller = calendarRouter.createCaller({ uid: 'mary-uid' } as any)
      const result = await caller.getEventEnrichment({ dayISO: '2026-04-23' })
      expect(result.dailyInsights).toEqual(['Your morning is clear — good block for deep work.'])
      expect(result.perEvent).toBeNull()
    })

    it('returns empty dailyInsights when there are no events on that day', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const caller = calendarRouter.createCaller({ uid: 'mary-uid' } as any)
      const result = await caller.getEventEnrichment({ dayISO: '2030-01-01' })
      expect(result.dailyInsights).toEqual([])
      expect(result.perEvent).toBeNull()
    })
  })

  describe('auth + input validation', () => {
    it('rejects unauthenticated callers', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const caller = calendarRouter.createCaller({} as any)
      await expect(caller.getEventEnrichment({ eventId: 'e1' })).rejects.toThrow()
    })

    it('rejects inputs that provide neither eventId nor dayISO', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const caller = calendarRouter.createCaller({ uid: 'mary-uid' } as any)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await expect(caller.getEventEnrichment({} as any)).rejects.toThrow()
    })

    it('rejects inputs that provide both eventId and dayISO', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const caller = calendarRouter.createCaller({ uid: 'mary-uid' } as any)
      await expect(caller.getEventEnrichment({ eventId: 'e1', dayISO: '2026-04-23' }))
        .rejects.toThrow()
    })
  })
})
