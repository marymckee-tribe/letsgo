import * as addrs from 'email-addresses'
import type { EntityProfile, SenderIdentity } from '@/lib/store'

export interface ParsedFrom {
  name: string
  email: string
}

export function parseFrom(raw: string): ParsedFrom {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return { name: '', email: '' }
  const parsed = addrs.parseOneAddress(trimmed)
  if (!parsed || parsed.type !== 'mailbox') return { name: '', email: '' }
  return {
    name: (parsed.name ?? '').trim(),
    email: (parsed.address ?? '').trim(),
  }
}

function normalizeSenderString(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim()
}

function domainOf(email: string): string {
  const at = email.lastIndexOf('@')
  return at === -1 ? '' : email.slice(at + 1).toLowerCase()
}

function domainMatches(senderDomain: string, known: string): boolean {
  const k = known.toLowerCase()
  return senderDomain === k || senderDomain.endsWith(`.${k}`)
}

export function resolveDirectSenderIdentity(
  rawFrom: string,
  profiles: EntityProfile[]
): SenderIdentity | null {
  const { email } = parseFrom(rawFrom)
  if (!email) return null
  const senderDomain = domainOf(email)
  const senderNormal = normalizeSenderString(rawFrom)

  for (const p of profiles) {
    for (const known of p.knownSenders ?? []) {
      if (normalizeSenderString(known) === senderNormal) {
        return { personId: p.id, confidence: 'high' }
      }
    }
  }

  for (const p of profiles) {
    for (const known of p.knownDomains ?? []) {
      if (domainMatches(senderDomain, known)) {
        return { personId: p.id, confidence: 'medium' }
      }
    }
  }

  return null
}
