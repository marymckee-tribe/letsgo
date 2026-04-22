# E2E Tests (Playwright)

Smoke tests for authenticated UI flows. Blocked on three human actions before they will run:

## 1. Create a Firebase E2E test user

Firebase console → Authentication → Users → Add user. Use a strong random password. Record:

- `E2E_USER_EMAIL` — the email address you set
- `E2E_USER_PASSWORD` — the password you set
- `FIREBASE_WEB_API_KEY` — Firebase Console → Project Settings → General → Web API Key

## 2. Save those three as secrets

**Local:** Add to `.env.local` (already git-ignored):
```
FIREBASE_WEB_API_KEY=...
E2E_USER_EMAIL=...
E2E_USER_PASSWORD=...
```

**CI:** GitHub repo → Settings → Secrets and variables → Actions → New repository secret (repeat for each).

## 3. Inspect the Firebase localStorage key

This project uses Firebase JS SDK v12. The SDK stores the auth session in localStorage under a key like:

```
firebase:authUser:<WEB_API_KEY>:[DEFAULT]
```

The exact key depends on your Web API Key value. To find it:

1. `npm run dev`
2. Sign in to the app as any real user
3. DevTools → Application → Storage → Local Storage → `http://localhost:3000`
4. Copy the full key that starts with `firebase:authUser:`
5. Open `tests/e2e/auth-fixture.ts`
6. Replace `PASTE_EXACT_KEY_HERE` with that string
7. Un-comment the two lines marked `UNCOMMENT` and remove the `throw` above them

The fixture throws intentionally until this step is done — better than a silently unauthenticated test run.

## Running locally

```bash
npm run test:e2e
```

## CI

The `e2e` job in `.github/workflows/ci.yml` is gated on `secrets.E2E_USER_EMAIL`. It will not run until that secret is set. Once all three secrets are configured, it runs automatically on every PR and push to main.
