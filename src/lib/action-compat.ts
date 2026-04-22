import type { EmailActionStatus } from '@/lib/store'

type LegacyStatus = 'PENDING' | 'APPROVED' | 'DISMISSED'

/**
 * Translate the rich EmailActionStatus to the three-value legacy status
 * expected by older server routes and UI consumers.
 *
 * PROPOSED | WRITING | EDITING → PENDING
 * COMMITTED                    → APPROVED
 * DISMISSED | FAILED           → DISMISSED
 */
export function toLegacyStatus(status: EmailActionStatus): LegacyStatus {
  switch (status) {
    case 'PROPOSED':
    case 'WRITING':
    case 'EDITING':
      return 'PENDING'
    case 'COMMITTED':
      return 'APPROVED'
    case 'DISMISSED':
    case 'FAILED':
      return 'DISMISSED'
  }
}

/**
 * Translate a legacy status back to the canonical EmailActionStatus.
 *
 * PENDING   → PROPOSED
 * APPROVED  → COMMITTED
 * DISMISSED → DISMISSED
 */
export function fromLegacyStatus(legacy: LegacyStatus): EmailActionStatus {
  switch (legacy) {
    case 'PENDING':
      return 'PROPOSED'
    case 'APPROVED':
      return 'COMMITTED'
    case 'DISMISSED':
      return 'DISMISSED'
  }
}

/**
 * Returns true when the status represents an action the user can still
 * take in the UI (approve / edit / dismiss).
 *
 * Actionable:     PROPOSED, EDITING
 * Not actionable: WRITING, COMMITTED, DISMISSED, FAILED
 */
export function isActionable(status: EmailActionStatus): boolean {
  return status === 'PROPOSED' || status === 'EDITING'
}
