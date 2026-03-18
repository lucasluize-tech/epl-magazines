import { addDays, addMonths } from 'date-fns'

const CADENCE_OFFSETS = {
  WEEKLY:    (d) => addDays(d, 7),
  BI_WEEKLY: (d) => addDays(d, 14),
  MONTHLY:   (d) => addMonths(d, 1),
  BI_MONTHLY:(d) => addMonths(d, 2),
  SEASONAL:  (d) => addMonths(d, 3),
}

export const CADENCE_LABELS = {
  WEEKLY:    'Weekly',
  BI_WEEKLY: 'Bi-Weekly',
  MONTHLY:   'Monthly',
  BI_MONTHLY:'Bi-Monthly',
  SEASONAL:  'Seasonal',
}

/**
 * Compute the next expected delivery date given the last received date and cadence.
 * Returns null if lastReceivedDate is not set (never received).
 */
export function computeNextExpectedDate(lastReceivedDate, cadence) {
  if (!lastReceivedDate) return null
  return CADENCE_OFFSETS[cadence](new Date(lastReceivedDate))
}

/**
 * Returns true if the next expected date has already passed.
 */
export function isOverdue(nextExpectedDate) {
  if (!nextExpectedDate) return false
  return new Date(nextExpectedDate) < new Date()
}

/**
 * Returns true if the next expected date falls within the next 7 days (inclusive of today).
 */
export function isExpectedThisWeek(nextExpectedDate) {
  if (!nextExpectedDate) return false
  const now = new Date()
  const weekFromNow = addDays(now, 7)
  const next = new Date(nextExpectedDate)
  return next >= now && next <= weekFromNow
}

/**
 * Classify a magazine's status based on its next expected date.
 * Returns: 'never_received' | 'overdue' | 'this_week' | 'upcoming'
 */
export function getMagazineStatus(lastReceivedDate, cadence) {
  if (!lastReceivedDate) return 'never_received'
  const next = computeNextExpectedDate(lastReceivedDate, cadence)
  if (isOverdue(next)) return 'overdue'
  if (isExpectedThisWeek(next)) return 'this_week'
  return 'upcoming'
}
