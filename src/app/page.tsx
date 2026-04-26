import { TodayBand } from "@/components/life-hub/today-band";
import { PrioritiesColumn } from "@/components/life-hub/priorities-column";
import { ShapesColumn } from "@/components/life-hub/shapes-column";
import { ChiefOfStaff } from "@/components/life-hub/chief-of-staff";

export default function Home() {
  return (
    <>
      <main className="flex-1 w-full bg-background text-foreground flex flex-col pb-[180px]">
        <h1 className="sr-only">The Hub — Life Hub home</h1>
        <div className="max-w-[1600px] w-full mx-auto px-8 pt-5 pb-4 flex flex-col gap-[18px]">
          <TodayBand />
          <div className="grid grid-cols-1 lg:grid-cols-[1.35fr_1fr] gap-9">
            <PrioritiesColumn />
            <ShapesColumn />
          </div>
        </div>
      </main>
      <ChiefOfStaff />
    </>
  );
}
