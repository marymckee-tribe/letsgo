import { createTask, TasksWriteError, getDefaultTaskListId } from '@/lib/server/tasks-writer'

describe('tasks-writer', () => {
  const originalFetch = global.fetch
  afterEach(() => { global.fetch = originalFetch })

  it('getDefaultTaskListId returns the first list id', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [{ id: 'list-a' }, { id: 'list-b' }] }),
    }) as unknown as typeof fetch
    expect(await getDefaultTaskListId('token')).toBe('list-a')
  })

  it('getDefaultTaskListId throws TasksWriteError when no lists exist', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [] }),
    }) as unknown as typeof fetch
    await expect(getDefaultTaskListId('token')).rejects.toBeInstanceOf(TasksWriteError)
  })

  it('createTask POSTs to /lists/{listId}/tasks and returns the id', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'task-abc' }),
    })
    global.fetch = fetchMock as unknown as typeof fetch

    const result = await createTask('token', 'list-a', {
      title: 'Sign permission slip',
      notes: 'From Audaucy',
      due: '2026-05-20T00:00:00.000Z',
    })
    expect(result).toEqual({ id: 'task-abc' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://tasks.googleapis.com/tasks/v1/lists/list-a/tasks')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body).title).toBe('Sign permission slip')
  })

  it('createTask throws TasksWriteError with statusCode on failure', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'bad request' } }),
    }) as unknown as typeof fetch
    await expect(createTask('t', 'list-a', { title: 'x' })).rejects.toMatchObject({
      name: 'TasksWriteError',
      statusCode: 400,
    })
  })
})
