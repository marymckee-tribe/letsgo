import { ClassifiedEmailsSchema, CLASSIFICATION_VALUES, ACTION_TYPE_VALUES } from '@/lib/server/classification-schema'

describe('ClassifiedEmailsSchema', () => {
  const valid = {
    emails: [
      {
        id: 'm1',
        classification: 'CALENDAR_EVENT',
        snippet: 'Zoo trip Thursday.',
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
    ],
  }

  it('accepts a valid payload', () => {
    expect(() => ClassifiedEmailsSchema.parse(valid)).not.toThrow()
  })

  it('rejects an unknown classification', () => {
    const bad = {
      emails: [{ ...valid.emails[0], classification: 'URGENT' }],
    }
    expect(() => ClassifiedEmailsSchema.parse(bad)).toThrow()
  })

  it('rejects an action without sourceQuote', () => {
    const bad = {
      emails: [{
        ...valid.emails[0],
        suggestedActions: [{ ...valid.emails[0].suggestedActions[0], sourceQuote: undefined }],
      }],
    }
    expect(() => ClassifiedEmailsSchema.parse(bad)).toThrow()
  })

  it('accepts NEWSLETTER with zero actions', () => {
    const news = {
      emails: [{
        id: 'm2',
        classification: 'NEWSLETTER',
        snippet: 'Weekly digest.',
        senderIdentity: null,
        suggestedActions: [],
      }],
    }
    expect(() => ClassifiedEmailsSchema.parse(news)).not.toThrow()
  })

  it('enumerates all 6 classifications', () => {
    expect(CLASSIFICATION_VALUES).toEqual([
      'CALENDAR_EVENT', 'TODO', 'NEEDS_REPLY', 'WAITING_ON', 'FYI', 'NEWSLETTER',
    ])
  })

  it('enumerates all 3 action types', () => {
    expect(ACTION_TYPE_VALUES).toEqual(['CALENDAR_EVENT', 'TODO', 'NEEDS_REPLY'])
  })
})
