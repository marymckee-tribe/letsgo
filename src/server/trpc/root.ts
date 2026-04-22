import { router } from './index'
import { accountsRouter } from './routers/accounts'
import { authRouter } from './routers/auth'
import { calendarRouter } from './routers/calendar'
import { calendarsRouter } from './routers/calendars'

export const appRouter = router({
  accounts: accountsRouter,
  auth: authRouter,
  calendar: calendarRouter,
  calendars: calendarsRouter,
})

export type AppRouter = typeof appRouter
