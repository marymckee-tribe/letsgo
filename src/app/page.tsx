import { BrainDump } from "@/components/widgets/brain-dump";
import { CommandCenter } from "@/components/widgets/command-center";
import { Bouncer } from "@/components/widgets/bouncer";
import { DashboardCards } from "@/components/widgets/dashboard-cards";

export default function Home() {
  return (
    <main className="flex-1 min-h-screen w-full bg-background text-foreground flex flex-col">
      <h1 className="sr-only">The Hub</h1>
      {/* 80% Data Area */}
      <div className="flex-1 p-12 lg:p-24 overflow-hidden">
        <div className="mx-auto max-w-[1600px] h-full grid grid-cols-1 lg:grid-cols-12 gap-16 lg:gap-24">
          
          <div className="lg:col-span-5 flex flex-col h-full min-h-0">
            <CommandCenter className="flex-1 min-h-0" />
          </div>

          <div className="lg:col-span-4 flex flex-col h-full min-h-0">
             <Bouncer className="flex-1 min-h-0" />
          </div>
          
          <div className="lg:col-span-3 flex flex-col h-full min-h-0">
            <DashboardCards className="flex-1 min-h-0" />
          </div>

        </div>
      </div>

      {/* 20% Command Bar */}
      <div className="shrink-0 border-t border-border p-12 lg:px-24 bg-background">
        <div className="mx-auto max-w-[1600px]">
          <BrainDump />
        </div>
      </div>
    </main>
  );
}
