import { TRPCError } from '@trpc/server'
import { t } from '@/server/trpc'

export interface BucketStore {
  get(key: string): { remaining: number; resetAt: number } | undefined
  set(key: string, value: { remaining: number; resetAt: number }): void
}

export function createBucketStore(): BucketStore {
  const map = new Map<string, { remaining: number; resetAt: number }>()
  return {
    get: (k) => map.get(k),
    set: (k, v) => { map.set(k, v) },
  }
}

interface Opts {
  max: number
  windowMs: number
  now?: () => number
}

export function tokenBucketAllow(store: BucketStore, key: string, opts: Opts): boolean {
  const now = (opts.now ?? Date.now)()
  const current = store.get(key)
  if (!current || now >= current.resetAt) {
    store.set(key, { remaining: opts.max - 1, resetAt: now + opts.windowMs })
    return true
  }
  if (current.remaining <= 0) return false
  store.set(key, { remaining: current.remaining - 1, resetAt: current.resetAt })
  return true
}

const sharedStore = createBucketStore()

export function rateLimit({ max, windowMs }: { max: number; windowMs: number }) {
  return t.middleware(({ ctx, next }) => {
    const key = `uid:${ctx.uid ?? 'anon'}`
    if (!tokenBucketAllow(sharedStore, key, { max, windowMs })) {
      throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Rate limit exceeded' })
    }
    return next()
  })
}
