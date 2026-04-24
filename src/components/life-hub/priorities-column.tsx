"use client";

import { useLifeHub } from "@/lib/life-hub/store";
import { SectionKicker } from "./section-kicker";
import type { Priority } from "@/lib/life-hub/types";

function PriorityCard({ p }: { p: Priority }) {
  const { resolvePriority, snoozePriority } = useLifeHub();

  const handleAction = (label: string) => {
    if (label.toLowerCase().includes('defer') || label.toLowerCase().includes('skip')) {
      snoozePriority(p.id);
      return;
    }
    resolvePriority(p.id, label);
  };

  return (
    <article
      className={`border border-border border-l-2 border-l-accent p-4 px-5 -mb-px transition-colors hover:border-foreground/20 hover:border-l-accent bg-background ${p.snoozed ? 'opacity-50' : ''}`}
    >
      <div className="flex justify-between items-baseline gap-4 mb-0.5">
        <span className="font-sans text-[9.5px] font-bold tracking-[0.22em] uppercase text-accent">
          {p.label}
        </span>
        <span className="font-mono text-[10.5px] text-muted-foreground tracking-[0.04em]">
          {p.deadline}
        </span>
      </div>

      <h3 className="font-heading font-light text-[21px] leading-[1.2] tracking-[-0.02em] text-foreground mb-1.5">
        {p.title}
      </h3>

      <p className="font-mono text-[10.5px] text-muted-foreground tracking-[0.02em] mb-1.5">
        {p.metaRow.map((m, i) => (
          <span key={i}>
            {m.k} <span className="text-foreground">{m.v}</span>
            {i < p.metaRow.length - 1 ? <span className="text-foreground/20 mx-[7px]">·</span> : null}
          </span>
        ))}
      </p>

      <p className="font-serif italic text-[14px] leading-[1.4] text-foreground/80 border-l-2 border-border pl-3.5 py-px mb-3 max-w-[62ch]">
        {p.note}
      </p>

      <div className="flex gap-2 flex-wrap">
        {p.actions.map((a, i) => (
          <button
            key={i}
            type="button"
            onClick={() => handleAction(a.label)}
            className={
              a.kind === 'primary'
                ? "inline-flex items-center gap-2 px-3.5 py-2 font-sans text-[9.5px] font-bold tracking-[0.2em] uppercase bg-foreground text-background border border-foreground min-h-[30px] hover:bg-foreground/85 transition-colors"
                : a.kind === 'quiet'
                ? "inline-flex items-center gap-2 px-1 py-2 font-sans text-[9.5px] font-bold tracking-[0.2em] uppercase text-muted-foreground hover:text-foreground min-h-[30px] transition-colors"
                : "inline-flex items-center gap-2 px-3.5 py-2 font-sans text-[9.5px] font-bold tracking-[0.2em] uppercase bg-background text-foreground border border-border min-h-[30px] hover:bg-muted hover:border-foreground/20 transition-colors"
            }
          >
            {a.label}
          </button>
        ))}
      </div>
    </article>
  );
}

export function PrioritiesColumn() {
  const { priorities } = useLifeHub();
  const active = priorities.filter((p) => !p.snoozed);
  const snoozed = priorities.filter((p) => p.snoozed);

  return (
    <section className="flex flex-col">
      <SectionKicker num="01 /" title="What needs you" badge={`${active.length} items`} />
      <div className="flex flex-col">
        {active.length === 0 ? (
          <p className="font-serif italic text-sm text-muted-foreground border border-border p-5">
            Nothing right now. Sleep if you can.
          </p>
        ) : (
          active.map((p) => <PriorityCard key={p.id} p={p} />)
        )}
      </div>

      {snoozed.length > 0 && (
        <div className="mt-6">
          <SectionKicker num="02 /" title="Can wait" badge={`${snoozed.length} snoozed`} />
          <div className="flex flex-col">
            {snoozed.map((p) => <PriorityCard key={p.id} p={p} />)}
          </div>
        </div>
      )}
    </section>
  );
}
