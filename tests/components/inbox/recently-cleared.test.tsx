import { render, screen, fireEvent } from '@testing-library/react'
import { RecentlyCleared } from '@/components/inbox/recently-cleared'
import type { Email } from '@/lib/store'

const cleared: Email[] = Array.from({ length: 3 }).map((_, i) => ({
  id: `m${i}`,
  subject: `Cleared ${i}`,
  sender: 'x',
  classification: 'FYI',
  snippet: 's',
  fullBody: '',
  attachments: [],
  suggestedActions: [],
  date: 0,
  hubStatus: 'CLEARED',
}))

describe('RecentlyCleared', () => {
  it('is collapsed by default and shows the count', () => {
    render(<RecentlyCleared emails={cleared} onRestore={() => {}} />)
    expect(screen.getByText(/Recently cleared \(3\)/)).toBeInTheDocument()
    expect(screen.queryByText('Cleared 0')).toBeNull()
  })

  it('expands on click and lists cleared emails', () => {
    render(<RecentlyCleared emails={cleared} onRestore={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /Recently cleared/ }))
    expect(screen.getByText('Cleared 0')).toBeInTheDocument()
    expect(screen.getByText('Cleared 1')).toBeInTheDocument()
    expect(screen.getByText('Cleared 2')).toBeInTheDocument()
  })

  it('fires onRestore with the id and auto-collapses after restore', () => {
    const onRestore = jest.fn()
    render(<RecentlyCleared emails={cleared} onRestore={onRestore} />)
    fireEvent.click(screen.getByRole('button', { name: /Recently cleared/ }))
    fireEvent.click(screen.getAllByRole('button', { name: /restore/i })[0])
    expect(onRestore).toHaveBeenCalledWith('m0')
    expect(screen.queryByText('Cleared 0')).toBeNull()
  })

  it('respects the limit prop (defaults to 10)', () => {
    const many = Array.from({ length: 15 }).map((_, i) => ({ ...cleared[0], id: `m${i}`, subject: `Cleared ${i}` }))
    render(<RecentlyCleared emails={many} onRestore={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /Recently cleared/ }))
    expect(screen.queryByText('Cleared 10')).toBeNull()
    expect(screen.getByText('Cleared 9')).toBeInTheDocument()
  })
})
