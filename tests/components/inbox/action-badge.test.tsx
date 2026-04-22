import { render, screen } from '@testing-library/react'
import { ActionBadge, actionBadgesFor } from '@/components/inbox/action-badge'
import type { Email } from '@/lib/store'

describe('ActionBadge', () => {
  it('renders CAL for CALENDAR_EVENT', () => {
    render(<ActionBadge kind="CAL" />)
    expect(screen.getByText('CAL')).toBeInTheDocument()
  })

  it('renders TODO', () => {
    render(<ActionBadge kind="TODO" />)
    expect(screen.getByText('TODO')).toBeInTheDocument()
  })

  it('renders REPLY', () => {
    render(<ActionBadge kind="REPLY" />)
    expect(screen.getByText('REPLY')).toBeInTheDocument()
  })

  it('renders PDF', () => {
    render(<ActionBadge kind="PDF" />)
    expect(screen.getByText('PDF')).toBeInTheDocument()
  })
})

describe('actionBadgesFor', () => {
  const baseEmail: Email = {
    id: 'm1',
    subject: 'x',
    sender: 'x',
    snippet: 'x',
    fullBody: 'x',
    classification: 'CALENDAR_EVENT',
    attachments: [],
    suggestedActions: [
      { id: 'a1', type: 'CALENDAR_EVENT', title: 'x', sourceQuote: 'x', confidence: 'high', status: 'PROPOSED' },
    ],
    date: 0,
    hubStatus: 'UNREAD',
  }

  it('emits CAL for CALENDAR_EVENT action', () => {
    expect(actionBadgesFor(baseEmail)).toEqual(['CAL'])
  })

  it('emits TODO for TODO action', () => {
    const e = { ...baseEmail, suggestedActions: [{ ...baseEmail.suggestedActions[0], type: 'TODO' as const }] }
    expect(actionBadgesFor(e)).toEqual(['TODO'])
  })

  it('emits REPLY for NEEDS_REPLY action', () => {
    const e = { ...baseEmail, suggestedActions: [{ ...baseEmail.suggestedActions[0], type: 'NEEDS_REPLY' as const }] }
    expect(actionBadgesFor(e)).toEqual(['REPLY'])
  })

  it('emits PDF when any attachment is present, regardless of mime', () => {
    const e = { ...baseEmail, suggestedActions: [], attachments: [{ id: 'att1', filename: 'x.pdf', mimeType: 'application/pdf', size: 1 }] }
    expect(actionBadgesFor(e)).toEqual(['PDF'])
  })

  it('combines action + attachment badges in CAL/TODO/REPLY/PDF order', () => {
    const e = {
      ...baseEmail,
      attachments: [{ id: 'att1', filename: 'x.pdf', mimeType: 'application/pdf', size: 1 }],
      suggestedActions: [
        { id: 'a1', type: 'CALENDAR_EVENT' as const, title: 'x', sourceQuote: 'x', confidence: 'high' as const, status: 'PROPOSED' as const },
        { id: 'a2', type: 'TODO' as const, title: 'y', sourceQuote: 'y', confidence: 'high' as const, status: 'PROPOSED' as const },
      ],
    }
    expect(actionBadgesFor(e)).toEqual(['CAL', 'TODO', 'PDF'])
  })
})
