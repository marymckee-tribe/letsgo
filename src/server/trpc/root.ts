import { router } from './index'
import { accountsRouter } from './routers/accounts'
import { authRouter } from './routers/auth'
import { calendarRouter } from './routers/calendar'

export const appRouter = router({
  accounts: accountsRouter,
  auth: authRouter,
  calendar: calendarRouter,
})

export type AppRouter = typeof appRouter
