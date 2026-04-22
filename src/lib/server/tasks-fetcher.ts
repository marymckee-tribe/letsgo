// src/lib/server/tasks-fetcher.ts

export interface TaskRaw {
  id: string
  title: string | undefined
  due: string | undefined
  completed: boolean
  listId: string
}

interface TaskList { id: string }
interface GoogleTask { id: string; title?: string; due?: string; status?: string }

export async function fetchTasks(accessToken: string): Promise<TaskRaw[]> {
  const listsRes = await fetch('https://tasks.googleapis.com/tasks/v1/users/@me/lists', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const listsData = await listsRes.json()
  if (listsData.error) throw new Error(listsData.error.message || 'Tasks lists failed')
  if (!listsData.items?.length) return []

  const allTasks = await Promise.all(listsData.items.map(async (l: TaskList) => {
    const tr = await fetch(`https://tasks.googleapis.com/tasks/v1/lists/${l.id}/tasks`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const td = await tr.json()
    return (td.items || []).map((t: GoogleTask): TaskRaw => ({
      id: t.id,
      title: t.title,
      due: t.due,
      completed: t.status === 'completed',
      listId: l.id,
    }))
  }))
  return allTasks.flat()
}
