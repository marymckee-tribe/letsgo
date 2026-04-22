import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import { securityHeaders } from './src/lib/server/security-headers';

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
    ]
  },
};

// withSentryConfig wraps the config to inject Sentry build-time behavior:
// source map upload (requires SENTRY_AUTH_TOKEN) and instrumentation wiring.
// No-ops gracefully when env vars are absent — safe to ship without a DSN.
// Turbopack is fully supported on Next.js 16.x (major > 15 passes Sentry's version check).
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // Suppress Sentry CLI output in dev; enable in CI for source map upload logs
  silent: !process.env.CI,
  // TODO: set SENTRY_AUTH_TOKEN in CI to enable source map upload at build time
});
