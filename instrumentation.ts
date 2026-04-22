// Next.js server/edge instrumentation hook — called once on server startup.
// See: docs/01-app/03-api-reference/03-file-conventions/instrumentation.md
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}
