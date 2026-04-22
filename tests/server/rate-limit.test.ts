import { tokenBucketAllow, createBucketStore } from '@/lib/server/rate-limit'

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
})
