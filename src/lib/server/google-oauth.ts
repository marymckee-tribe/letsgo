import { createHmac, timingSafeEqual } from 'crypto'
import { google } from 'googleapis'

export const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/userinfo.email',
]

const STATE_TTL_MS = 10 * 60 * 1000 // 10 minutes

function getStateSecret(): Buffer {
  const key = process.env.TOKEN_ENCRYPTION_KEY
  if (!key) throw new Error('TOKEN_ENCRYPTION_KEY missing — required for OAuth state signing')
  return Buffer.from(key, 'utf8')
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlDecode(s: string): Buffer {
  const pad = '='.repeat((4 - (s.length % 4)) % 4)
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64')
}

export function signState(uid: string, now: number = Date.now()): string {
  const payload = JSON.stringify({ uid, expiresAt: now + STATE_TTL_MS })
  const payloadB64 = b64url(Buffer.from(payload, 'utf8'))
  const mac = createHmac('sha256', getStateSecret()).update(payloadB64).digest()
  return `${payloadB64}.${b64url(mac)}`
}

export function verifyState(signed: string, now: number = Date.now()): { uid: string } | null {
  const parts = signed.split('.')
  if (parts.length !== 2) return null
  const [payloadB64, macB64] = parts
  const expectedMac = createHmac('sha256', getStateSecret()).update(payloadB64).digest()
  const gotMac = b64urlDecode(macB64)
  if (gotMac.length !== expectedMac.length) return null
  if (!timingSafeEqual(gotMac, expectedMac)) return null
  try {
    const payload = JSON.parse(b64urlDecode(payloadB64).toString('utf8')) as { uid?: unknown; expiresAt?: unknown }
    if (typeof payload.uid !== 'string' || typeof payload.expiresAt !== 'number') return null
    if (now >= payload.expiresAt) return null
    return { uid: payload.uid }
  } catch {
    return null
  }
}

function getClient() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Google OAuth env vars missing')
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri)
}

export function buildAuthUrl(uid: string): string {
  return getClient().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state: signState(uid),
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
