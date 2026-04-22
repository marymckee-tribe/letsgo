import { test as base } from '@playwright/test'

interface Creds { email: string; password: string }

async function signIn(page: import('@playwright/test').Page, creds: Creds) {
  const apiKey = process.env.FIREBASE_WEB_API_KEY
  if (!apiKey) throw new Error('FIREBASE_WEB_API_KEY not set — see tests/e2e/README.md')
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: creds.email, password: creds.password, returnSecureToken: true }),
    },
  )
  if (!res.ok) throw new Error(`Sign-in failed: ${res.status}`)
  const data = await res.json()
  await page.addInitScript(([idToken, refreshToken, uid, email]) => {
    // FIREBASE localStorage KEY INSPECTION NEEDED — DO THIS BEFORE FIRST REAL RUN:
    //
    // This project uses Firebase JS SDK v12 (modular). The SDK persists the auth
    // session in localStorage under a key like:
    //
    //   firebase:authUser:<WEB_API_KEY>:[DEFAULT]
    //
    // The exact key depends on the actual Web API Key value. To find it:
    //   1. Start the dev server: npm run dev
    //   2. Sign in to the app as a real user
    //   3. Open DevTools → Application → Storage → Local Storage → http://localhost:3000
    //   4. Find the key that starts with "firebase:authUser:"
    //   5. Copy the full key string
    //   6. Replace the placeholder below (PASTE_EXACT_KEY_HERE) with that string
    //   7. Un-comment the two lines marked "UNCOMMENT" and remove this throw
    //
    // The throw below is intentional — it forces this inspection step rather than
    // silently producing a test that appears to work but is actually unauthenticated.
    throw new Error(
      'tests/e2e/auth-fixture.ts: Firebase localStorage key is unset. ' +
      'See the FIREBASE localStorage KEY INSPECTION NEEDED comment above — ' +
      'inspect DevTools on first real login and paste the exact key.',
    )
    // UNCOMMENT after completing the key inspection step above:
    // const stub = { uid, email, stsTokenManager: { accessToken: idToken, refreshToken, expirationTime: Date.now() + 3600_000 } }
    // window.localStorage.setItem('firebase:authUser:PASTE_EXACT_KEY_HERE', JSON.stringify(stub))
  }, [data.idToken, data.refreshToken, data.localId, data.email] as [string, string, string, string])
}

export const test = base.extend<{ signedInPage: import('@playwright/test').Page }>({
  signedInPage: async ({ page }, use) => {
    const email = process.env.E2E_USER_EMAIL
    const password = process.env.E2E_USER_PASSWORD
    if (!email || !password) throw new Error('E2E_USER_EMAIL / E2E_USER_PASSWORD not set — see tests/e2e/README.md')
    await signIn(page, { email, password })
    await page.goto('/')
    await use(page)
  },
})

export { expect } from '@playwright/test'
