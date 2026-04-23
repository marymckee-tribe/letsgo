export interface TaskInput {
  title: string
  notes?: string
  due?: string // RFC3339; Google Tasks uses date-only precision but accepts full datetime
}

export interface TaskResult {
  id: string
}

export class TasksWriteError extends Error {
  readonly name = 'TasksWriteError'
  constructor(message: string, public readonly statusCode: number) {
    super(message)
  }
}

export async function getDefaultTaskListId(accessToken: string): Promise<string> {
  const res = await fetch('https://tasks.googleapis.com/tasks/v1/users/@me/lists', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    throw new TasksWriteError(`Tasks list fetch failed (${res.status})`, res.status)
  }
  const data = (await res.json()) as { items?: Array<{ id: string }> }
  const first = data.items?.[0]
  if (!first) {
    throw new TasksWriteError('No task lists available', 404)
  }
  return first.id
}

export async function createTask(
  accessToken: string,
  listId: string,
  input: TaskInput,
): Promise<TaskResult> {
  const res = await fetch(
    `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(listId)}/tasks`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    },
  )
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    const msg = data?.error?.message ?? `Tasks write failed (${res.status})`
    throw new TasksWriteError(msg, res.status)
  }
  const data = (await res.json()) as { id: string }
  return { id: data.id }
}
