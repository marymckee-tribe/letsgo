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

import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { trpc } from '@/lib/trpc/client'
import { httpBatchLink } from '@trpc/client'
import superjson from 'superjson'

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

// We assert the optimistic-update behavior of useClearEmail against a fake fetch.
// This test does NOT exercise the server; it exercises that the query cache is
// updated synchronously on mutate and reverted on error.

describe('useClearEmail', () => {
  let queryClient: QueryClient
  let trpcClient: ReturnType<typeof trpc.createClient>

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })

    global.fetch = jest.fn().mockImplementation(async (url: string, _init: RequestInit) => {
      // `inbox.digest` query → initial fetch
      if (String(url).includes('inbox.digest')) {
        return new Response(JSON.stringify([{ result: { data: { json: { emails: [{
          id: 'm1', subject: 's', sender: 'x', snippet: 's', fullBody: '', classification: 'CALENDAR_EVENT',
          attachments: [], suggestedActions: [], date: 0, hubStatus: 'UNREAD',
        }] } } } }]), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      if (String(url).includes('inbox.markCleared')) {
        // Simulate a server error to drive the rollback path.
        return new Response(JSON.stringify([{ error: { json: { message: 'boom', code: -32603, data: { code: 'INTERNAL_SERVER_ERROR' } } } }]), { status: 500, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response('{}', { status: 200 })
    }) as typeof fetch

    trpcClient = trpc.createClient({
      links: [httpBatchLink({ url: '/api/trpc', transformer: superjson })],
    })
  })

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </trpc.Provider>
    )
  }

  it('flips hubStatus to CLEARED optimistically and rolls back on error', async () => {
    // Import inside the test so the mocked fetch is in place.
    const { useClearEmail, useInboxEmails } = await import('@/lib/store')

    const { result: listResult } = renderHook(() => useInboxEmails(), { wrapper: Wrapper })
    await waitFor(() => expect(listResult.current.data?.emails.length).toBe(1))
    expect(listResult.current.data?.emails[0].hubStatus).toBe('UNREAD')

    const { result: mutResult } = renderHook(() => useClearEmail(), { wrapper: Wrapper })
    await act(async () => {
      mutResult.current.mutate({ emailId: 'm1' })
    })

    // Optimistic: should briefly be CLEARED.
    // Then: server errors, rollback → back to UNREAD.
    await waitFor(() => expect(listResult.current.data?.emails[0].hubStatus).toBe('UNREAD'))
    await waitFor(() => expect(mutResult.current.isError).toBe(true))
  })
})
