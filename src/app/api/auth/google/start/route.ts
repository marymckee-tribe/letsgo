import { NextResponse } from 'next/server'
import { getUidFromRequest, HttpError } from '@/lib/server/session'
import { buildAuthUrl } from '@/lib/server/google-oauth'

export async function GET(req: Request) {
  try {
    const uid = await getUidFromRequest(req)
    const url = buildAuthUrl(uid)
    return NextResponse.json({ url })
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string }
    const status = e instanceof HttpError ? e.status : (err.status ?? 500)
    return NextResponse.json({ error: err.message ?? 'Unknown error' }, { status })
  }
}
