export class GmailWriteError extends Error {
  readonly name = 'GmailWriteError'
  constructor(message: string, public readonly statusCode: number) {
    super(message)
  }
}

export async function markMessageRead(accessToken: string, messageId: string): Promise<void> {
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}/modify`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ removeLabelIds: ['UNREAD'] }),
    },
  )
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    const msg = data?.error?.message ?? `Gmail modify failed (${res.status})`
    throw new GmailWriteError(msg, res.status)
  }
}
