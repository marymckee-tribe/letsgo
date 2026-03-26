// src/app/api/calendar/event-notes/route.ts
export const runtime = 'nodejs'
export const maxDuration = 30

import { anthropic } from '@ai-sdk/anthropic'
import { generateText } from 'ai'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { event, profiles = [], nearbyEvents = [] } = await req.json()

    const profileLines = (profiles as any[]).map(p => {
      const parts = [`${p.name} (${p.type})`]
      if (p.medicalFlags?.length) parts.push(`Medical: ${p.medicalFlags.join(', ')}`)
      if (p.dietary?.length) parts.push(`Dietary: ${p.dietary.join(', ')}`)
      if (p.routines?.length) {
        parts.push(`Routines: ${(p.routines as any[]).map(r => `${r.activity} ${r.day} ${r.time}`).join(', ')}`)
      }
      return parts.join(' | ')
    })

    const nearbyLine = (nearbyEvents as any[]).length > 0
      ? `Same-day events: ${(nearbyEvents as any[]).map((e: any) => `${e.title} at ${e.time}`).join(', ')}`
      : ''

    const { text } = await generateText({
      model: anthropic('claude-haiku-4-5-20251001'),
      prompt: `Generate 2-4 concise prep notes for this calendar event as markdown bullet points.

Event: ${event.title}
Date: ${event.date}, Time: ${event.time}${event.location ? `\nLocation: ${event.location}` : ''}
${profileLines.length > 0 ? `\nFamily:\n${profileLines.join('\n')}` : ''}
${nearbyLine}

Rules:
- Use markdown bullets (- item)
- Each bullet is one actionable prep item or useful context
- Cross-reference family profiles for conflicts, allergies, who is involved
- Flag travel time concerns if same-day events are close in time
- Mention materials to bring if relevant
- Keep each bullet under 12 words
- No generic filler like "arrive on time"`,
    })

    return NextResponse.json({ notes: text })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
