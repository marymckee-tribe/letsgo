import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { z } from 'zod';
import { NextResponse } from 'next/server';

export const maxDuration = 60;

const ScheduleSchema = z.object({
  scheduleInsights: z.array(z.string()).describe("A list of 1-3 warnings about the day, like 'Tight transition between School and Gymnastics.' Keep extremely concise. Empty if none."),
  enhancedEvents: z.array(z.object({
    id: z.string(),
    aiTravelBuffer: z.string().nullable().describe("A concise buffer estimate (e.g., '15m Drive', 'Virtual'). Null if unknown."),
    aiPrepSuggestion: z.string().nullable().describe("A 1-sentence prep or packing reminder based on the event and family profiles. Null if routine."),
  }))
})

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const accessToken = authHeader.split(' ')[1];
    
    const body = await req.json();
    const profiles = body.profiles || [];

    // 1. Fetch raw payload from Google Calendar
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const timeMax = new Date(startOfDay);
    timeMax.setDate(timeMax.getDate() + 3); // Look at the next 72 hours for intelligence
    
    // Convert to ISO but encode colons just in case, though standard fetch usually handles simple params
    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(startOfDay.toISOString())}&timeMax=${encodeURIComponent(timeMax.toISOString())}&maxResults=15&singleEvents=true&orderBy=startTime`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    
    const listData = await res.json();
    if (listData.error) return NextResponse.json({ error: listData.error }, { status: 403 });
    if (!listData.items || listData.items.length === 0) return NextResponse.json({ events: [], insights: [] });

    // 2. Map the raw Google Calendar payload
    const rawEvents = listData.items.map((item: any) => {
      const dateObj = new Date(item.start.dateTime || item.start.date);
      return {
        id: item.id,
        summary: item.summary,
        location: item.location || "TBD",
        description: item.description || "",
        startTime: dateObj.toISOString(),
        timeStr: dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        date: dateObj.getDate()
      }
    });

    // 3. AI Interception Layer -> Digestion
    const prompt = `You are a Chief of Staff AI. Analyze the following family schedule and their profiles. Generate travel buffers and specific prep checklists. Identify any unrealistic transitions.
    
    FAMILY PROFILES (Use this to infer who tasks belong to and their sizes/routines):
    ${JSON.stringify(profiles, null, 2)}
    
    SCHEDULE:
    ${JSON.stringify(rawEvents, null, 2)}`;

    const { object } = await generateObject({
      model: openai('gpt-4o-mini'),
      schema: ScheduleSchema,
      prompt: prompt,
    });

    // Merge the AI analysis back with the core Google Calendar data
    const enhancedMergedEvents = rawEvents.map((raw: any) => {
       const aiData = object.enhancedEvents.find(e => e.id === raw.id) || { aiTravelBuffer: null, aiPrepSuggestion: null };
       return {
         id: raw.id,
         title: raw.summary,
         time: raw.timeStr,
         date: raw.date,
         location: raw.location,
         aiTravelBuffer: aiData.aiTravelBuffer,
         aiPrepSuggestion: aiData.aiPrepSuggestion
       }
    })

    return NextResponse.json({ events: enhancedMergedEvents, insights: object.scheduleInsights });
  } catch (error: any) {
    console.error("Calendar digest error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
