import { buildDigestPrompt } from '@/lib/server/digest-prompt'
import type { EntityProfile } from '@/lib/store'

describe('buildDigestPrompt', () => {
  const profiles: EntityProfile[] = [
    {
      id: 'ellie', name: 'Ellie', type: 'Child',
      currentContext: 'Gymnastics Tues/Thurs',
      preferences: [], routines: [], sizes: {},
      medicalNotes: 'Peanut allergy',
      knownDomains: ['blessedsacrament.org'],
    },
  ]

  const rawEmails = [
    {
      id: 'm1',
      subject: 'Zoo trip',
      sender: 'Ms. Redd <office@blessedsacrament.org>',
      snippet: 'Zoo Thu 8am',
      fullBody: 'Zoo trip Thursday 8am. Peanut-free lunches please.',
      date: 1_745_000_000_000,
      accountId: 'a1',
    },
  ]

  const preResolved: Record<string, { personId?: string; orgName?: string; confidence: string } | null> = {
    m1: { personId: 'ellie', confidence: 'medium' },
  }

  const now = new Date('2026-04-21T09:00:00-04:00')

  it('includes all six classification names verbatim', () => {
    const prompt = buildDigestPrompt({ rawEmails, profiles, preResolved, now, timeZone: 'America/New_York' })
    for (const c of ['CALENDAR_EVENT', 'TODO', 'NEEDS_REPLY', 'WAITING_ON', 'FYI', 'NEWSLETTER']) {
      expect(prompt).toContain(c)
    }
  })

  it('includes the three action type names verbatim', () => {
    const prompt = buildDigestPrompt({ rawEmails, profiles, preResolved, now, timeZone: 'America/New_York' })
    expect(prompt).toMatch(/action types.*CALENDAR_EVENT.*TODO.*NEEDS_REPLY/s)
  })

  it('embeds each Life Graph profile with knownDomains', () => {
    const prompt = buildDigestPrompt({ rawEmails, profiles, preResolved, now, timeZone: 'America/New_York' })
    expect(prompt).toContain('Ellie')
    expect(prompt).toContain('Peanut allergy')
    expect(prompt).toContain('blessedsacrament.org')
  })

  it('injects pre-resolved sender identity hints keyed by email id', () => {
    const prompt = buildDigestPrompt({ rawEmails, profiles, preResolved, now, timeZone: 'America/New_York' })
    expect(prompt).toMatch(/m1.*personId.*ellie/s)
  })

  it('contains the sourceQuote and no-invented-dates instructions', () => {
    const prompt = buildDigestPrompt({ rawEmails, profiles, preResolved, now, timeZone: 'America/New_York' })
    expect(prompt.toLowerCase()).toContain('sourcequote')
    expect(prompt.toLowerCase()).toContain('never invent')
  })

  it('renders email date as ISO-local string, not raw epoch ms', () => {
    const prompt = buildDigestPrompt({ rawEmails, profiles, preResolved, now, timeZone: 'America/New_York' })
    // 1_745_000_000_000 in America/New_York → verified via date-fns-tz at runtime
    expect(prompt).toContain('2025-04-18T14:13:20-04:00')
    expect(prompt).not.toContain('1745000000000')
  })

  it('emits "now" as an ISO-local string including timezone offset', () => {
    const prompt = buildDigestPrompt({ rawEmails, profiles, preResolved, now, timeZone: 'America/New_York' })
    expect(prompt).toContain('2026-04-21T09:00:00-04:00')
    expect(prompt).toContain('America/New_York')
  })

  it('instructs the LLM to emit dates as epoch milliseconds even though the input is ISO', () => {
    const prompt = buildDigestPrompt({ rawEmails, profiles, preResolved, now, timeZone: 'America/New_York' })
    expect(prompt.toLowerCase()).toContain('epoch millisecond')
  })
})
