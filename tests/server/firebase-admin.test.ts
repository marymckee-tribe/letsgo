// tests/server/firebase-admin.test.ts

// Mock firebase-admin/* before any imports that trigger module evaluation
jest.mock('firebase-admin/app', () => {
  const fakeApp = { name: '[DEFAULT]' }
  return {
    initializeApp: jest.fn(() => fakeApp),
    getApps: jest.fn(() => []),
    cert: jest.fn((creds) => creds),
  }
})

jest.mock('firebase-admin/auth', () => {
  const fakeAuth = { tenantManager: jest.fn() }
  return {
    getAuth: jest.fn(() => fakeAuth),
  }
})

jest.mock('firebase-admin/firestore', () => {
  const fakeDb = { collection: jest.fn() }
  return {
    getFirestore: jest.fn(() => fakeDb),
  }
})

import { getAdminAuth, getAdminDb } from '@/lib/server/firebase-admin'

describe('firebase-admin', () => {
  beforeAll(() => {
    process.env.FIREBASE_ADMIN_SA_JSON = JSON.stringify({
      type: 'service_account',
      project_id: 'the-hub-c0601',
      private_key: '-----BEGIN PRIVATE KEY-----\nMIIE...FAKE...==\n-----END PRIVATE KEY-----\n',
      client_email: 'test@the-hub-c0601.iam.gserviceaccount.com',
    })
  })

  it('exports singletons', () => {
    const auth1 = getAdminAuth()
    const auth2 = getAdminAuth()
    expect(auth1).toBe(auth2)
    const db1 = getAdminDb()
    const db2 = getAdminDb()
    expect(db1).toBe(db2)
  })

  it('throws when FIREBASE_ADMIN_SA_JSON is missing', async () => {
    const saved = process.env.FIREBASE_ADMIN_SA_JSON
    delete process.env.FIREBASE_ADMIN_SA_JSON
    // Force re-init by clearing module cache
    jest.resetModules()
    const fresh = await import('@/lib/server/firebase-admin')
    expect(() => fresh.getAdminAuth()).toThrow(/FIREBASE_ADMIN_SA_JSON/)
    process.env.FIREBASE_ADMIN_SA_JSON = saved
  })
})
