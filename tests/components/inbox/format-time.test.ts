import { formatClock, formatStamp } from '@/components/inbox/format-time'

describe('formatClock', () => {
  it('renders morning times as h:mm AM', () => {
    const d = new Date('2026-04-21T08:05:00')
    expect(formatClock(d)).toBe('8:05 AM')
  })

  it('renders afternoon times as h:mm PM', () => {
    const d = new Date('2026-04-21T15:00:00')
    expect(formatClock(d)).toBe('3:00 PM')
  })

  it('accepts epoch ms', () => {
    const d = new Date('2026-04-21T09:30:00')
    expect(formatClock(d.getTime())).toBe('9:30 AM')
  })

  it('renders midnight as 12:00 AM', () => {
    const d = new Date('2026-04-21T00:00:00')
    expect(formatClock(d)).toBe('12:00 AM')
  })

  it('renders noon as 12:00 PM', () => {
    const d = new Date('2026-04-21T12:00:00')
    expect(formatClock(d)).toBe('12:00 PM')
  })
})

describe('formatStamp', () => {
  it('renders Apr 21, 3:00 PM', () => {
    const d = new Date('2026-04-21T15:00:00')
    expect(formatStamp(d)).toBe('Apr 21, 3:00 PM')
  })
})
