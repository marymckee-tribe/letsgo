import { parseIntent, matchListKey } from '@/lib/life-hub/intent-parser';

describe('life-hub intent parser', () => {
  describe('matchListKey', () => {
    test('matches canonical list ids', () => {
      expect(matchListKey('groceries')).toBe('groceries');
      expect(matchListKey('owen')).toBe('owen');
      expect(matchListKey("owen's")).toBe('owen');
      expect(matchListKey('ellie')).toBe('ellie');
      expect(matchListKey('christmas')).toBe('christmas-gifts-26');
      expect(matchListKey('thank-yous')).toBe('thank-yous');
      expect(matchListKey('texts')).toBe('texts-waiting');
    });

    test('matches casual phrasings', () => {
      expect(matchListKey('grocery list')).toBe('groceries');
      expect(matchListKey('xmas')).toBe('christmas-gifts-26');
      expect(matchListKey('gifts')).toBe('christmas-gifts-26');
      expect(matchListKey('thank you')).toBe('thank-yous');
    });

    test('returns null for unknown keys', () => {
      expect(matchListKey('pizza')).toBeNull();
      expect(matchListKey('')).toBeNull();
    });
  });

  describe('parseIntent', () => {
    test('parses "add X to Y" form', () => {
      const r = parseIntent('add diapers to Owen');
      expect(r.kind).toBe('addToList');
      if (r.kind === 'addToList') {
        expect(r.list).toBe('owen');
        expect(r.text).toBe('diapers');
      }
    });

    test('parses "add X to my Y list" form', () => {
      const r = parseIntent('add milk to my grocery list');
      expect(r.kind).toBe('addToList');
      if (r.kind === 'addToList') {
        expect(r.list).toBe('groceries');
        expect(r.text).toBe('milk');
      }
    });

    test('parses "put X on Y" form', () => {
      const r = parseIntent("put wipes on Owen's list");
      expect(r.kind).toBe('addToList');
      if (r.kind === 'addToList') {
        expect(r.list).toBe('owen');
        expect(r.text).toBe('wipes');
      }
    });

    test('parses "Y: X" colon form', () => {
      const r = parseIntent('groceries: oat milk, eggs');
      expect(r.kind).toBe('addToList');
      if (r.kind === 'addToList') {
        expect(r.list).toBe('groceries');
        expect(r.text).toBe('oat milk, eggs');
      }
    });

    test('parses bare "add X" as groceries by default', () => {
      const r = parseIntent('add paper towels');
      expect(r.kind).toBe('addToList');
      if (r.kind === 'addToList') {
        expect(r.list).toBe('groceries');
      }
    });

    test('parses remind-me intents', () => {
      const r = parseIntent('remind me to book pumpkin carving');
      expect(r.kind).toBe('remind');
      if (r.kind === 'remind') {
        expect(r.text).toContain('book pumpkin carving');
      }
    });

    test('parses remind-me with when clause', () => {
      const r = parseIntent('remind me to call Anna on Saturday');
      expect(r.kind).toBe('remind');
      if (r.kind === 'remind') {
        expect(r.text).toBe('call Anna');
        expect(r.when).toBe('Saturday');
      }
    });

    test('parses questions as queries', () => {
      const r = parseIntent("what's on Saturday");
      expect(r.kind).toBe('query');
    });

    test('returns unmatched for gibberish', () => {
      const r = parseIntent('xyzzy flibbertigibbet');
      expect(r.kind).toBe('unmatched');
    });

    test('returns unmatched for empty input', () => {
      expect(parseIntent('').kind).toBe('unmatched');
      expect(parseIntent('   ').kind).toBe('unmatched');
    });

    test('handles "add X to [unknown list]" gracefully', () => {
      // "add X to Y" where Y doesn't match any list should NOT match addToList pattern.
      // Falls through to "add X" bare form → defaults to groceries.
      const r = parseIntent('add cat food to pantry');
      // Neither "pantry" nor "cat food to pantry" matches; bare "add X" catches it.
      expect(r.kind).toBe('addToList');
    });
  });
});
