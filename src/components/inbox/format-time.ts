import { format } from 'date-fns'

export function formatClock(input: Date | number): string {
  const d = typeof input === 'number' ? new Date(input) : input
  return format(d, 'h:mm a')
}

export function formatStamp(input: Date | number): string {
  const d = typeof input === 'number' ? new Date(input) : input
  return format(d, 'MMM d, h:mm a')
}
