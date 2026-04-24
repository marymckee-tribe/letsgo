"use client";

import type {
  EndeavorShape,
  RhythmShape,
  SeasonShape,
  Shape,
  ThreadShape,
} from "@/lib/life-hub/types";
import { ThreadLists } from "./thread-lists";
import { useNow } from "@/lib/life-hub/use-now";

function daysBetween(fromMs: number, target: number): number {
  return Math.max(0, Math.ceil((target - fromMs) / (24 * 60 * 60 * 1000)));
}

function ShapeMeta({ kind, age, color }: { kind: string; age: string; color: string }) {
  return (
    <div className="col-span-full flex items-baseline justify-between gap-3.5">
      <span
        className="font-sans text-[9px] font-bold tracking-[0.24em] uppercase"
        style={{ color }}
      >
        <span
          className="inline-block w-1.5 h-1.5 mr-2 align-[1px]"
          style={{ background: color }}
        />
        {kind}
      </span>
      <span className="font-mono text-[9.5px] text-muted-foreground tracking-[0.04em]">
        {age}
      </span>
    </div>
  );
}

function ShapeTitleRow({ title, count, unit }: { title: string; count: string; unit: string }) {
  return (
    <>
      <h4 className="col-start-1 font-heading font-light text-[22px] leading-[1.1] tracking-[-0.02em] text-foreground">
        {title}
      </h4>
      <div className="col-start-2 text-right font-heading font-extralight text-[28px] leading-none tracking-[-0.03em] text-foreground whitespace-nowrap">
        {count}
        <span className="block font-mono text-[9px] font-normal tracking-[0.16em] uppercase text-muted-foreground mt-1">
          {unit}
        </span>
      </div>
    </>
  );
}

function EndeavorCard({ s }: { s: EndeavorShape }) {
  const now = useNow();
  const target = now !== 0 ? new Date(s.eventDateISO).getTime() : 0;
  const days = now !== 0 ? daysBetween(now, target) : 0;
  const weeksOpen = now !== 0 ? Math.max(1, Math.round((now - s.openedAt) / (7 * 24 * 3600 * 1000))) : 0;
  const pct = Math.round((s.bookedCount / Math.max(1, s.totalCount)) * 100);
  const $committed = s.budgetCommittedCents != null ? `$${(s.budgetCommittedCents / 100).toLocaleString()}` : undefined;
  const $total = s.budgetTotalCents != null ? `$${(s.budgetTotalCents / 100).toLocaleString()}` : undefined;
  return (
    <article className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 border border-border p-3.5 px-[18px] -mb-px hover:border-foreground/20 hover:relative hover:z-[1]">
      <ShapeMeta
        kind="Endeavor"
        color={s.accentHex}
        age={`OPENED ${weeksOpen}W AGO${$committed && $total ? ` · ${$committed} / ${$total}` : ''}`}
      />
      <ShapeTitleRow title={s.title} count={String(days)} unit="days out" />
      <p className="col-span-full font-mono text-[10.5px] leading-[1.65] text-foreground/70 tracking-[0.02em]">
        {s.bookedCount}/{s.totalCount} booked
        <span className="text-foreground/20 mx-[7px]">·</span>
        next: <span className="text-foreground font-medium">{s.nextAction}</span>
        {s.openItems && s.openItems.length > 0 ? (
          <>
            <span className="text-foreground/20 mx-[7px]">·</span>
            <span className="text-muted-foreground">{s.openItems[0]} open</span>
          </>
        ) : null}
      </p>
      <div className="col-span-full h-0.5 bg-muted mt-0.5">
        <span className="block h-full bg-foreground" style={{ width: `${pct}%` }} />
      </div>
    </article>
  );
}

function SeasonCard({ s }: { s: SeasonShape }) {
  const now = useNow();
  const target = now !== 0 ? new Date(s.nextOccurrenceISO).getTime() : 0;
  const days = now !== 0 ? daysBetween(now, target) : 0;
  return (
    <article className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 border border-border p-3.5 px-[18px] -mb-px hover:border-foreground/20 hover:relative hover:z-[1]">
      <ShapeMeta kind={`Season · Fall '26`} color={s.accentHex} age="RECURS ANNUALLY" />
      <ShapeTitleRow title={s.title} count={String(days)} unit="days" />
      <p className="col-span-full font-mono text-[10.5px] leading-[1.7] text-foreground/70 tracking-[0.02em]">
        {s.checklist.map((c, i) => (
          <span key={i}>
            {c.label.split(':')[0]}:
            <span className={c.done ? 'text-[#3a6b48] ml-1' : 'text-muted-foreground ml-1'}>
              {c.done ? '✓' : '○'}{c.due ? ` ${c.due}` : c.label.includes(':') ? ` ${c.label.split(':')[1].trim()}` : ''}
            </span>
            {i < s.checklist.length - 1 ? <span className="text-foreground/20 mx-[7px]">·</span> : null}
          </span>
        ))}
      </p>
    </article>
  );
}

function RhythmCard({ s }: { s: RhythmShape }) {
  return (
    <article className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 border border-border p-3.5 px-[18px] -mb-px hover:border-foreground/20 hover:relative hover:z-[1]">
      <ShapeMeta kind={`Rhythm · ${s.windowLabel.split(' · ')[1] ?? 'Weekend'}`} color={s.accentHex} age={s.windowLabel} />
      <ShapeTitleRow title={s.title} count={`${s.slots.length}`} unit="slots" />
      <div className="col-span-full flex flex-col gap-0.5 font-mono text-[10.5px] leading-[1.65] text-foreground/70 tracking-[0.02em]">
        {s.slots.map((slot, i) => (
          <p key={i}>
            <span className="text-foreground font-medium">{slot.label}</span>
            <span className="text-foreground/20 mx-[7px]">·</span>
            {slot.body}
          </p>
        ))}
      </div>
    </article>
  );
}

function ThreadCard({ s }: { s: ThreadShape }) {
  const total = s.lists.reduce((acc, l) => acc + l.items.filter(i => !i.done).length, 0);
  return (
    <article className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 border border-border p-3.5 px-[18px] -mb-px hover:border-foreground/20 hover:relative hover:z-[1]">
      <ShapeMeta
        kind="Thread · Lists"
        color={s.accentHex}
        age={`${s.lists.length} LISTS · ${total} ITEMS`}
      />
      <ShapeTitleRow title={s.title} count={String(total)} unit="open" />
      <ThreadLists lists={s.lists} />
    </article>
  );
}

export function ShapeCard({ shape }: { shape: Shape }) {
  switch (shape.kind) {
    case 'ENDEAVOR': return <EndeavorCard s={shape} />;
    case 'SEASON':   return <SeasonCard s={shape} />;
    case 'RHYTHM':   return <RhythmCard s={shape} />;
    case 'THREAD':   return <ThreadCard s={shape} />;
  }
}
