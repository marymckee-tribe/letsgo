// src/lib/server/firebase-admin.ts
import { initializeApp, getApps, cert, type App } from 'firebase-admin/app'
import { getAuth, type Auth } from 'firebase-admin/auth'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'

let app: App | null = null

function initApp(): App {
  if (app) return app
  const existing = getApps()[0]
  if (existing) {
    app = existing
    return app
  }
  const saJson = process.env.FIREBASE_ADMIN_SA_JSON
  if (!saJson) throw new Error('FIREBASE_ADMIN_SA_JSON not set')
  const credentials = JSON.parse(saJson)
  app = initializeApp({ credential: cert(credentials) })
  return app
}

export function getAdminAuth(): Auth {
  return getAuth(initApp())
}

export function getAdminDb(): Firestore {
  return getFirestore(initApp())
}
