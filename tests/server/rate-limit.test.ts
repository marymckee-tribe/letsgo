import { TRPCError } from '@trpc/server'
import { t } from '@/server/trpc'
import { tokenBucketAllow, createBucketStore, rateLimit } from '@/lib/server/rate-limit'
import { mockCtx } from './trpc/helpers'

describe('tokenBucketAllow', () => {
  it('allows first N requests and rejects the N+1th within the window', () => {
    const store = createBucketStore()
    const key = 'uid:abc'
    let allowed = 0
    for (let i = 0; i < 6; i++) {
      if (tokenBucketAllow(store, key, { max: 5, windowMs: 60_000, now: () => 1000 })) allowed++
    }
    expect(allowed).toBe(5)
  })

  it('refills tokens after the window passes', () => {
    const store = createBucketStore()
    const key = 'uid:abc'
    let now = 1000
    for (let i = 0; i < 5; i++) tokenBucketAllow(store, key, { max: 5, windowMs: 60_000, now: () => now })
    expect(tokenBucketAllow(store, key, { max: 5, windowMs: 60_000, now: () => now })).toBe(false)
    now += 60_001
    expect(tokenBucketAllow(store, key, { max: 5, windowMs: 60_000, now: () => now })).toBe(true)
  })

  it('tracks separate keys independently', () => {
    const store = createBucketStore()
    for (let i = 0; i < 5; i++) tokenBucketAllow(store, 'uid:a', { max: 5, windowMs: 60_000, now: () => 1000 })
    expect(tokenBucketAllow(store, 'uid:a', { max: 5, windowMs: 60_000, now: () => 1000 })).toBe(false)
    expect(tokenBucketAllow(store, 'uid:b', { max: 5, windowMs: 60_000, now: () => 1000 })).toBe(true)
  })

  it('sweeps expired buckets after sweepInterval writes', () => {
    // sweepInterval: 6 — first 5 writes fill the counter to 5, the 6th (trigger) crosses the
    // threshold and fires the sweep. At that point all expired:* buckets have resetAt=1100
    // and now=1200, so they satisfy resetAt <= (v.resetAt - 1) where v is the trigger bucket.
    const store = createBucketStore({ sweepInterval: 6 })
    let now = 1000
    for (let i = 0; i < 5; i++) {
      tokenBucketAllow(store, `expired:${i}`, { max: 1, windowMs: 100, now: () => now })
    }
    now += 200
    // 6th write crosses sweepInterval and triggers sweep
    tokenBucketAllow(store, 'trigger', { max: 1, windowMs: 60_000, now: () => now })
    // The 5 expired keys should be gone
    for (let i = 0; i < 5; i++) {
      expect(store.get(`expired:${i}`)).toBeUndefined()
    }
    expect(store.get('trigger')).toBeDefined()
  })

  it('enforces maxBuckets by evicting oldest insertions', () => {
    const store = createBucketStore({ maxBuckets: 3, sweepInterval: 1000 })
    const now = 1000
    tokenBucketAllow(store, 'a', { max: 1, windowMs: 60_000, now: () => now })
    tokenBucketAllow(store, 'b', { max: 1, windowMs: 60_000, now: () => now })
    tokenBucketAllow(store, 'c', { max: 1, windowMs: 60_000, now: () => now })
    expect(store.get('a')).toBeDefined()
    tokenBucketAllow(store, 'd', { max: 1, windowMs: 60_000, now: () => now })
    // 'a' (oldest) was evicted when 'd' pushed size past maxBuckets
    expect(store.get('a')).toBeUndefined()
    expect(store.get('b')).toBeDefined()
    expect(store.get('c')).toBeDefined()
    expect(store.get('d')).toBeDefined()
  })
})

describe('rateLimit middleware', () => {
  it('throws if ctx.uid is missing (misuse on publicProcedure)', async () => {
    const testRouter = t.router({
      gated: t.procedure.use(rateLimit({ max: 10, windowMs: 60_000 })).query(() => 'ok'),
    })
    const caller = testRouter.createCaller(mockCtx({})) // no uid
    await expect(caller.gated()).rejects.toBeInstanceOf(TRPCError)
    await expect(caller.gated()).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' })
  })
})
