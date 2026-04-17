// src/app/api/tasks/list/route.ts
import { NextResponse } from 'next/server'
import { getUidFromRequest, HttpError } from '@/lib/server/session'
import { listAccounts, getDecryptedRefreshToken } from '@/lib/server/accounts'
import { refreshAccessToken } from '@/lib/server/google-oauth'
import { fetchTasks } from '@/lib/server/tasks-fetcher'

export async function POST(req: Request) {
  try {
    const uid = await getUidFromRequest(req)
    const accounts = await listAccounts(uid)
    const results = await Promise.all(accounts.map(async (acc) => {
      try {
        const rt = await getDecryptedRefreshToken(uid, acc.id)
        if (!rt) throw new Error('Refresh token missing')
        const { accessToken } = await refreshAccessToken(rt)
        const tasks = await fetchTasks(accessToken)
        return tasks.map(t => ({ ...t, accountId: acc.id }))
      } catch (err: unknown) {
        const e = err as { message?: string }
        return { _error: { accountId: acc.id, message: e.message ?? 'Unknown error' } }
      }
    }))
    const tasks = results.flatMap(r => (Array.isArray(r) ? r : []))
    const errors = results.flatMap(r => (!Array.isArray(r) && '_error' in r ? [r._error] : []))
    return NextResponse.json({ tasks, errors })
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string }
    const status = e instanceof HttpError ? e.status : (err.status ?? 500)
    return NextResponse.json({ error: err.message ?? 'Unknown error' }, { status })
  }
}
