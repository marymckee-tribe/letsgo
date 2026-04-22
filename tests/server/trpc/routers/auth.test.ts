import { authRouter } from '@/server/trpc/routers/auth'

jest.mock('@/lib/server/google-oauth', () => ({
  buildAuthUrl: jest.fn().mockReturnValue('https://accounts.google.com/o/oauth2/v2/auth?client_id=...'),
}))

describe('auth router', () => {
  it('google.start returns the OAuth URL', async () => {
    const caller = authRouter.createCaller({ uid: 'mary-uid' })
    const result = await caller.google.start()
    expect(result.url).toMatch(/^https:\/\/accounts\.google\.com/)
  })

  it('google.start rejects unauthenticated callers', async () => {
    const caller = authRouter.createCaller({})
    await expect(caller.google.start()).rejects.toThrow()
  })
})
