import { google } from 'googleapis'

export const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/userinfo.email',
]

function getClient() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Google OAuth env vars missing')
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri)
}

export function buildAuthUrl(state: string): string {
  return getClient().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state,
    include_granted_scopes: true,
  })
}

export async function exchangeCode(code: string): Promise<{
  refreshToken: string
  accessToken: string
  expiresAt: number
  email: string
}> {
  const client = getClient()
  const { tokens } = await client.getToken(code)
  if (!tokens.refresh_token) throw new Error('No refresh token returned; ensure prompt=consent and offline access')
  client.setCredentials(tokens)
  const userinfo = await google.oauth2({ version: 'v2', auth: client }).userinfo.get()
  const email = userinfo.data.email
  if (!email) throw new Error('Userinfo did not return email')
  return {
    refreshToken: tokens.refresh_token,
    accessToken: tokens.access_token!,
    expiresAt: tokens.expiry_date ?? Date.now() + 3600_000,
    email,
  }
}

export async function refreshAccessToken(refreshToken: string): Promise<{
  accessToken: string
  expiresAt: number
}> {
  const client = getClient()
  client.setCredentials({ refresh_token: refreshToken })
  const res = await client.refreshAccessToken()
  return {
    accessToken: res.credentials.access_token!,
    expiresAt: res.credentials.expiry_date ?? Date.now() + 3600_000,
  }
}
