import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  // Replays off by default — privacy-sensitive
  replaysSessionSampleRate: 0.0,
  replaysOnErrorSampleRate: 0.0,
  environment: process.env.NODE_ENV,
  // Disable in test env: no DSN means captureException is noisy; enabled: false makes it fully inert
  enabled: process.env.NODE_ENV !== 'test',
})
