"use client";

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { toast } from 'sonner';
import type {
  Shape,
  ThreadShape,
  Priority,
  WorthNoticing,
  ThreadItem,
} from './types';
import {
  seedShapes,
  seedPriorities,
  seedWorthNoticing,
} from './seed';

type LifeHubState = {
  shapes: Shape[];
  priorities: Priority[];
  worthNoticing: WorthNoticing;

  // Derived helpers
  getShapeById: (id: string) => Shape | undefined;
  getListById: (listId: string) => { shapeId: string; list: ThreadShape['lists'][number] } | undefined;

  // Actions
  addToList: (listId: string, text: string) => { ok: boolean; listName?: string };
  toggleListItem: (listId: string, itemId: string) => void;
  resolvePriority: (priorityId: string, actionLabel: string) => void;
  snoozePriority: (priorityId: string) => void;
};

const Ctx = createContext<LifeHubState | undefined>(undefined);

function matchListKey(query: string, list: { id: string; name: string }): boolean {
  const q = query.toLowerCase().trim();
  if (!q) return false;
  if (list.id.toLowerCase() === q) return true;
  if (list.name.toLowerCase() === q) return true;
  if (list.id.toLowerCase().includes(q)) return true;
  if (list.name.toLowerCase().includes(q)) return true;
  // Common aliases
  const aliases: Record<string, string[]> = {
    groceries: ['grocery', 'food', 'groceries', 'shopping'],
    owen: ['owens', "owen's", 'owen'],
    ellie: ['ellies', "ellie's", 'ellie'],
    'christmas-gifts-26': ['christmas', 'gifts', 'xmas', 'holiday'],
    'thank-yous': ['thank you', 'thank-you', 'thankyou', 'thanks'],
    'texts-waiting': ['text', 'texts', 'reply', 'replies'],
  };
  const candidates = aliases[list.id] ?? [];
  return candidates.some((a) => a === q || q.includes(a));
}

export function LifeHubProvider({ children }: { children: React.ReactNode }) {
  const [shapes, setShapes] = useState<Shape[]>(seedShapes);
  const [priorities, setPriorities] = useState<Priority[]>(seedPriorities);
  const worthNoticing = useMemo(() => seedWorthNoticing, []);

  const getShapeById = useCallback(
    (id: string) => shapes.find((s) => s.id === id),
    [shapes],
  );

  const getListById = useCallback(
    (listId: string) => {
      for (const s of shapes) {
        if (s.kind !== 'THREAD') continue;
        const hit = s.lists.find((l) => matchListKey(listId, l));
        if (hit) return { shapeId: s.id, list: hit };
      }
      return undefined;
    },
    [shapes],
  );

  const addToList = useCallback<LifeHubState['addToList']>(
    (listQuery, text) => {
      const trimmed = text.trim();
      if (!trimmed) return { ok: false };

      let matchedName: string | undefined;
      setShapes((prev) =>
        prev.map((s) => {
          if (s.kind !== 'THREAD') return s;
          return {
            ...s,
            lists: s.lists.map((l) => {
              if (!matchListKey(listQuery, l)) return l;
              matchedName = l.name;
              const newItem: ThreadItem = {
                id: `${l.id}-${Date.now()}`,
                text: trimmed,
                addedAt: Date.now(),
                done: false,
              };
              return {
                ...l,
                items: [newItem, ...l.items],
                lastAddedAt: Date.now(),
                lastAddedCount: 1,
              };
            }),
          };
        }),
      );

      if (matchedName) {
        toast(`+ ${trimmed}`, { description: `added to ${matchedName}` });
        return { ok: true, listName: matchedName };
      }

      toast('List not found', {
        description: `No list matched "${listQuery}". Try "groceries", "Owen", "Ellie", "Christmas", "thank-yous", or "texts".`,
      });
      return { ok: false };
    },
    [],
  );

  const toggleListItem = useCallback<LifeHubState['toggleListItem']>(
    (listId, itemId) => {
      setShapes((prev) =>
        prev.map((s) => {
          if (s.kind !== 'THREAD') return s;
          return {
            ...s,
            lists: s.lists.map((l) => {
              if (l.id !== listId) return l;
              return {
                ...l,
                items: l.items.map((it) =>
                  it.id !== itemId ? it : { ...it, done: !it.done },
                ),
              };
            }),
          };
        }),
      );
    },
    [],
  );

  const resolvePriority = useCallback<LifeHubState['resolvePriority']>(
    (priorityId, actionLabel) => {
      setPriorities((prev) => prev.filter((p) => p.id !== priorityId));
      toast('Resolved', { description: actionLabel });
    },
    [],
  );

  const snoozePriority = useCallback<LifeHubState['snoozePriority']>(
    (priorityId) => {
      setPriorities((prev) =>
        prev.map((p) => (p.id === priorityId ? { ...p, snoozed: true } : p)),
      );
      toast('Snoozed until tonight');
    },
    [],
  );

  const value = useMemo<LifeHubState>(
    () => ({
      shapes,
      priorities,
      worthNoticing,
      getShapeById,
      getListById,
      addToList,
      toggleListItem,
      resolvePriority,
      snoozePriority,
    }),
    [
      shapes,
      priorities,
      worthNoticing,
      getShapeById,
      getListById,
      addToList,
      toggleListItem,
      resolvePriority,
      snoozePriority,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLifeHub(): LifeHubState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useLifeHub must be used inside LifeHubProvider');
  return v;
}
