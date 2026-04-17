import { encrypt, decrypt } from '@/lib/server/crypto'

describe('crypto', () => {
  beforeAll(() => {
    process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64')
  })

  it('round-trips plaintext', () => {
    const plaintext = 'ya29.a0ARW5m7example-refresh-token'
    const ciphertext = encrypt(plaintext)
    expect(ciphertext).not.toBe(plaintext)
    expect(decrypt(ciphertext)).toBe(plaintext)
  })

  it('produces different ciphertext on each call (fresh IV)', () => {
    const a = encrypt('same-token')
    const b = encrypt('same-token')
    expect(a).not.toBe(b)
  })

  it('throws on tampered ciphertext', () => {
    const ct = encrypt('secret')
    const tampered = ct.slice(0, -4) + 'AAAA'
    expect(() => decrypt(tampered)).toThrow()
  })

  it('throws when TOKEN_ENCRYPTION_KEY is missing', () => {
    const saved = process.env.TOKEN_ENCRYPTION_KEY
    delete process.env.TOKEN_ENCRYPTION_KEY
    expect(() => encrypt('x')).toThrow(/TOKEN_ENCRYPTION_KEY/)
    process.env.TOKEN_ENCRYPTION_KEY = saved
  })
})
