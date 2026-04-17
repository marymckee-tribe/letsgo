// src/lib/server/gmail-fetcher.ts
export async function fetchUnreadPrimary(accessToken: string): Promise<any[]> {
  const query = encodeURIComponent('in:inbox category:primary is:unread newer_than:7d')
  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${query}&maxResults=10`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  const listData = await listRes.json()
  if (listData.error) throw new Error(listData.error.message || 'Gmail list failed')
  if (!listData.messages) return []

  return Promise.all(listData.messages.map(async (m: { id: string }) => {
    const msgRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=full`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    const msgData = await msgRes.json()
    const getHeader = (name: string) =>
      msgData.payload?.headers?.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || ''
    const extractBody = (payload: any): string => {
      if (!payload) return ''
      if (payload.mimeType === 'text/plain' && payload.body?.data) {
        return Buffer.from(payload.body.data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
      }
      if (payload.parts) return payload.parts.map(extractBody).join('')
      return ''
    }
    return {
      id: msgData.id,
      subject: getHeader('subject'),
      sender: getHeader('from'),
      snippet: msgData.snippet,
      fullBody: (extractBody(msgData.payload) || msgData.snippet || '').slice(0, 4000),
      date: parseInt(msgData.internalDate || String(Date.now()), 10),
    }
  }))
}
