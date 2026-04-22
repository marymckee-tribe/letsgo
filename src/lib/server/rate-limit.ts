import { TRPCError } from '@trpc/server'
import { t } from '@/server/trpc'

export interface BucketStore {
  get(key: string): { remaining: number; resetAt: number } | undefined
  set(key: string, value: { remaining: number; resetAt: number }): void
}

const SWEEP_INTERVAL_WRITES = 100
const MAX_BUCKETS = 10_000

interface StoreOpts {
  maxBuckets?: number
  sweepInterval?: number
}

interface MapWithCounter {
  map: Map<string, { remaining: number; resetAt: number }>
  writesSinceSweep: number
}

export function createBucketStore(opts: StoreOpts = {}): BucketStore {
  const maxBuckets = opts.maxBuckets ?? MAX_BUCKETS
  const sweepInterval = opts.sweepInterval ?? SWEEP_INTERVAL_WRITES
  const state: MapWithCounter = { map: new Map(), writesSinceSweep: 0 }

  const sweepExpired = (now: number) => {
    for (const [k, v] of state.map) {
      if (v.resetAt <= now) state.map.delete(k)
    }
    state.writesSinceSweep = 0
  }

  const enforceCap = () => {
    if (state.map.size <= maxBuckets) return
    // Evict oldest-inserted (Map preserves insertion order)
    const overflow = state.map.size - maxBuckets
    let i = 0
    for (const k of state.map.keys()) {
      if (i++ >= overflow) break
      state.map.delete(k)
    }
  }

  return {
    get: (k) => state.map.get(k),
    set: (k, v) => {
      state.map.set(k, v)
      state.writesSinceSweep++
      if (state.writesSinceSweep >= sweepInterval) sweepExpired(v.resetAt - 1)
      enforceCap()
    },
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
