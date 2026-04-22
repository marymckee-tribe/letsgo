import { profilesRouter } from '@/server/trpc/routers/profiles'
import {
  seedProfilesIfEmpty,
  upsertProfile,
  listProfiles,
  appendKnownDomain,
  listDismissedDomains,
  dismissDomain,
} from '@/lib/server/profiles'
import { TRPCError } from '@trpc/server'
import { mockCtx } from '../helpers'

jest.mock('@/lib/server/profiles')

describe('profiles router', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('list seeds + returns profiles for an authenticated caller', async () => {
    ;(seedProfilesIfEmpty as jest.Mock).mockResolvedValue([
      { id: 'mary', name: 'Mary', type: 'Adult', currentContext: '', preferences: [], routines: [], sizes: {}, medicalNotes: '' },
    ])
    const caller = profilesRouter.createCaller(mockCtx({ uid: 'mary-uid' }))
    const { profiles } = await caller.list()
    expect(profiles).toHaveLength(1)
    expect(profiles[0].name).toBe('Mary')
    expect(seedProfilesIfEmpty).toHaveBeenCalledWith('mary-uid')
  })

  it('list rejects unauthenticated callers', async () => {
    const caller = profilesRouter.createCaller(mockCtx())
    await expect(caller.list()).rejects.toBeInstanceOf(TRPCError)
  })

  it('upsert persists and returns the refreshed list', async () => {
    ;(upsertProfile as jest.Mock).mockResolvedValue(undefined)
    ;(listProfiles as jest.Mock).mockResolvedValue([
      { id: 'ellie', name: 'Ellie', type: 'Child', currentContext: 'Test', preferences: [], routines: [], sizes: {}, medicalNotes: '' },
    ])
    const caller = profilesRouter.createCaller(mockCtx({ uid: 'mary-uid' }))
    const result = await caller.upsert({
      id: 'ellie', name: 'Ellie', type: 'Child',
      currentContext: 'Test', preferences: [], routines: [], sizes: {}, medicalNotes: '',
    })
    expect(upsertProfile).toHaveBeenCalledWith('mary-uid', expect.objectContaining({ id: 'ellie' }))
    expect(result.profiles).toHaveLength(1)
  })

  it('upsert rejects payloads without a valid id', async () => {
    const caller = profilesRouter.createCaller(mockCtx({ uid: 'mary-uid' }))
    await expect(
      caller.upsert({
        id: '', name: 'bad', type: 'Child',
        currentContext: '', preferences: [], routines: [], sizes: {}, medicalNotes: '',
      })
    ).rejects.toBeInstanceOf(TRPCError)
  })

  it('learnDomain appends a new domain', async () => {
    ;(appendKnownDomain as jest.Mock).mockResolvedValue(undefined)
    const caller = profilesRouter.createCaller(mockCtx({ uid: 'mary-uid' }))
    const result = await caller.learnDomain({ profileId: 'annie', domain: 'art.audaucy.org' })
    expect(appendKnownDomain).toHaveBeenCalledWith('mary-uid', 'annie', 'art.audaucy.org')
    expect(result).toEqual({ ok: true })
  })

  it('learnDomain rejects a bare domain with protocol', async () => {
    const caller = profilesRouter.createCaller(mockCtx({ uid: 'mary-uid' }))
    await expect(
      caller.learnDomain({ profileId: 'annie', domain: 'https://audaucy.org' })
    ).rejects.toBeInstanceOf(TRPCError)
  })

  it('learnDomain rejects missing profileId', async () => {
    const caller = profilesRouter.createCaller(mockCtx({ uid: 'mary-uid' }))
    await expect(
      caller.learnDomain({ profileId: '', domain: 'audaucy.org' })
    ).rejects.toBeInstanceOf(TRPCError)
  })

  it('listDismissedDomains returns the persisted domains for the caller', async () => {
    ;(listDismissedDomains as jest.Mock).mockResolvedValue(['noise.example.com'])
    const caller = profilesRouter.createCaller(mockCtx({ uid: 'mary-uid' }))
    const result = await caller.listDismissedDomains()
    expect(listDismissedDomains).toHaveBeenCalledWith('mary-uid')
    expect(result).toEqual({ domains: ['noise.example.com'] })
  })

  it('listDismissedDomains rejects unauthenticated callers', async () => {
    const caller = profilesRouter.createCaller(mockCtx())
    await expect(caller.listDismissedDomains()).rejects.toBeInstanceOf(TRPCError)
  })

  it('dismissDomain persists a lowercased domain', async () => {
    ;(dismissDomain as jest.Mock).mockResolvedValue(undefined)
    const caller = profilesRouter.createCaller(mockCtx({ uid: 'mary-uid' }))
    const result = await caller.dismissDomain({ domain: 'Noise.Example.COM' })
    expect(dismissDomain).toHaveBeenCalledWith('mary-uid', 'noise.example.com')
    expect(result).toEqual({ ok: true })
  })

  it('dismissDomain rejects a domain with protocol', async () => {
    const caller = profilesRouter.createCaller(mockCtx({ uid: 'mary-uid' }))
    await expect(
      caller.dismissDomain({ domain: 'https://noise.example.com' })
    ).rejects.toBeInstanceOf(TRPCError)
  })

  it('dismissDomain rejects an empty domain', async () => {
    const caller = profilesRouter.createCaller(mockCtx({ uid: 'mary-uid' }))
    await expect(
      caller.dismissDomain({ domain: '' })
    ).rejects.toBeInstanceOf(TRPCError)
  })
})
