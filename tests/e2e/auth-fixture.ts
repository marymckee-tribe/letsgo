import { test as base } from '@playwright/test'
import admin from 'firebase-admin'

let adminApp: admin.app.App | undefined

function getAdminApp(): admin.app.App {
  if (adminApp) return adminApp
  const raw = process.env.FIREBASE_ADMIN_SA_JSON
  if (!raw) throw new Error('FIREBASE_ADMIN_SA_JSON not set — see tests/e2e/README.md')
  const sa = JSON.parse(raw)
  adminApp = admin.initializeApp({ credential: admin.credential.cert(sa), projectId: sa.project_id }, 'e2e-fixture')
  return adminApp
}

async function signIn(page: import('@playwright/test').Page, email: string) {
  const apiKey = process.env.FIREBASE_WEB_API_KEY
  if (!apiKey) throw new Error('FIREBASE_WEB_API_KEY not set — see tests/e2e/README.md')

  const app = getAdminApp()
  const user = await admin.auth(app).getUserByEmail(email)
  const customToken = await admin.auth(app).createCustomToken(user.uid)

  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    },
  )
  if (!res.ok) throw new Error(`Sign-in failed: ${res.status} ${await res.text()}`)
  const data = (await res.json()) as { idToken: string; refreshToken: string; localId: string }

  await page.addInitScript(([apiKey, idToken, refreshToken, uid, email]) => {
    // Firebase JS SDK v12 persists auth under `firebase:<userKey>:<apiKey>:<appName>` — see
    // `_persistenceKeyName` in node_modules/@firebase/auth. For the default app,
    // appName === '[DEFAULT]'. The stored value mirrors UserImpl.toJSON() shape.
    const now = Date.now()
    const stub = {
      uid,
      email,
      emailVerified: true,
      isAnonymous: false,
      providerData: [
        { providerId: 'password', uid: email, displayName: null, email, phoneNumber: null, photoURL: null },
      ],
      stsTokenManager: {
        refreshToken,
        accessToken: idToken,
        expirationTime: now + 3600_000,
      },
      createdAt: String(now),
      lastLoginAt: String(now),
      apiKey,
      appName: '[DEFAULT]',
    }
    window.localStorage.setItem(
      `firebase:authUser:${apiKey}:[DEFAULT]`,
      JSON.stringify(stub),
    )
  }, [apiKey, data.idToken, data.refreshToken, data.localId, email] as [string, string, string, string, string])
}

export const test = base.extend<{ signedInPage: import('@playwright/test').Page }>({
  signedInPage: async ({ page }, use) => {
    const email = process.env.E2E_USER_EMAIL
    if (!email) throw new Error('E2E_USER_EMAIL not set — see tests/e2e/README.md')
    await signIn(page, email)
    await page.goto('/')
    // eslint-disable-next-line react-hooks/rules-of-hooks -- `use` is Playwright's fixture callback, not a React Hook
    await use(page)
  },
})

export { expect } from '@playwright/test'
