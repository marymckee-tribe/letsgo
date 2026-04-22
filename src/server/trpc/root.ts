import { router } from './index'
import { accountsRouter } from './routers/accounts'
import { authRouter } from './routers/auth'

export const appRouter = router({
  accounts: accountsRouter,
  auth: authRouter,
})

export type AppRouter = typeof appRouter
