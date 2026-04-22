import { router } from './index'
import { accountsRouter } from './routers/accounts'
import { authRouter } from './routers/auth'
import { calendarRouter } from './routers/calendar'
import { calendarsRouter } from './routers/calendars'
import { gmailRouter } from './routers/gmail'
import { tasksRouter } from './routers/tasks'

export const appRouter = router({
  accounts: accountsRouter,
  auth: authRouter,
  calendar: calendarRouter,
  calendars: calendarsRouter,
  gmail: gmailRouter,
  tasks: tasksRouter,
})

export type AppRouter = typeof appRouter
