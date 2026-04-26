"use client";

import { useLifeHub } from "@/lib/life-hub/store";
import { useNow } from "@/lib/life-hub/use-now";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];

function formatMonoDate(d: Date): string {
  return `${MONTHS[d.getMonth()]} ${d.getDate()} · ${d.getFullYear()}`;
}

export function TodayBand() {
  const { priorities, shapes } = useLifeHub();
  const nowMs = useNow();
  const isClient = nowMs !== 0;
  const now = isClient ? new Date(nowMs) : null;

  const dayName = now ? `${DAYS[now.getDay()]}.` : "Today.";
  const dateLine = now ? formatMonoDate(now) : "";
  const timeSensitive = priorities.filter(p => p.deadlineUrgency === 'today' && !p.snoozed).length;
  const openDecisions = priorities.length + shapes.reduce((acc, s) => {
    if (s.kind === 'SEASON') return acc + s.checklist.filter(c => !c.done).length;
    return acc;
  }, 0);

  return (
    <header className="flex flex-col gap-1 pb-4 border-b border-border">
      <h1 className="font-heading font-extralight text-[52px] leading-[0.95] tracking-[-0.035em] text-foreground">
        {dayName}
      </h1>
      <div className="flex gap-3.5 font-mono text-[10.5px] tracking-[0.14em] uppercase text-muted-foreground">
        <span>{dateLine || "—"}</span>
        <span className="text-foreground/20">·</span>
        <span>{timeSensitive} TIME-SENSITIVE</span>
        <span className="text-foreground/20">·</span>
        <span>{openDecisions} OPEN</span>
      </div>
    </header>
  );
}
