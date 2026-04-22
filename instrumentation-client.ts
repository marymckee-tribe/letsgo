// Next.js 16 client-side instrumentation hook (introduced in v15.3).
// Runs before React hydration — ideal for error tracking init.
// See: docs/01-app/03-api-reference/03-file-conventions/instrumentation-client.md
import * as Sentry from '@sentry/nextjs'
import './sentry.client.config'

// Wires Sentry's router transition instrumentation so navigation events
// are captured as spans / breadcrumbs. Required by @sentry/nextjs.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
