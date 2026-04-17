import { NextResponse } from 'next/server'
import { getUidFromRequest, HttpError } from '@/lib/server/session'
import { buildAuthUrl } from '@/lib/server/google-oauth'

export async function GET(req: Request) {
  try {
    const uid = await getUidFromRequest(req)
    const url = buildAuthUrl(uid)
    return NextResponse.json({ url })
  } catch (e: any) {
    const status = e instanceof HttpError ? e.status : (e.status ?? 500)
    return NextResponse.json({ error: e.message }, { status })
  }
}
