import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { appRouter } from '@/server/trpc/root'
import { createContext } from '@/server/trpc/context'

export const maxDuration = 60

const handler = async (req: Request) => {
  const reqId = req.headers.get('x-request-id') ?? crypto.randomUUID()

  const headers: Record<string, string> = {}
  req.headers.forEach((value, key) => {
    headers[key] = value
  })
  headers['x-request-id'] = reqId

  const cloned =
    req.method === 'GET' || !req.body
      ? new Request(req.url, { method: req.method, headers })
      : new Request(req.url, { method: req.method, headers, body: req.body, duplex: 'half' } as RequestInit)

  const res = await fetchRequestHandler({
    endpoint: '/api/trpc',
    req: cloned,
    router: appRouter,
    createContext: () => createContext({ req: cloned }),
  })

  res.headers.set('x-request-id', reqId)
  return res
}

export { handler as GET, handler as POST }
