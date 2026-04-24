export function SectionKicker({ num, title, badge }: { num: string; title: string; badge?: string }) {
  return (
    <div className="flex items-center gap-3 font-sans text-[9.5px] font-bold tracking-[0.24em] uppercase text-muted-foreground mb-3">
      <span className="font-mono text-accent font-normal tracking-normal">{num}</span>
      <span>{title}</span>
      <span className="flex-1 h-px bg-border" />
      {badge && (
        <span className="font-mono text-[10px] tracking-[0.04em] text-foreground border border-border px-2 py-0.5">
          {badge}
        </span>
      )}
    </div>
  );
}
