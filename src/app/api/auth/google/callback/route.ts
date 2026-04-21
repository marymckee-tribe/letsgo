import { NextResponse } from 'next/server'
import { exchangeCode, SCOPES } from '@/lib/server/google-oauth'
import { createAccount } from '@/lib/server/accounts'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')

  if (!code || !state) {
    return NextResponse.json({ error: 'Missing code or state' }, { status: 400 })
  }

  try {
    const { refreshToken, email } = await exchangeCode(code)
    await createAccount(state, {
      email,
      refreshToken,
      scopes: SCOPES,
    })
    const origin = url.origin
    return NextResponse.redirect(`${origin}/settings#accounts`, 307)
  } catch (e: unknown) {
    const err = e as { message?: string }
    const origin = url.origin
    return NextResponse.redirect(`${origin}/settings?error=${encodeURIComponent(err.message ?? 'Unknown error')}`, 307)
  }
}
