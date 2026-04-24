"use client";

import { useLifeHub } from "@/lib/life-hub/store";
import { SectionKicker } from "./section-kicker";
import { ShapeCard } from "./shape-card";

export function ShapesColumn() {
  const { shapes } = useLifeHub();

  return (
    <aside className="flex flex-col">
      <SectionKicker num="03 /" title="Your life" badge={`${shapes.length} active`} />
      <div className="flex flex-col">
        {shapes.map((shape) => (
          <ShapeCard key={shape.id} shape={shape} />
        ))}
      </div>
    </aside>
  );
}
