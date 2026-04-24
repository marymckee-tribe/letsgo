// src/lib/calendar-colors.ts

export interface CalendarColor {
  id: string           // stable key, stored in Firestore (e.g. 'blue', 'teal')
  label: string        // display name for picker
  main: string         // the event chip border/text color
  container: string    // the event chip background (soft tint)
  onContainer: string  // dark variant for on-container text
}

export const CALENDAR_PALETTE: CalendarColor[] = [
  { id: 'blue',   label: 'Blue',   main: '#1a73e8', container: '#e8f0fe', onContainer: '#174ea6' },
  { id: 'teal',   label: 'Teal',   main: '#00897b', container: '#b2dfdb', onContainer: '#00695c' },
  { id: 'green',  label: 'Green',  main: '#2e7d32', container: '#c8e6c9', onContainer: '#1b5e20' },
  { id: 'purple', label: 'Purple', main: '#6750a4', container: '#eaddff', onContainer: '#21005e' },
  { id: 'pink',   label: 'Pink',   main: '#d81b60', container: '#f8bbd0', onContainer: '#880e4f' },
  { id: 'orange', label: 'Orange', main: '#ef6c00', container: '#ffe0b2', onContainer: '#e65100' },
  { id: 'red',    label: 'Red',    main: '#c62828', container: '#ffcdd2', onContainer: '#b71c1c' },
  { id: 'slate',  label: 'Slate',  main: '#455a64', container: '#cfd8dc', onContainer: '#263238' },
]

export const DEFAULT_CALENDAR_COLOR_ID = 'blue'

export function getCalendarColor(id: string | undefined): CalendarColor {
  return CALENDAR_PALETTE.find((c) => c.id === id) ?? CALENDAR_PALETTE[0]
}
