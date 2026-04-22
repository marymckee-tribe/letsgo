import type { z } from 'zod'
import { ClassifiedEmailsSchema } from '@/lib/server/classification-schema'

type Payload = z.infer<typeof ClassifiedEmailsSchema>

export const FIXTURE: Payload = {
  emails: [
    {
      id: 'calendar-event',
      classification: 'CALENDAR_EVENT',
      snippet: 'Zoo trip Thursday at 8 a.m.; peanut-free lunches.',
      senderIdentity: { personId: 'ellie', orgName: null, confidence: 'high' },
      suggestedActions: [
        {
          id: 'a1',
          type: 'CALENDAR_EVENT',
          title: 'Zoo trip',
          date: 1_745_000_000_000,
          time: '8:00 AM',
          context: 'FAMILY',
          sourceQuote: 'Zoo trip Thursday 8am.',
          confidence: 'high',
        },
      ],
    },
    {
      id: 'todo',
      classification: 'TODO',
      snippet: 'Return the signed permission slip by Friday.',
      senderIdentity: { personId: 'annie', orgName: null, confidence: 'medium' },
      suggestedActions: [
        {
          id: 'a2',
          type: 'TODO',
          title: 'Sign and return permission slip',
          date: 1_745_400_000_000,
          time: null,
          context: 'KID 2',
          sourceQuote: 'Please return the signed slip by Friday.',
          confidence: 'medium',
        },
      ],
    },
    {
      id: 'needs-reply',
      classification: 'NEEDS_REPLY',
      snippet: 'Can you confirm dinner on Saturday?',
      senderIdentity: { personId: 'doug', orgName: null, confidence: 'high' },
      suggestedActions: [
        {
          id: 'a3',
          type: 'NEEDS_REPLY',
          title: 'Re: Dinner Saturday',
          date: null,
          time: null,
          context: null,
          sourceQuote: 'Can you confirm dinner on Saturday?',
          confidence: 'high',
        },
      ],
    },
    {
      id: 'waiting-on',
      classification: 'WAITING_ON',
      snippet: 'Waiting on Doug to send the tax doc.',
      senderIdentity: { personId: 'doug', orgName: null, confidence: 'medium' },
      suggestedActions: [],
    },
    {
      id: 'fyi',
      classification: 'FYI',
      snippet: 'Power outage scheduled Wednesday 2–4 PM.',
      senderIdentity: null,
      suggestedActions: [],
    },
    {
      id: 'newsletter',
      classification: 'NEWSLETTER',
      snippet: 'The Morning — top headlines.',
      senderIdentity: null,
      suggestedActions: [],
    },
  ],
}

export function parseFixture() {
  return ClassifiedEmailsSchema.parse(FIXTURE)
}
