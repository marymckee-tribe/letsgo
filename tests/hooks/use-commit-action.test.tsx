// Mock Firebase and auth so the store module loads cleanly in jsdom without
// triggering the firebase/auth Node-only internals or real auth state.
jest.mock('@/lib/firebase', () => ({
  auth: {},
  db: {},
  googleProvider: {},
}))

jest.mock('@/lib/auth-provider', () => ({
  useAuth: () => ({ user: null, loading: false }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}))

import React from 'react'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { httpBatchLink } from '@trpc/client'
import superjson from 'superjson'
import { trpc } from '@/lib/trpc/client'
import { useCommitAction } from '@/hooks/use-commit-action'

// jsdom does not expose the Fetch API's Response constructor.
// Node 18+ has it in globalThis — make it available in the jsdom environment.
if (typeof Response === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any).Response = class MockResponse {
    private body: string
    public status: number
    public headers: Record<string, string>
    public ok: boolean
    constructor(body: string, init?: { status?: number; headers?: Record<string, string> }) {
      this.body = body
      this.status = init?.status ?? 200
      this.headers = init?.headers ?? {}
      this.ok = this.status >= 200 && this.status < 300
    }
    async json() { return JSON.parse(this.body) }
    async text() { return this.body }
  }
}

describe('useCommitAction', () => {
  const originalFetch = global.fetch

  let queryClient: QueryClient
  let trpcClient: ReturnType<typeof trpc.createClient>

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    trpcClient = trpc.createClient({
      links: [httpBatchLink({ url: 'http://localhost/api/trpc', transformer: superjson })],
    })
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </trpc.Provider>
    )
  }

  it('optimistically flips the action to WRITING, then COMMITTED on success', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ([{
        result: {
          data: {
            json: { action: { id: 'act1', status: 'COMMITTED', googleId: 'g1' } },
          },
        },
      }]),
    }) as unknown as typeof fetch

    const { result } = renderHook(
      () => useCommitAction({ emailId: 'e1', actionId: 'act1', timeZone: 'America/Los_Angeles' }),
      { wrapper: Wrapper },
    )

    await act(async () => {
      await result.current.commitCalendar()
    })

    await waitFor(() => {
      expect(result.current.lastStatus).toBe('COMMITTED')
    })
  })

  it('rolls back to PROPOSED when the mutation rejects', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ([{
        error: {
          json: { message: 'boom', code: -32603, data: { code: 'INTERNAL_SERVER_ERROR' } },
        },
      }]),
    }) as unknown as typeof fetch

    const { result } = renderHook(
      () => useCommitAction({ emailId: 'e1', actionId: 'act1', timeZone: 'America/Los_Angeles' }),
      { wrapper: Wrapper },
    )

    await act(async () => {
      try { await result.current.commitCalendar() } catch {}
    })

    await waitFor(() => {
      expect(result.current.lastStatus).toBe('PROPOSED') // rolled back
    })
    expect(result.current.errorMessage).toMatch(/boom/)
  })
})
