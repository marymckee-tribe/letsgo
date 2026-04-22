This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Linking Gmail accounts

The Hub supports linking multiple Gmail accounts so inbox, calendar, and tasks data merges across them.

1. Sign in with any Google account (Firebase sign-in establishes your user identity).
2. Go to `/settings` → **Linked Google Accounts**.
3. Click **Add another Gmail account**, grant the requested scopes in the Google consent screen.
4. On redirect, the account appears in the list with its linked date.
5. Inbox, calendar, and tasks hydrate from every linked account; each email row shows a small `via <account>` marker.
6. Remove an account from the same settings section; its data clears on next refresh.

Refresh tokens are stored encrypted (AES-256-GCM) server-side and are exchanged for short-lived access tokens on every API call — so the old "hourly 401 re-login" problem is gone.

See `.env.local.example` for the required env vars (Google OAuth client, Firebase Admin SA, token encryption key).

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Deploying

### Required environment variables

**Firebase (client-side — prefix `NEXT_PUBLIC_`)**

```
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID
```

**Google OAuth + Firebase Admin (server-side)**

```
GOOGLE_OAUTH_CLIENT_ID
GOOGLE_OAUTH_CLIENT_SECRET
GOOGLE_OAUTH_REDIRECT_URI
FIREBASE_ADMIN_SA_JSON       # full service-account JSON as a single-line string
TOKEN_ENCRYPTION_KEY         # 32 random bytes, base64 — see .env.local.example
```

**Sentry (error tracking — app runs without these but won't capture errors)**

```
NEXT_PUBLIC_SENTRY_DSN
SENTRY_DSN
SENTRY_AUTH_TOKEN            # for source-map upload at build time (CI only)
SENTRY_ORG
SENTRY_PROJECT
```

**E2E tests (CI only — see `tests/e2e/README.md`)**

```
E2E_USER_EMAIL
E2E_USER_PASSWORD
FIREBASE_WEB_API_KEY
```

### Setting env vars

- **Local dev**: copy `.env.local.example` to `.env.local` and fill in values. This file is gitignored.
- **Vercel / other platform**: add the same keys as platform secrets (Environment Variables UI or CLI).
- **GitHub Actions**: add as repository secrets; the CI workflow reads them automatically.

### Three manual actions still required

These cannot be automated and must be completed by the operator before production traffic:

1. **Sentry project** — create a project at [sentry.io](https://sentry.io), then copy the DSN and fill in `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT`.
2. **Firebase E2E test user** — create a dedicated test account in Firebase Auth, then set `E2E_USER_EMAIL`, `E2E_USER_PASSWORD`, and `FIREBASE_WEB_API_KEY` as GitHub secrets. Also inspect the Firebase SDK's localStorage key for your project and paste it into `tests/e2e/auth-fixture.ts`. See [`tests/e2e/README.md`](tests/e2e/README.md) for details.
3. **GitHub branch protection on `main`** — go to Settings → Branches → Add rule, require a PR, require the `verify` status check to pass, and require the branch to be up to date before merging.

Full production-readiness plan: [`docs/superpowers/plans/2026-04-21-production-readiness.md`](docs/superpowers/plans/2026-04-21-production-readiness.md)
