// src/lib/server/gmail-fetcher.ts

interface GmailPayload {
  mimeType?: string
  filename?: string
  body?: { data?: string; attachmentId?: string; size?: number }
  parts?: GmailPayload[]
}

export interface GmailAttachment {
  id: string
  filename: string
  mimeType: string
  size: number
}

export interface GmailEmail {
  id: string
  subject: string
  sender: string
  snippet: string
  fullBody: string
  date: number
  attachments: GmailAttachment[]
}

function extractAttachments(payload: GmailPayload): GmailAttachment[] {
  if (!payload) return []
  const results: GmailAttachment[] = []
  if (payload.body?.attachmentId && payload.filename) {
    results.push({
      id: payload.body.attachmentId,
      filename: payload.filename,
      mimeType: payload.mimeType || 'application/octet-stream',
      size: payload.body.size ?? 0,
    })
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      results.push(...extractAttachments(part))
    }
  }
  return results
}

export async function fetchUnreadPrimary(accessToken: string): Promise<GmailEmail[]> {
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
      msgData.payload?.headers?.find((h: { name: string; value?: string }) => h.name.toLowerCase() === name.toLowerCase())?.value || ''
    const extractBody = (payload: GmailPayload): string => {
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
      attachments: extractAttachments(msgData.payload),
    }
  }))
}
