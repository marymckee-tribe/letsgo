import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { z } from 'zod';
import { NextResponse } from 'next/server';

export const maxDuration = 60;

const EmailSchema = z.object({
  emails: z.array(z.object({
    id: z.string(),
    subject: z.string(),
    sender: z.string(),
    snippet: z.string().describe("A heavily cleaned, 1-sentence executive summary of the email."),
    suggestedActions: z.array(z.object({
      id: z.string().describe("A unique random 6-character string"),
      type: z.enum(["CALENDAR_INVITE", "TODO_ITEM"]),
      title: z.string().describe("Cleaned task or event title (e.g. 'Gymnastics Class', 'Sign Form')"),
      date: z.number().nullable().describe("Day of month (1-31) if type is CALENDAR_INVITE. Null if inapplicable."),
      time: z.string().nullable().describe("HH:MM string if type is CALENDAR_INVITE. Null if inapplicable."),
      context: z.enum(['WORK', 'PERSONAL', 'FAMILY', 'KID 1', 'KID 2']).nullable().describe("Null if inapplicable.")
    })).describe("Explicit actions extracted from the email. Empty array if none.")
  }))
})

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const accessToken = authHeader.split(' ')[1];

    // 1. Fetch raw payload from Gmail
    const query = encodeURIComponent("in:inbox category:primary is:unread newer_than:7d");
    const listRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${query}&maxResults=10`, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    
    const listData = await listRes.json();
    if (listData.error) return NextResponse.json({ error: listData.error }, { status: 403 });
    if (!listData.messages || listData.messages.length === 0) return NextResponse.json({ emails: [] });

    // 2. Fetch specific thread bodies
    const rawEmails = await Promise.all(listData.messages.map(async (msg: any) => {
        const msgRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        const msgData = await msgRes.json();
        const getHeader = (name: string) => msgData.payload?.headers?.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || "Unknown";
        
        const extractBody = (payload: any): string => {
            if (!payload) return "";
            let text = "";
            if (payload.mimeType === "text/plain" && payload.body?.data) {
                text = Buffer.from(payload.body.data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
            } else if (payload.parts) {
                payload.parts.forEach((p: any) => { text += extractBody(p) });
            }
            return text;
        }

        const extractAttachments = (payload: any): any[] => {
            if (!payload) return [];
            let atts: any[] = [];
            if (payload.filename && payload.filename.length > 0) {
                atts.push({ filename: payload.filename, mimeType: payload.mimeType });
            }
            if (payload.parts) {
                payload.parts.forEach((p: any) => { atts.push(...extractAttachments(p)) });
            }
            return atts;
        }

        const body = extractBody(msgData.payload) || msgData.snippet || "";
        const attachments = extractAttachments(msgData.payload);

        return {
           id: msgData.id,
           subject: getHeader("subject"),
           sender: getHeader("from").split('<')[0].trim(),
           content: body.substring(0, 4000),
           attachments: attachments,
           date: parseInt(msgData.internalDate || Date.now().toString(), 10)
        }
    }));

    // 3. AI Interception Layer -> Digestion
    const prompt = `You are a Chief of Staff AI. Extract and clean the following emails into high-signal summaries. Strip all noise. Identify embedded instructions requiring physical execution and structure them into the suggestedActions array.\n\nEmails:\n${JSON.stringify(rawEmails, null, 2)}`;

    const { object } = await generateObject({
      model: openai('gpt-4o-mini'),
      schema: EmailSchema,
      prompt: prompt,
    });

    // Merge the AI analysis back with the core timestamps to ensure chronological integrity
    const digestedEmails = object.emails.map(aiEmail => {
       const raw = rawEmails.find(r => r.id === aiEmail.id) || rawEmails[0];
       const actions = aiEmail.suggestedActions.map(a => ({ ...a, status: "PENDING" }));
       return {
         ...aiEmail,
         suggestedActions: actions,
         fullBody: raw.content,
         attachments: raw.attachments,
         date: raw.date
       }
    })

    return NextResponse.json({ emails: digestedEmails });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
