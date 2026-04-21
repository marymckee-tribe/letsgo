import { buildAuthUrl, SCOPES } from '@/lib/server/google-oauth'

describe('google-oauth', () => {
  beforeAll(() => {
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'cid.apps.googleusercontent.com'
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'secret'
    process.env.GOOGLE_OAUTH_REDIRECT_URI = 'http://localhost:3000/api/auth/google/callback'
  })

  it('builds an auth URL with all required scopes and offline access', () => {
    const url = buildAuthUrl('state-123')
    const u = new URL(url)
    expect(u.origin + u.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(u.searchParams.get('access_type')).toBe('offline')
    expect(u.searchParams.get('prompt')).toBe('consent')
    expect(u.searchParams.get('state')).toBe('state-123')
    expect(u.searchParams.get('scope')).toContain('gmail.readonly')
    expect(u.searchParams.get('scope')).toContain('gmail.modify')
    expect(u.searchParams.get('scope')).toContain('gmail.send')
    expect(u.searchParams.get('scope')).toContain('calendar.events')
    expect(u.searchParams.get('scope')).toContain('tasks')
  })

  it('includes exactly these scopes', () => {
    expect(SCOPES).toEqual(expect.arrayContaining([
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/tasks',
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/userinfo.email',
    ]))
  })
})
