import type {
  EndeavorShape,
  SeasonShape,
  RhythmShape,
  ThreadShape,
  Priority,
  WorthNoticing,
  Shape,
} from './types';

const now = Date.now();
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function addDaysISO(days: number): string {
  const d = new Date(Date.now() + days * DAY);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function nextSaturdayLabel(): string {
  const d = new Date();
  const dayOfWeek = d.getDay(); // 0=Sun
  const daysToSat = (6 - dayOfWeek + 7) % 7 || 7;
  const sat = new Date(d.getTime() + daysToSat * DAY);
  const sun = new Date(sat.getTime() + DAY);
  const monthAbbr = (x: Date) => x.toLocaleString('en-US', { month: 'short' });
  return `Sat–Sun, ${monthAbbr(sat)} ${sat.getDate()}–${sun.getDate()}`;
}

export const seedEndeavor: EndeavorShape = {
  id: 'disney-cruise-2027',
  kind: 'ENDEAVOR',
  title: 'Disney Cruise 2027',
  slug: 'disney-cruise',
  accentHex: '#3a7a85',
  openedAt: now - 21 * DAY,
  eventDateISO: addDaysISO(247),
  bookedCount: 3,
  totalCount: 12,
  budgetCommittedCents: 240000,
  budgetTotalCents: 1190000,
  nextAction: 'character dining Nov 3',
  openItems: ['Owen passport', "Ellie's birthday dessert pre-order", 'shore excursion at Castaway Cay'],
};

export const seedSeason: SeasonShape = {
  id: 'halloween-2026',
  kind: 'SEASON',
  title: 'Halloween',
  slug: 'halloween',
  accentHex: '#a66b2a',
  openedAt: now - 14 * DAY,
  cadence: 'annual',
  nextOccurrenceISO: addDaysISO(8),
  checklist: [
    { label: "Ellie costume: witch", done: true },
    { label: 'Owen costume', done: false, due: 'SUN' },
    { label: 'Candy', done: true },
    { label: 'Pumpkin carving', done: false, due: 'SAT' },
    { label: 'Teacher treat', done: false, due: 'MON' },
  ],
};

export const seedRhythm: RhythmShape = {
  id: 'weekend-charleston',
  kind: 'RHYTHM',
  title: nextSaturdayLabel(),
  slug: 'this-weekend',
  accentHex: '#3a6b48',
  openedAt: now - 3 * DAY,
  windowLabel: `Charleston · ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
  slots: [
    { label: 'SAT', body: 'Spoleto closing · Dewey\'s 7 PM avail' },
    { label: 'SUN', body: 'Boat slot 10–12 · MHT 11:42 · 8 kt' },
    { label: 'FRI', body: 'Dinner unplanned — Ellie out till 8' },
  ],
};

export const seedThread: ThreadShape = {
  id: 'lists-and-upkeep',
  kind: 'THREAD',
  title: 'Lists & Upkeep',
  slug: 'lists',
  accentHex: '#8c4a2b',
  openedAt: now - 180 * DAY,
  lists: [
    {
      id: 'groceries',
      name: 'Groceries',
      hint: 'Harris Teeter · Trader Joe\'s',
      lastAddedAt: now - 1 * HOUR,
      lastAddedCount: 2,
      items: [
        { id: 'g1', text: 'Milk', addedAt: now - 3 * HOUR, done: false },
        { id: 'g2', text: 'Oat milk (for Ellie)', addedAt: now - 3 * HOUR, done: false },
        { id: 'g3', text: 'Bananas', addedAt: now - 2 * HOUR, done: false },
        { id: 'g4', text: 'Bread — the sprouted one', addedAt: now - 2 * HOUR, done: false },
        { id: 'g5', text: 'Chicken thighs', addedAt: now - 2 * HOUR, done: false },
        { id: 'g6', text: 'Dishwasher pods', addedAt: now - 1 * HOUR, done: false },
        { id: 'g7', text: 'Frozen peas', addedAt: now - 1 * HOUR, done: false },
        { id: 'g8', text: 'Paper towels', addedAt: now - 30 * 60 * 1000, done: false },
      ],
    },
    {
      id: 'owen',
      name: "Owen's shopping",
      hint: "he's 2T now",
      lastAddedAt: now - 2 * DAY,
      lastAddedCount: 1,
      items: [
        { id: 'o1', text: 'Winter PJs — 2T', addedAt: now - 4 * DAY, done: false },
        { id: 'o2', text: 'Rain boots', addedAt: now - 3 * DAY, done: false },
        { id: 'o3', text: 'Diapers (size 5)', addedAt: now - 2 * DAY, done: false },
      ],
    },
    {
      id: 'ellie',
      name: "Ellie's shopping",
      lastAddedAt: now - 3 * DAY,
      lastAddedCount: 1,
      items: [
        { id: 'e1', text: 'School folder, blue', addedAt: now - 5 * DAY, done: false },
        { id: 'e2', text: 'Library book return bag', addedAt: now - 3 * DAY, done: false },
      ],
    },
    {
      id: 'christmas-gifts-26',
      name: "Christmas gifts '26",
      hint: '12 people · set budget $1,400',
      lastAddedAt: now - 2 * DAY,
      lastAddedCount: 3,
      items: [
        { id: 'cg1', text: 'Mom — Le Creuset braiser', addedAt: now - 10 * DAY, done: false },
        { id: 'cg2', text: 'Dad — leather journal', addedAt: now - 10 * DAY, done: false },
        { id: 'cg3', text: 'Ellie — Lego Dots box', addedAt: now - 9 * DAY, done: false },
        { id: 'cg4', text: 'Owen — wooden blocks', addedAt: now - 8 * DAY, done: false },
        { id: 'cg5', text: 'Anna — candle from Rewined', addedAt: now - 6 * DAY, done: false },
        { id: 'cg6', text: 'Sarah — cookbook', addedAt: now - 6 * DAY, done: false },
        { id: 'cg7', text: 'Jen — wine club', addedAt: now - 5 * DAY, done: false },
        { id: 'cg8', text: 'Jordan — ??', addedAt: now - 4 * DAY, done: false },
        { id: 'cg9', text: 'Kate — ??', addedAt: now - 3 * DAY, done: false },
        { id: 'cg10', text: 'Lindsey — ??', addedAt: now - 3 * DAY, done: false },
        { id: 'cg11', text: 'Teachers (2) — ??', addedAt: now - 2 * DAY, done: false },
        { id: 'cg12', text: 'Housekeeper — ??', addedAt: now - 2 * DAY, done: false },
      ],
    },
    {
      id: 'thank-yous',
      name: 'Thank-yous',
      hint: 'oldest 6d',
      lastAddedAt: now - 6 * DAY,
      lastAddedCount: 3,
      items: [
        { id: 'ty1', text: 'Jenny — baby shower gift', addedAt: now - 6 * DAY, done: false },
        { id: 'ty2', text: 'Kate — baby shower gift', addedAt: now - 6 * DAY, done: false },
        { id: 'ty3', text: 'Lindsey — baby shower gift', addedAt: now - 6 * DAY, done: false },
      ],
    },
    {
      id: 'texts-waiting',
      name: 'Texts waiting',
      hint: 'batch after bedtime',
      lastAddedAt: now - 6 * HOUR,
      lastAddedCount: 1,
      items: [
        { id: 'tx1', text: 'Sarah — 3d', addedAt: now - 3 * DAY, done: false },
        { id: 'tx2', text: 'Jen — 2d', addedAt: now - 2 * DAY, done: false },
        { id: 'tx3', text: 'Mom — 1d', addedAt: now - 1 * DAY, done: false },
        { id: 'tx4', text: 'Anna — 5d (sleep help q)', addedAt: now - 5 * DAY, done: false },
        { id: 'tx5', text: 'Anna — 2d (dinner sat)', addedAt: now - 2 * DAY, done: false },
      ],
    },
  ],
};

export const seedShapes: Shape[] = [seedEndeavor, seedSeason, seedRhythm, seedThread];

function futureDateLabel(days: number): string {
  const d = new Date(Date.now() + days * DAY);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
}

export const seedPriorities: Priority[] = [
  {
    id: 'rsvp-ava-5th',
    type: 'RSVP',
    label: "RSVP · Birthday · Ellie",
    title: "Ava's 5th — Shem Creek Park",
    deadline: 'DEADLINE today · event THU 4 PM',
    deadlineUrgency: 'today',
    metaRow: [
      { k: 'FROM', v: 'Amanda Walsh' },
      { k: 'VIA', v: 'ellie@mckeefamily.com' },
      { k: 'RECEIVED', v: '2d ago' },
    ],
    note: "Three of Ellie's class have already confirmed. She's asked about it twice since Saturday.",
    actions: [
      { label: "Yes, we're coming", kind: 'primary' },
      { label: 'Decline', kind: 'neutral' },
      { label: 'Defer to tonight', kind: 'neutral' },
      { label: 'Draft reply by hand', kind: 'quiet' },
    ],
  },
  {
    id: 'book-disney-character-dining',
    type: 'BOOK',
    label: "Book · Disney Cruise '27",
    title: 'Character dining — Wave 1 locks fast',
    deadline: `OPENS ${futureDateLabel(10)} · 04:00 ET · in 10 days`,
    deadlineUrgency: 'this-week',
    metaRow: [
      { k: 'ENDEAVOR', v: 'Disney Cruise 2027' },
      { k: 'CAL HOLD', v: 'ON' },
      { k: 'HIST', v: 'sells out < 15 min' },
    ],
    note: 'Storybook Dining tops your list. Pirate Night should be ticketed the same morning.',
    actions: [
      { label: 'Set alarm Nov 2 · 9 PM', kind: 'primary' },
      { label: 'Open booking link', kind: 'neutral' },
      { label: 'Add Owen to party', kind: 'neutral' },
      { label: 'Skip, not worth the fight', kind: 'quiet' },
    ],
    shapeId: 'disney-cruise-2027',
  },
  {
    id: 'reply-mom-care-package',
    type: 'REPLY',
    label: 'Reply · Thank-you · Mom',
    title: 'Photos from the care package',
    deadline: 'OVERDUE 2d · your own rule: 5d',
    deadlineUrgency: 'today',
    metaRow: [
      { k: 'FROM', v: 'Diane (Mom)' },
      { k: 'THREAD', v: '6 msgs' },
      { k: 'LAST', v: 'Mon 7:14 PM' },
    ],
    note: 'She sent pictures of Ellie in the sweater. Half a sentence would land.',
    actions: [
      { label: 'Draft a reply', kind: 'primary' },
      { label: 'Send a voice note', kind: 'neutral' },
      { label: 'Skip today', kind: 'quiet' },
    ],
  },
];

export const seedWorthNoticing: WorthNoticing = {
  note: "Inbox is 38% lighter than this day last month — you cleared 14 yesterday and routed 3 into Disney planning. The Nov 3 booking window is the only real deadline between now and Thanksgiving.",
  metrics: [
    { n: '14', l: 'cleared yest.' },
    { n: '−38%', l: 'inbox MoM' },
    { n: '1', l: 'hard deadline', accent: true },
  ],
};
