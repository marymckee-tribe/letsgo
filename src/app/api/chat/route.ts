// @ts-nocheck
import { openai } from '@ai-sdk/openai';
import { streamText, tool } from 'ai';
import { z } from 'zod';

export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages, contextState } = await req.json();

  const systemPrompt = `
You are the elite "Chief of Staff" AI for The Hub. You speak in a calm, concise, capable, and empowering tone.

CRITICAL FAMILY CONTEXT & LIVE STATE:
${JSON.stringify(contextState, null, 2)}

    Your job is to parse the user's directive and execute actions securely.
CRITICAL MANDATE: Deeply analyze the 'profiles' and 'emails' entity graph provided in the state.

If the user simply issues an execution command (e.g. Schedule an event, write a task, add grocery), YOU MUST RETURN A JSON COMMAND BLOCK enclosed exactly in markdown formatting like this at the very end of your response:
\`\`\`json
[
  { "action": "create_gcal_event", "payload": { "title": "Gymnastics", "time": "16:00", "date": 20 } },
  { "action": "create_gtask", "payload": { "title": "Buy gift", "context": "PERSONAL" } },
  { "action": "update_grocery_list", "payload": { "name": "Almond Milk" } }
]
\`\`\`
Valid actions are: 'create_gcal_event', 'update_gcal_event', 'delete_gcal_event', 'create_gtask', 'update_gtask', 'save_pdf_to_drive', 'update_grocery_list'.

If the user asks to brainstorm or plan meals, respond thoroughly in beautiful text formatting, and ONLY append the JSON execution array at the end if specific items need to be dynamically scheduled or saved to the execution state. Do NOT use tool calls.
  `;

  try {
    const result = await streamText({
      model: openai('gpt-4o'),
      system: systemPrompt,
      messages,
    });

    return result.toTextStreamResponse();
  } catch (error: any) {
    console.error("AI Route Error:", error);
    return new Response(JSON.stringify({ error: error.message || error.toString() }), { status: 500 })
  }
}
