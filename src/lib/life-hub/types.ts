export type ShapeKind = 'ENDEAVOR' | 'SEASON' | 'RHYTHM' | 'THREAD';

export type ShapeId = string;

export type ShapeBase = {
  id: ShapeId;
  kind: ShapeKind;
  title: string;
  slug: string;
  accentHex: string;
  openedAt: number;
};

export type EndeavorShape = ShapeBase & {
  kind: 'ENDEAVOR';
  eventDateISO: string;
  bookedCount: number;
  totalCount: number;
  budgetCommittedCents?: number;
  budgetTotalCents?: number;
  nextAction?: string;
  openItems?: string[];
};

export type SeasonShape = ShapeBase & {
  kind: 'SEASON';
  cadence: 'annual' | 'school-year' | 'quarterly';
  nextOccurrenceISO: string;
  checklist: { label: string; done: boolean; due?: string }[];
};

export type RhythmShape = ShapeBase & {
  kind: 'RHYTHM';
  windowLabel: string;
  slots: { label: string; body: string }[];
};

export type ThreadShape = ShapeBase & {
  kind: 'THREAD';
  lists: ThreadList[];
};

export type ThreadList = {
  id: string;
  name: string;
  hint?: string;
  items: ThreadItem[];
  lastAddedAt?: number;
  lastAddedCount?: number;
};

export type ThreadItem = {
  id: string;
  text: string;
  addedAt: number;
  done: boolean;
};

export type Shape = EndeavorShape | SeasonShape | RhythmShape | ThreadShape;

export type PriorityType =
  | 'RSVP'
  | 'BOOK'
  | 'REPLY'
  | 'DECIDE'
  | 'BUY'
  | 'SCHEDULE';

export type Priority = {
  id: string;
  type: PriorityType;
  label: string;
  title: string;
  deadline: string;
  deadlineUrgency: 'today' | 'this-week' | 'this-month' | 'ok';
  metaRow: { k: string; v: string }[];
  note: string;
  actions: PriorityAction[];
  shapeId?: ShapeId;
  snoozed?: boolean;
};

export type PriorityAction = {
  label: string;
  kind: 'primary' | 'neutral' | 'quiet';
};

export type WorthNoticing = {
  note: string;
  metrics: { n: string; l: string; accent?: boolean }[];
};
