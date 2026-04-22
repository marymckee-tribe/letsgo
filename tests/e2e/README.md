# E2E Tests (Playwright)

Smoke tests for authenticated UI flows. Blocked on three human actions before they will run:

## 1. Create a Firebase E2E test user

Create a user via Firebase Admin SDK (no Email/Password provider required — the fixture uses custom tokens). Record:

- `E2E_USER_EMAIL` — any email you set
- `FIREBASE_WEB_API_KEY` — Firebase Console → Project Settings → General → Web API Key
- `FIREBASE_ADMIN_SA_JSON` — service-account JSON (already used by the app server)

## 2. Save those as secrets

**Local:** Add to `.env.local` (already git-ignored):
```
FIREBASE_WEB_API_KEY=...
E2E_USER_EMAIL=...
FIREBASE_ADMIN_SA_JSON='...'
```

**CI:** GitHub repo → Settings → Secrets and variables → Actions → New repository secret (repeat for each).

## 3. Firebase localStorage key (deterministic)

This project uses Firebase JS SDK v12. The SDK persists auth under a key built from the API key and app name:

```
firebase:authUser:<FIREBASE_WEB_API_KEY>:[DEFAULT]
```

The fixture constructs this key at runtime from `process.env.FIREBASE_WEB_API_KEY`, so no DevTools inspection is required. See `_persistenceKeyName` in `node_modules/@firebase/auth/dist/esm/index-*.js` if the SDK is ever upgraded and you need to confirm the format still holds.

## SECURITY: failure-artifact trace sensitivity

Playwright is configured with `trace: 'retain-on-failure'`. Traces capture
browser-side network traffic (CDP) and `page.request` / `APIRequestContext`
calls. The `signIn` helper in `auth-fixture.ts` uses the **Node.js global
`fetch()`**, which runs in the test-runner process, not inside the browser
context — so the Firebase sign-in request (including the plaintext password and
the returned `idToken`/`refreshToken`) is **not** recorded in Playwright traces
today.

**However:** any future change that routes the sign-in call through
`page.request`, `request.newContext()`, or `context.request` would bring it
back into trace scope and expose those credentials in CI failure artifacts
(retained for 7 days in GitHub Actions). If you ever refactor the fixture to use
a `page`-bound API, review this risk first and consider stubbing the Firebase
endpoint with `page.route()` or redacting the artifact before upload.

Do not share failure-run playwright-report artifacts outside the team — they
contain session tokens from the dedicated E2E test account.

## Running locally

```bash
npm run test:e2e
```

## CI

The `e2e` job in `.github/workflows/ci.yml` is gated on `secrets.E2E_USER_EMAIL`. It will not run until that secret is set. Once all three secrets are configured, it runs automatically on every PR and push to main.
