import { router } from './index'
import { accountsRouter } from './routers/accounts'
import { actionsRouter } from './routers/actions'
import { authRouter } from './routers/auth'
import { calendarRouter } from './routers/calendar'
import { calendarsRouter } from './routers/calendars'
import { gmailRouter } from './routers/gmail'
import { inboxRouter } from './routers/inbox'
import { profilesRouter } from './routers/profiles'
import { tasksRouter } from './routers/tasks'

export const appRouter = router({
  accounts: accountsRouter,
  actions: actionsRouter,
  auth: authRouter,
  calendar: calendarRouter,
  calendars: calendarsRouter,
  gmail: gmailRouter,
  inbox: inboxRouter,
  profiles: profilesRouter,
  tasks: tasksRouter,
})

export type AppRouter = typeof appRouter
