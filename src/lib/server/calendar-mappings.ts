// src/lib/server/calendar-mappings.ts
import { getAdminDb } from './firebase-admin'

export interface CalendarMapping {
  calendarId: string
  accountId: string
  calendarName: string
  profileId: string | null
  updatedAt: number
}

function col(uid: string) {
  return getAdminDb().collection('users').doc(uid).collection('calendarMappings')
}

export async function listCalendarMappings(uid: string): Promise<CalendarMapping[]> {
  const snap = await col(uid).get()
  return snap.docs.map(d => d.data() as CalendarMapping)
}

export async function getCalendarMapping(uid: string, calendarId: string): Promise<CalendarMapping | null> {
  const d = await col(uid).doc(calendarId).get()
  if (!d.exists) return null
  return d.data() as CalendarMapping
}

export async function setCalendarMapping(
  uid: string,
  input: { calendarId: string; accountId: string; calendarName: string; profileId: string | null },
): Promise<void> {
  const record: CalendarMapping = {
    calendarId: input.calendarId,
    accountId: input.accountId,
    calendarName: input.calendarName,
    profileId: input.profileId,
    updatedAt: Date.now(),
  }
  await col(uid).doc(input.calendarId).set(record)
}

export async function deleteCalendarMapping(uid: string, calendarId: string): Promise<void> {
  await col(uid).doc(calendarId).delete()
}
