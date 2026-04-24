"use client";

import { useLifeHub } from "@/lib/life-hub/store";
import { useNow } from "@/lib/life-hub/use-now";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];

function formatMonoDate(d: Date): string {
  return `${MONTHS[d.getMonth()]} ${d.getDate()} · ${d.getFullYear()}`;
}

export function TodayBand() {
  const { worthNoticing, priorities, shapes } = useLifeHub();
  const nowMs = useNow();
  // server snapshot is 0 → render placeholder server-side, real date client-side.
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
    <header className="grid grid-cols-[auto_1fr_auto] items-center gap-9 pb-4 border-b border-border">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading font-extralight text-[52px] leading-[0.95] tracking-[-0.035em] text-foreground">
          {dayName}
        </h1>
        <div className="flex gap-3.5 font-mono text-[10.5px] tracking-[0.14em] uppercase text-muted-foreground">
          <span>{dateLine || "—"}</span>
          <span className="text-foreground/20">·</span>
          <span>{timeSensitive} TIME-SENSITIVE</span>
          <span className="text-foreground/20">·</span>
          <span>{openDecisions} OPEN</span>
          <span className="text-foreground/20">·</span>
          <span>INBOX −6</span>
        </div>
      </div>

      <p className="font-serif italic text-[16px] leading-[1.4] text-foreground/80 border-l-2 border-accent pl-5 py-1 max-w-[62ch]">
        <span className="block not-italic font-sans text-[9.5px] font-bold tracking-[0.24em] uppercase text-accent mb-1">
          Worth noticing
        </span>
        {worthNoticing.note}
      </p>

      <div className="flex gap-7 items-end">
        {worthNoticing.metrics.map((m, i) => (
          <div key={i} className="text-right min-w-[70px]">
            <div className={`font-heading font-extralight text-[28px] leading-none tracking-[-0.025em] ${m.accent ? 'text-accent' : 'text-foreground'}`}>
              {m.n}
            </div>
            <div className="block font-mono text-[9.5px] tracking-[0.14em] uppercase text-muted-foreground mt-1.5">
              {m.l}
            </div>
          </div>
        ))}
      </div>
    </header>
  );
}
