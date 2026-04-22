import { fetchUnreadPrimary } from '@/lib/server/gmail-fetcher'

describe('fetchUnreadPrimary', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('surfaces attachment metadata and fullBody from a message with a pdf attachment', async () => {
    const listResponse = { messages: [{ id: 'm1' }] }

    const messageResponse = {
      id: 'm1',
      snippet: 'Please sign the document',
      internalDate: '1700000000000',
      payload: {
        mimeType: 'multipart/mixed',
        headers: [
          { name: 'Subject', value: 'Signature Required' },
          { name: 'From', value: 'sender@example.com' },
        ],
        parts: [
          {
            mimeType: 'text/plain',
            body: {
              // base64url of "Please sign this document"
              data: Buffer.from('Please sign this document').toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
            },
          },
          {
            mimeType: 'application/pdf',
            filename: 'permission.pdf',
            body: {
              attachmentId: 'at1',
              size: 1234,
            },
          },
        ],
      },
    }

    const mockFetch = jest
      .fn()
      .mockResolvedValueOnce({ json: async () => listResponse } as Response)
      .mockResolvedValueOnce({ json: async () => messageResponse } as Response)

    global.fetch = mockFetch

    const out = await fetchUnreadPrimary('fake-token')

    expect(out).toHaveLength(1)
    expect(out[0].attachments).toEqual([
      { id: 'at1', filename: 'permission.pdf', mimeType: 'application/pdf', size: 1234 },
    ])
    expect(out[0].fullBody).toContain('Please sign')
  })

  it('returns an empty attachments array when the message has no attachments', async () => {
    const listResponse = { messages: [{ id: 'm2' }] }

    const messageResponse = {
      id: 'm2',
      snippet: 'Hello there',
      internalDate: '1700000001000',
      payload: {
        mimeType: 'text/plain',
        headers: [
          { name: 'Subject', value: 'Greeting' },
          { name: 'From', value: 'hello@example.com' },
        ],
        body: {
          data: Buffer.from('Hello there').toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
        },
      },
    }

    const mockFetch = jest
      .fn()
      .mockResolvedValueOnce({ json: async () => listResponse } as Response)
      .mockResolvedValueOnce({ json: async () => messageResponse } as Response)

    global.fetch = mockFetch

    const out = await fetchUnreadPrimary('fake-token')

    expect(out).toHaveLength(1)
    expect(out[0].attachments).toEqual([])
  })

  it('returns empty array when there are no messages', async () => {
    const listResponse = {}

    const mockFetch = jest
      .fn()
      .mockResolvedValueOnce({ json: async () => listResponse } as Response)

    global.fetch = mockFetch

    const out = await fetchUnreadPrimary('fake-token')
    expect(out).toEqual([])
  })
})
