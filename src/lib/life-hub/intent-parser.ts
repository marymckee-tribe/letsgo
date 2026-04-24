export type ParsedIntent =
  | { kind: 'addToList'; list: string; text: string }
  | { kind: 'completeInList'; list: string; text: string }
  | { kind: 'query'; query: string }
  | { kind: 'remind'; text: string; when?: string }
  | { kind: 'unmatched' };

// Canonicalize so "Owen's" / "owen" / "owens" all parse the same.
function canon(raw: string): string {
  return raw.toLowerCase().replace(/['']s\b/g, '').replace(/'s\b/g, '').trim();
}

const LIST_ALIASES: { key: string; patterns: RegExp[] }[] = [
  { key: 'groceries',          patterns: [/\bgrocer(?:y|ies)\b/, /\bfood\b/, /\bshopping list\b/] },
  { key: 'owen',               patterns: [/\bowens?\b/, /\bowen list\b/] },
  { key: 'ellie',              patterns: [/\bellies?\b/, /\bellie list\b/] },
  { key: 'christmas-gifts-26', patterns: [/\bchristmas\b/, /\bxmas\b/, /\bgifts?\b/, /\bholidays?\b/] },
  { key: 'thank-yous',         patterns: [/\bthank[- ]?yous?\b/, /\bthanks\b/] },
  { key: 'texts-waiting',      patterns: [/\btexts?\b/, /\breplies?\b/, /\breply\b/] },
];

export function matchListKey(phrase: string): string | null {
  const p = canon(phrase);
  for (const a of LIST_ALIASES) {
    for (const re of a.patterns) {
      if (re.test(p)) return a.key;
    }
  }
  return null;
}

// Handles patterns like:
//   "add X to Y" / "add X to my Y" / "put X on Y list" / "Y: X" / "add X"
//   "add diapers to Owen"
//   "put milk on the grocery list"
//   "groceries: oat milk, eggs, bananas"
//   "mark oat milk done" / "cross off oat milk"
export function parseIntent(input: string): ParsedIntent {
  const raw = input.trim();
  if (!raw) return { kind: 'unmatched' };

  // "groceries: X" / "owen: diapers, wipes"
  const colon = raw.match(/^([A-Za-z'\-\s]{2,30}):\s*(.+)$/);
  if (colon) {
    const list = matchListKey(colon[1]);
    if (list) return { kind: 'addToList', list, text: colon[2].trim() };
  }

  // complete intents
  const complete = raw.match(/\b(?:mark|cross|check)\s+(?:off\s+)?(.+?)\s+(?:done|off|as done)\b/i);
  if (complete) {
    return { kind: 'completeInList', list: '', text: complete[1].trim() };
  }

  // "remind me ..." — defer to chat API / LLM eventually; for MVP return as reminder intent
  const remind = raw.match(/^remind (?:me )?(?:to\s+)?(.+?)(?:\s+(?:on|at|by)\s+(.+))?$/i);
  if (remind) {
    return { kind: 'remind', text: remind[1].trim(), when: remind[2]?.trim() };
  }

  // "add X to Y" / "add X to my Y" / "put X on Y list"
  const addTo = raw.match(/^(?:add|put|save)\s+(.+?)\s+(?:to|on)\s+(?:my\s+|the\s+)?(.+?)(?:\s+list)?\.?$/i);
  if (addTo) {
    const maybe = matchListKey(addTo[2]);
    if (maybe) return { kind: 'addToList', list: maybe, text: addTo[1].trim() };
  }

  // "add X" without destination → try to infer; else unmatched
  const addOnly = raw.match(/^(?:add|save)\s+(.+)$/i);
  if (addOnly) {
    return { kind: 'addToList', list: 'groceries', text: addOnly[1].trim() };
  }

  // "what's on saturday" / "what's happening this weekend"
  if (/^(what|when|how|where|why|who)\b/i.test(raw)) {
    return { kind: 'query', query: raw };
  }

  return { kind: 'unmatched' };
}
