const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://apis.google.com https://www.gstatic.com https://*.sentry.io",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https://*.googleusercontent.com https://*.gstatic.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://*.sentry.io",
  "frame-src 'self' https://accounts.google.com",
  "worker-src 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

export const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Content-Security-Policy', value: CSP },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
]
