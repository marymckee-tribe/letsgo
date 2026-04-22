import { signState, verifyState } from '@/lib/server/google-oauth'

const ORIG_KEY = process.env.TOKEN_ENCRYPTION_KEY

describe('OAuth state signing', () => {
  beforeAll(() => { process.env.TOKEN_ENCRYPTION_KEY = 'test-secret-not-real' })
  afterAll(() => { process.env.TOKEN_ENCRYPTION_KEY = ORIG_KEY })

  it('roundtrips a uid', () => {
    const signed = signState('mary-uid')
    expect(verifyState(signed)).toEqual({ uid: 'mary-uid' })
  })

  it('rejects a tampered payload', () => {
    const signed = signState('mary-uid')
    const [payload, mac] = signed.split('.')
    // Flip one char of the payload's b64
    const tampered = payload.slice(0, -1) + (payload.slice(-1) === 'A' ? 'B' : 'A') + '.' + mac
    expect(verifyState(tampered)).toBeNull()
  })

  it('rejects an expired state', () => {
    const now = 1_000_000_000_000
    const signed = signState('mary-uid', now)
    const farFuture = now + 11 * 60 * 1000 // 11 minutes later, past 10-min TTL
    expect(verifyState(signed, farFuture)).toBeNull()
  })

  it('rejects wrong shape', () => {
    expect(verifyState('not-a-valid-token')).toBeNull()
    expect(verifyState('onlypart')).toBeNull()
    expect(verifyState('')).toBeNull()
  })

  it('rejects a state signed with a different secret', () => {
    process.env.TOKEN_ENCRYPTION_KEY = 'secret-a'
    const signed = signState('mary-uid')
    process.env.TOKEN_ENCRYPTION_KEY = 'secret-b'
    expect(verifyState(signed)).toBeNull()
    process.env.TOKEN_ENCRYPTION_KEY = 'test-secret-not-real'
  })
})
