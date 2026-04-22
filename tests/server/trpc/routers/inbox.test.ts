import { inboxRouter } from '@/server/trpc/routers/inbox'
import { mockCtx } from '../helpers'
import { listAccounts, getDecryptedRefreshToken } from '@/lib/server/accounts'
import { refreshAccessToken } from '@/lib/server/google-oauth'
import { fetchUnreadPrimary } from '@/lib/server/gmail-fetcher'
import { seedProfilesIfEmpty } from '@/lib/server/profiles'
import * as aiModule from 'ai'

jest.mock('@/lib/server/accounts')
jest.mock('@/lib/server/google-oauth')
jest.mock('@/lib/server/gmail-fetcher')
jest.mock('@/lib/server/profiles')
jest.mock('ai', () => ({ generateObject: jest.fn() }))
jest.mock('@ai-sdk/anthropic', () => ({ anthropic: jest.fn() }))
// digest now calls getHubStatusMap — mock returns empty map (no overrides = UNREAD default, preserving pre-Phase-3 behavior)
jest.mock('@/lib/server/inbox-status', () => ({
  getHubStatusMap: jest.fn().mockResolvedValue({}),
  setHubStatus: jest.fn(),
}))

const baseRaw = {
  id: 'm1',
  subject: 'Zoo trip',
  sender: 'Ms. Redd <office@blessedsacrament.org>',
  snippet: 'Zoo Thursday',
  fullBody: 'Zoo trip Thursday 8am. Peanut-free lunches please.',
  date: 1_745_000_000_000,
  attachments: [] as { id: string; filename: string; mimeType: string; size: number }[],
}

const baseClassified = {
  id: 'm1',
  classification: 'CALENDAR_EVENT',
  snippet: 'Zoo trip with Ellie on Thursday.',
  senderIdentity: { personId: 'ellie', confidence: 'high' },
  suggestedActions: [
    {
      id: 'a1',
      type: 'CALENDAR_EVENT',
      title: 'Zoo trip',
      date: 1_745_000_000_000,
      time: '8:00 AM',
      context: 'FAMILY',
      sourceQuote: 'Zoo trip Thursday 8am.',
      confidence: 'high',
    },
  ],
}

describe('inbox router (Phase 2)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(listAccounts as jest.Mock).mockResolvedValue([{ id: 'a1', email: 'mary@tribe.ai' }])
    ;(getDecryptedRefreshToken as jest.Mock).mockResolvedValue('rt')
    ;(refreshAccessToken as jest.Mock).mockResolvedValue({ accessToken: 'at', expiresAt: 0 })
    ;(fetchUnreadPrimary as jest.Mock).mockResolvedValue([baseRaw])
    ;(seedProfilesIfEmpty as jest.Mock).mockResolvedValue([
      {
        id: 'ellie', name: 'Ellie', type: 'Child',
        currentContext: '', preferences: [], routines: [], sizes: {},
        medicalNotes: 'Peanut allergy',
        knownDomains: ['blessedsacrament.org'],
      },
    ])
    ;(aiModule.generateObject as jest.Mock).mockResolvedValue({ object: { emails: [baseClassified] } })
  })

  it('returns richer Email records with classification, senderIdentity, hubStatus, sourceQuote', async () => {
    const caller = inboxRouter.createCaller(mockCtx({ uid: 'mary-uid' }))
    const { emails } = await caller.digest()
    expect(emails).toHaveLength(1)
    const e = emails[0]
    expect(e.id).toBe('m1')
    expect(e.classification).toBe('CALENDAR_EVENT')
    expect(e.senderIdentity).toEqual({ personId: 'ellie', confidence: 'high' })
    expect(e.hubStatus).toBe('UNREAD')
    expect(e.suggestedActions[0].sourceQuote).toBe('Zoo trip Thursday 8am.')
    expect(e.suggestedActions[0].status).toBe('PROPOSED')
    expect(e.accountId).toBe('a1')
    expect(e.accountEmail).toBe('mary@tribe.ai')
  })

  it('returns empty array when no accounts return emails (does not call the LLM)', async () => {
    ;(fetchUnreadPrimary as jest.Mock).mockResolvedValue([])
    const caller = inboxRouter.createCaller(mockCtx({ uid: 'mary-uid' }))
    const { emails } = await caller.digest()
    expect(emails).toEqual([])
    expect(aiModule.generateObject).not.toHaveBeenCalled()
  })

  it('pre-resolves sender identity from knownDomains and passes it to the prompt', async () => {
    const caller = inboxRouter.createCaller(mockCtx({ uid: 'mary-uid' }))
    await caller.digest()
    const options = (aiModule.generateObject as jest.Mock).mock.calls[0][0]
    expect(options.prompt).toMatch(/"personId": "ellie"/)
    expect(options.prompt).toMatch(/"confidence": "medium"/)
  })

  it('renders email send-time as ISO-local string in the prompt (no raw epoch ms)', async () => {
    const caller = inboxRouter.createCaller(mockCtx({ uid: 'mary-uid' }))
    await caller.digest()
    const options = (aiModule.generateObject as jest.Mock).mock.calls[0][0]
    expect(options.prompt).toMatch(/2025-04-18T/)
    expect(options.prompt).not.toContain('1745000000000')
  })

  it('stamps every email with hubStatus=UNREAD even if the LLM omits senderIdentity', async () => {
    ;(aiModule.generateObject as jest.Mock).mockResolvedValue({
      object: { emails: [{ ...baseClassified, senderIdentity: undefined }] },
    })
    const caller = inboxRouter.createCaller(mockCtx({ uid: 'mary-uid' }))
    const { emails } = await caller.digest()
    expect(emails[0].hubStatus).toBe('UNREAD')
    expect(emails[0].senderIdentity).toBeUndefined()
  })

  it('preserves fullBody / attachments / accountEmail from the raw fetch', async () => {
    ;(fetchUnreadPrimary as jest.Mock).mockResolvedValue([
      { ...baseRaw, attachments: [{ id: 'at1', filename: 'permission.pdf', mimeType: 'application/pdf', size: 1234 }] },
    ])
    const caller = inboxRouter.createCaller(mockCtx({ uid: 'mary-uid' }))
    const { emails } = await caller.digest()
    expect(emails[0].fullBody).toContain('Zoo trip Thursday')
    expect(emails[0].attachments).toHaveLength(1)
    expect(emails[0].attachments[0].filename).toBe('permission.pdf')
    expect(emails[0].accountEmail).toBe('mary@tribe.ai')
  })

  it('rejects unauthenticated callers', async () => {
    const caller = inboxRouter.createCaller(mockCtx())
    await expect(caller.digest()).rejects.toThrow()
  })

  it('swallows per-account failures and continues with surviving accounts', async () => {
    ;(listAccounts as jest.Mock).mockResolvedValue([
      { id: 'a1', email: 'mary@tribe.ai' },
      { id: 'a2', email: 'broken@tribe.ai' },
    ])
    // a1 succeeds, a2 throws on refresh-token decrypt
    ;(getDecryptedRefreshToken as jest.Mock).mockImplementation(async (_uid: string, id: string) => {
      if (id === 'a2') throw new Error('token decrypt failed')
      return 'rt'
    })
    ;(fetchUnreadPrimary as jest.Mock).mockResolvedValue([baseRaw])

    const caller = inboxRouter.createCaller(mockCtx({ uid: 'mary-uid' }))
    const { emails } = await caller.digest()
    expect(emails).toHaveLength(1)
    expect(emails[0].accountId).toBe('a1')
    // LLM was still called — the one raw email from a1 went through
    expect(aiModule.generateObject).toHaveBeenCalledTimes(1)
  })
})
