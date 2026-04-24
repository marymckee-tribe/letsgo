"use client";

import { useState } from "react";
import { useLifeHub } from "@/lib/life-hub/store";
import type { ThreadList } from "@/lib/life-hub/types";

function lastStamp(l: ThreadList): string {
  if (!l.lastAddedAt) return l.hint ?? "";
  const mins = Math.floor((Date.now() - l.lastAddedAt) / 60000);
  if (mins < 60) return `+${l.lastAddedCount ?? 1} · ${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `+${l.lastAddedCount ?? 1} · ${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `+${l.lastAddedCount ?? 1} · ${days}d ago`;
}

function ListRow({ l }: { l: ThreadList }) {
  const { addToList } = useLifeHub();
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState("");
  const openCount = l.items.filter(i => !i.done).length;

  return (
    <li className="border-b border-dashed border-border last:border-b-0">
      <div
        className="grid grid-cols-[1fr_auto_auto_auto] gap-3 items-center py-1.5 cursor-pointer"
        onClick={() => setExpanded(e => !e)}
      >
        <span className="font-sans text-[12.5px] text-foreground font-medium">
          {l.name}
          {l.hint && !l.lastAddedAt ? (
            <em className="font-mono not-italic text-[10.5px] text-muted-foreground ml-1">
              ({l.hint})
            </em>
          ) : null}
        </span>
        <span className="font-heading font-light text-[16px] text-foreground min-w-[22px] text-right">
          {openCount}
        </span>
        <span className="font-mono text-[9.5px] text-muted-foreground tracking-[0.04em] whitespace-nowrap">
          {lastStamp(l)}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(true);
          }}
          className="font-mono text-[9.5px] tracking-[0.08em] text-accent border border-accent/20 px-2 py-0.5 hover:bg-accent/10 hover:border-accent whitespace-nowrap"
        >
          + add
        </button>
      </div>

      {expanded && (
        <div className="pb-2 pl-0 pr-0 flex flex-col gap-1.5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!draft.trim()) return;
              addToList(l.id, draft);
              setDraft("");
            }}
            className="flex items-center gap-2 border-b border-border py-1"
          >
            <span className="font-mono text-[12px] text-accent">&rsaquo;</span>
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={`add to ${l.name.toLowerCase()}…`}
              className="flex-1 bg-transparent outline-none border-0 font-sans text-[12.5px] text-foreground placeholder:text-muted-foreground py-1"
            />
            <button
              type="submit"
              className="font-mono text-[9.5px] tracking-[0.08em] text-accent hover:text-foreground"
            >
              ↵ add
            </button>
          </form>
          <ul className="flex flex-col gap-0.5 max-h-32 overflow-y-auto">
            {l.items.slice(0, 8).map((item) => (
              <li key={item.id} className="font-sans text-[11.5px] text-foreground/75 flex gap-2">
                <span className="text-muted-foreground">·</span>
                <span>{item.text}</span>
              </li>
            ))}
            {l.items.length > 8 && (
              <li className="font-mono text-[10px] text-muted-foreground">…{l.items.length - 8} more</li>
            )}
          </ul>
        </div>
      )}
    </li>
  );
}

export function ThreadLists({ lists }: { lists: ThreadList[] }) {
  return (
    <ul className="col-span-full mt-1 border-t border-dashed border-border">
      {lists.map((l) => (
        <ListRow key={l.id} l={l} />
      ))}
    </ul>
  );
}
