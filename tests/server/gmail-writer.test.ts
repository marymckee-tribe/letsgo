import { markMessageRead, GmailWriteError } from '@/lib/server/gmail-writer'

describe('gmail-writer', () => {
  const originalFetch = global.fetch
  afterEach(() => { global.fetch = originalFetch })

  it('calls users.messages.modify with removeLabelIds: [UNREAD]', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'msg-1' }),
    })
    global.fetch = fetchMock as unknown as typeof fetch

    await markMessageRead('token', 'msg-1')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://gmail.googleapis.com/gmail/v1/users/me/messages/msg-1/modify')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ removeLabelIds: ['UNREAD'] })
  })

  it('throws GmailWriteError with statusCode on failure', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: { message: 'insufficient scope' } }),
    }) as unknown as typeof fetch
    await expect(markMessageRead('t', 'msg-1')).rejects.toMatchObject({
      name: 'GmailWriteError',
      statusCode: 403,
    })
  })
})
