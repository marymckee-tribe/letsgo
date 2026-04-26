import { seedShapes, seedPriorities, seedWorthNoticing } from '@/lib/life-hub/seed';

describe('life-hub seed data', () => {
  test('seed exposes four shapes, one per kind', () => {
    expect(seedShapes).toHaveLength(4);
    const kinds = seedShapes.map((s) => s.kind).sort();
    expect(kinds).toEqual(['ENDEAVOR', 'RHYTHM', 'SEASON', 'THREAD']);
  });

  test('thread shape has the expected lists (first-class shopping)', () => {
    const thread = seedShapes.find((s) => s.kind === 'THREAD');
    expect(thread).toBeDefined();
    if (thread?.kind !== 'THREAD') throw new Error('type narrow');
    const listIds = thread.lists.map((l) => l.id);
    expect(listIds).toContain('groceries');
    expect(listIds).toContain('owen');
    expect(listIds).toContain('ellie');
    expect(listIds).toContain('christmas-gifts-26');
    expect(listIds).toContain('thank-yous');
    expect(listIds).toContain('texts-waiting');
  });

  test('endeavor has concrete budget + progress metadata', () => {
    const e = seedShapes.find((s) => s.kind === 'ENDEAVOR');
    if (e?.kind !== 'ENDEAVOR') throw new Error('type narrow');
    expect(e.bookedCount).toBeGreaterThan(0);
    expect(e.totalCount).toBeGreaterThan(e.bookedCount);
    expect(e.budgetCommittedCents).toBeGreaterThan(0);
    expect(e.budgetTotalCents).toBeGreaterThan(e.budgetCommittedCents ?? 0);
  });

  test('priorities include the three archetype cases', () => {
    const types = seedPriorities.map((p) => p.type);
    expect(types).toContain('RSVP');
    expect(types).toContain('BOOK');
    expect(types).toContain('REPLY');
  });

  test('worth noticing has a concrete narrative note and metrics', () => {
    expect(seedWorthNoticing.note.length).toBeGreaterThan(40);
    expect(seedWorthNoticing.metrics).toHaveLength(3);
    expect(seedWorthNoticing.metrics.find((m) => m.accent)).toBeDefined();
  });
});
