import { GET } from '@/app/api/auth/google/start/route'
import { getUidFromRequest } from '@/lib/server/session'
import { buildAuthUrl } from '@/lib/server/google-oauth'

jest.mock('@/lib/server/session')
jest.mock('@/lib/server/google-oauth')

describe('GET /api/auth/google/start', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(getUidFromRequest as jest.Mock).mockResolvedValue('mary-uid')
    ;(buildAuthUrl as jest.Mock).mockReturnValue('https://accounts.google.com/o/oauth2/v2/auth?state=x')
  })

  it('returns an auth URL with state = uid', async () => {
    const req = new Request('http://x/api/auth/google/start', {
      headers: { Authorization: 'Bearer valid' },
    })
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.url).toContain('accounts.google.com')
    expect(buildAuthUrl).toHaveBeenCalledWith('mary-uid')
  })

  it('returns 401 when no auth', async () => {
    ;(getUidFromRequest as jest.Mock).mockRejectedValue(Object.assign(new Error('nope'), { status: 401 }))
    const req = new Request('http://x')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })
})
