import { router } from './index'
import { accountsRouter } from './routers/accounts'

export const appRouter = router({
  accounts: accountsRouter,
})

export type AppRouter = typeof appRouter
