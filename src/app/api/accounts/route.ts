import { NextResponse } from 'next/server'
import { getUidFromRequest, HttpError } from '@/lib/server/session'
import { listAccounts, deleteAccount } from '@/lib/server/accounts'

export async function GET(req: Request) {
  try {
    const uid = await getUidFromRequest(req)
    const accounts = await listAccounts(uid)
    const sanitized = accounts.map(({ refreshToken, ...rest }) => rest)
    return NextResponse.json({ accounts: sanitized })
  } catch (e: any) {
    const status = e instanceof HttpError ? e.status : (e.status ?? 500)
    return NextResponse.json({ error: e.message }, { status })
  }
}

export async function DELETE(req: Request) {
  try {
    const uid = await getUidFromRequest(req)
    const id = new URL(req.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    await deleteAccount(uid, id)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    const status = e instanceof HttpError ? e.status : (e.status ?? 500)
    return NextResponse.json({ error: e.message }, { status })
  }
}
