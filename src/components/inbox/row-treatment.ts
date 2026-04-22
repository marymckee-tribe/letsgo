import type { EmailClassification } from '@/lib/store'

export interface RowTreatment {
  dimmed: boolean
  showWaitingBadge: boolean
}

export function rowTreatmentFor(c: EmailClassification): RowTreatment {
  switch (c) {
    case 'NEWSLETTER':
      return { dimmed: true, showWaitingBadge: false }
    case 'WAITING_ON':
      return { dimmed: false, showWaitingBadge: true }
    case 'CALENDAR_EVENT':
    case 'TODO':
    case 'NEEDS_REPLY':
    case 'FYI':
      return { dimmed: false, showWaitingBadge: false }
  }
}

export function shouldIncludeInUnreadCount(c: EmailClassification): boolean {
  return c !== 'NEWSLETTER'
}
