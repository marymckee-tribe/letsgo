# Feminine Palette Retheme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shift The Hub from stark black-on-white brutalism to a warmer, feminine, airy palette (Sorbet Modern) via design tokens + targeted color-class swaps, preserving all layout, typography, and logic.

**Architecture:** CSS-first Tailwind v4 theming. Update the `@theme inline` block in `globals.css` with new surface + signal tokens, drop dark mode, introduce a reusable `<SignalPill>` component, and sweep hardcoded `text-black` / `bg-black` / `border-black/…` / `#4285f4` / `#b45309` / `#cc0000` / `#000` fragments across the codebase to their token-backed equivalents.

**Tech Stack:** Next.js 16, React 19, Tailwind v4 (CSS-first), shadcn/ui, `class-variance-authority`, Firebase, Vercel AI SDK.

**Spec:** `docs/superpowers/specs/2026-04-17-feminine-palette-retheme-design.md`

---

## File Structure

### Created files
| Path | Purpose |
|---|---|
| `src/components/ui/signal-pill.tsx` | Reusable `<SignalPill variant="ai\|today\|warn\|neutral">` component replacing inline pill markup. |

### Modified files (by task)
| Task | Path | What changes |
|---|---|---|
| 1 | `src/app/globals.css` | Token values, drop dark-mode block + custom-variant |
| 2 | `src/components/ui/signal-pill.tsx` | NEW — cva variants for four pill types |
| 3 | `src/app/layout.tsx` | `<body>` classes + Toaster styling |
| 3 | `src/components/nav.tsx` | `bg-nav`, coral active link, border-border |
| 4 | `src/components/widgets/command-center.tsx` | Black-swap pass |
| 5 | `src/components/widgets/bouncer.tsx` | Black-swap + SignalPill + signal-ai accents |
| 6 | `src/components/widgets/dashboard-cards.tsx` | Black-swap + accent insight box + signal-ai AI-notes border |
| 7 | `src/components/widgets/task-schedule.tsx` | Black-swap (class + inline style) + signal-today "now" marker + remove `#4285f4` |
| 8 | `src/components/widgets/brain-dump.tsx` | Black-swap + accent assistant bubble + "◇" coral prompt mark |
| 9 | `src/app/login/page.tsx` | Black-swap pass |
| 10 | `src/app/activity/page.tsx` | Black-swap pass |
| 10 | `src/app/settings/page.tsx` | Black-swap pass |
| 10 | `src/app/planner/page.tsx` | Black-swap pass |
| 10 | `src/app/inbox/page.tsx` | Black-swap pass |
| 10 | `src/app/life/page.tsx` | Black-swap pass |
| 10 | `src/app/calendar/page.tsx` | Black-swap pass |
| 11 | `.impeccable.md` | Palette section + remove dark-mode paragraph |
| 12 | — | Final static sweep + commit any stragglers |

### Canonical swap patterns (reference for pages + widgets)
Use these patterns during the sweep tasks. Apply top-to-bottom — the first match wins.

| Find | Replace with | Notes |
|---|---|---|
| `text-black/40` | `text-foreground/40` | |
| `text-black/60` | `text-muted-foreground` | |
| `text-black/80` | `text-foreground/80` | |
| `text-black/20` | `text-foreground/20` | |
| `text-black/25` | `text-foreground/25` | |
| `text-black/35` | `text-foreground/35` | |
| `text-black\b` | `text-foreground` | word boundary prevents matching `text-black/40` |
| `bg-black/5` | `bg-muted` | |
| `bg-black/80` | `bg-foreground/80` | hover variant |
| `bg-black\b` | `bg-foreground` | word boundary |
| `border-black/5` | `border-border/50` | |
| `border-black/6` | `border-border/60` | |
| `border-black/8` | `border-border` | |
| `border-black/10` | `border-border` | |
| `border-black/20` | `border-border` | |
| `border-black\b` | `border-foreground` | word boundary |
| `hover:border-black/20` | `hover:border-border` | |
| `hover:border-black/10` | `hover:border-border` | |
| `hover:bg-black/5` | `hover:bg-muted` | |
| `hover:bg-black/80` | `hover:bg-foreground/80` | |
| `hover:text-black` | `hover:text-foreground` | |
| `text-[#4285f4]` | `text-signal-ai` | |
| `#4285f4` (bare) | decide per call-site — `signal-ai` for AI content, `signal-today` for temporal highlights | |
| `#b45309` (bare) | `var(--color-signal-warn)` | |
| `#cc0000` (bare) | `var(--color-signal-warn)` | |

Anything else is an exception worth calling out in review.

---

## Task 1: Update design tokens and drop dark mode

**Files:**
- Modify: `src/app/globals.css` (complete rewrite — file is 54 lines)

- [ ] **Step 1: Replace `src/app/globals.css` with the new token block**

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";

@theme inline {
  /* Surface */
  --color-background: #ffffff;
  --color-foreground: #1a1a1a;
  --color-card: #ffffff;
  --color-card-foreground: #1a1a1a;
  --color-popover: #ffffff;
  --color-popover-foreground: #1a1a1a;
  --color-primary: #1a1a1a;
  --color-primary-foreground: #ffffff;
  --color-muted: color-mix(in srgb, black 5%, transparent);
  --color-muted-foreground: color-mix(in srgb, black 60%, transparent);
  --color-border: color-mix(in srgb, black 8%, transparent);
  --color-input: color-mix(in srgb, black 8%, transparent);
  --color-ring: #1a1a1a;
  --color-destructive: #b45309;
  --color-destructive-foreground: #ffffff;

  /* Blush chrome */
  --color-nav: #fff9f9;

  /* Accents + signals */
  --color-accent: #d65a6b;
  --color-accent-foreground: #ffffff;
  --color-signal-ai: #d65a6b;
  --color-signal-ai-foreground: #ffffff;
  --color-signal-today: #ffe566;
  --color-signal-today-foreground: #1a1a1a;
  --color-signal-warn: #b45309;
  --color-signal-warn-foreground: #ffffff;

  /* Type + radius */
  --font-sans: var(--font-dm-sans);
  --font-heading: var(--font-jost);
  --font-serif: "Cormorant Garamond", Georgia, serif;
  --radius-sm: 0px;
  --radius-md: 0px;
  --radius-lg: 0px;
  --radius-xl: 0px;
  --radius: 0px;
}

@layer base {
  * {
    @apply border-border outline-ring/50 shadow-none;
  }
  body {
    @apply bg-background text-foreground font-sans;
  }
  h1, h2, h3, h4, h5, h6 {
    @apply font-heading tracking-tight;
  }
}
```

Note: the `@custom-variant dark`, `:root`, and `.dark` blocks are gone. They were dead code (ThemeProvider has `enableSystem={false}` + `defaultTheme="light"`).

- [ ] **Step 2: Start the dev server**

Run: `npm run dev`
Expected: Next.js dev server starts on `http://localhost:3000`. No compile errors from globals.css.

- [ ] **Step 3: Visual check — nav + body**

Open `http://localhost:3000`. After login:
- Body background should still be white (tokens resolve to `#ffffff`).
- Text will still mostly read black because widgets hardcode `text-black` — the tokens aren't wired into those classes yet. That's expected; later tasks fix it.
- No error overlay. If compile fails on a `bg-muted` or `border-border` usage, a component is referencing a token that Tailwind v4 hasn't registered — investigate before continuing.

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(theme): rewrite design tokens for sorbet modern palette

- Soften foreground from #000 to #1a1a1a (warm charcoal)
- Add nav, accent, signal-ai, signal-today, signal-warn tokens
- Drop @custom-variant dark and :root/.dark blocks (dead code)
- Promote --font-serif (Cormorant Garamond) to explicit token"
```

---

## Task 2: Create the SignalPill component

**Files:**
- Create: `src/components/ui/signal-pill.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/ui/signal-pill.tsx`:

```tsx
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const signalPillVariants = cva(
  "inline-block font-mono text-[9px] tracking-[0.22em] uppercase font-bold px-2 py-0.5 whitespace-nowrap",
  {
    variants: {
      variant: {
        ai:      "bg-signal-ai text-signal-ai-foreground",
        today:   "bg-signal-today text-signal-today-foreground",
        warn:    "bg-signal-warn text-signal-warn-foreground",
        neutral: "border border-foreground text-foreground bg-transparent",
      },
    },
    defaultVariants: { variant: "neutral" },
  }
)

export type SignalPillProps =
  React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof signalPillVariants>

export function SignalPill({ variant, className, children, ...props }: SignalPillProps) {
  return (
    <span className={cn(signalPillVariants({ variant }), className)} {...props}>
      {children}
    </span>
  )
}
```

- [ ] **Step 2: Verify it compiles**

With dev server running, import and render a `<SignalPill variant="ai">AI</SignalPill>` anywhere temporarily (e.g., top of `src/app/page.tsx`), confirm it renders coral, then remove the test render.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/signal-pill.tsx
git commit -m "feat(ui): add SignalPill component with ai/today/warn/neutral variants"
```

---

## Task 3: Retheme layout + nav

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `src/components/nav.tsx`

- [ ] **Step 1: Update `src/app/layout.tsx` body + Toaster**

Find line 32:
```tsx
<body className="min-h-full flex flex-col bg-white text-black font-sans">
```
Replace with:
```tsx
<body className="min-h-full flex flex-col bg-background text-foreground font-sans">
```

Find the Toaster line (43):
```tsx
<Toaster position="bottom-right" toastOptions={{ className: "border-0 shadow-none rounded-none bg-black text-white px-6 py-4 font-mono uppercase tracking-widest text-xs" }} />
```
Replace with:
```tsx
<Toaster position="bottom-right" toastOptions={{ className: "border-0 shadow-none rounded-none bg-foreground text-background px-6 py-4 font-mono uppercase tracking-widest text-xs" }} />
```

- [ ] **Step 2: Update `src/components/nav.tsx`**

Replace the entire file contents with:

```tsx
"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

export function MainNav() {
  const pathname = usePathname()

  if (pathname === "/login") return null

  const links = [
    { href: "/", label: "Hub" },
    { href: "/calendar", label: "Calendar" },
    { href: "/planner", label: "Planner" },
    { href: "/inbox", label: "Inbox" },
    { href: "/life", label: "Life" },
    { href: "/activity", label: "Activity" },
    { href: "/settings", label: "Settings" },
  ]

  return (
    <header className="border-b border-border shrink-0 bg-nav">
      <div className="mx-auto max-w-[1600px] px-12 lg:px-24 h-24 flex items-center justify-between">
        <div className="font-heading text-2xl tracking-tighter font-medium text-foreground">THE HUB</div>
        <nav className="flex items-center gap-12">
          {links.map((link) => {
            const isActive = pathname === link.href
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`text-xs uppercase tracking-[0.2em] transition-colors ${
                  isActive
                    ? "text-accent font-medium border-b border-accent pb-1"
                    : "text-foreground/40 hover:text-foreground/80 pb-1"
                }`}
              >
                {link.label}
              </Link>
            )
          })}
        </nav>
      </div>
    </header>
  )
}
```

- [ ] **Step 3: Visual check**

With dev server running, navigate to `/`, `/calendar`, `/planner`:
- Header background is a subtle blush (`#fff9f9`).
- Active link is warm coral (`#d65a6b`) with a coral underline.
- Inactive links are muted charcoal.
- `/login` should still render without the header (conditional unchanged).

- [ ] **Step 4: Commit**

```bash
git add src/app/layout.tsx src/components/nav.tsx
git commit -m "feat(theme): retheme nav + layout chrome to blush wash + coral active"
```

---

## Task 4: Retheme CommandCenter widget

**Files:**
- Modify: `src/components/widgets/command-center.tsx`

- [ ] **Step 1: Apply swap patterns**

Replace the return block (lines 35-59) of `command-center.tsx` with:

```tsx
  return (
    <div className={`flex flex-col h-full ${className}`}>
      <div className="flex justify-between items-baseline mb-8">
        <h2 className="font-heading text-4xl font-light tracking-tighter text-foreground">Activity Flow</h2>
        <button onClick={signOut} className="text-foreground/40 hover:text-foreground transition-colors text-[10px] uppercase font-bold tracking-widest border border-transparent hover:border-border px-2 py-1">Disconnect</button>
      </div>
      <div className="flex-1 relative border-l border-border p-0">
        <ScrollArea className="h-full w-full absolute inset-0 pl-8">
          <div className="space-y-12 pr-4">
            {logs.length === 0 ? (
               <p className="text-foreground/40 text-sm italic font-serif">Awaiting system activity...</p>
            ) : (
               logs.map((log) => (
                 <div key={log.id} className="flex flex-col gap-1">
                   <p className="text-muted-foreground text-xs font-medium uppercase tracking-widest tabular-nums">
                     {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                   </p>
                   <p className="text-lg font-light text-foreground">{log.message}</p>
                 </div>
               ))
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
```

- [ ] **Step 2: Visual check**

Navigate to `/` — the Activity Flow column should still render identically; if Firestore has logs, they render in warm charcoal on white. The `Disconnect` button hover should show a `border-border` outline, not pure black.

- [ ] **Step 3: Commit**

```bash
git add src/components/widgets/command-center.tsx
git commit -m "refactor(widget): swap CommandCenter hardcoded black to theme tokens"
```

---

## Task 5: Retheme Bouncer widget

**Files:**
- Modify: `src/components/widgets/bouncer.tsx`

- [ ] **Step 1: Import SignalPill at the top**

Insert after the existing imports (around line 5):
```tsx
import { SignalPill } from "@/components/ui/signal-pill"
```

- [ ] **Step 2: Replace the entire return block (lines 11-76)**

```tsx
  return (
    <div className={`flex flex-col h-full ${className}`}>
      <div className="flex items-end justify-between mb-8">
        <h2 className="font-heading text-4xl font-light tracking-tighter text-foreground">Inbox</h2>
        <span className="text-muted-foreground text-xs uppercase tracking-widest pb-1">3 Accounts Active</span>
      </div>

      <div className="flex-1 overflow-y-auto space-y-6 pr-4">
        <Accordion className="w-full">
           {emails.length === 0 ? (
              <p className="text-foreground/40 text-sm italic font-serif">Inbox zero achieved.</p>
           ) : emails.map(email => (
             <AccordionItem key={email.id} value={email.id} className="border border-border px-6 bg-card data-[state=open]:border-foreground transition-colors mb-4 group">
               <AccordionTrigger className="hover:no-underline py-6">
                  <div className="flex flex-col gap-2 text-left w-full">
                    <div className="flex items-center justify-between w-full">
                      <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground group-data-[state=open]:text-foreground">From: {email.sender}</span>
                      <span className="text-foreground/40 text-xs font-normal">Unread</span>
                    </div>
                    <div className="flex items-center justify-between w-full pr-4">
                      <h3 className="text-xl font-normal tracking-tight text-foreground truncate pr-4">{email.subject}</h3>
                      <SignalPill variant="neutral">[INBOX]</SignalPill>
                    </div>
                  </div>
               </AccordionTrigger>
               <AccordionContent className="pb-6">
                 <div className="pl-0 pt-4 border-t border-border">
                   <p className="text-sm text-foreground/80 leading-relaxed mb-6 font-serif italic border-l-2 border-border pl-4 py-1">
                     "{email.snippet}"
                   </p>

                   {email.suggestedActions && email.suggestedActions.length > 0 && (
                     <div className="flex flex-col gap-3 mt-8">
                       <span className="text-[10px] uppercase font-bold tracking-widest text-signal-ai mb-2">Pending AI Actions</span>
                       {email.suggestedActions.map(action => (
                         <div key={action.id} className={`flex items-center justify-between bg-signal-ai/8 p-4 border border-signal-ai/20 transition-opacity ${action.status !== 'PENDING' ? 'opacity-40 grayscale' : ''}`}>
                           <div className="flex flex-col gap-1">
                             <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{action.type.replace('_', ' ')}</span>
                             <span className="text-sm font-sans tracking-tight text-foreground font-medium">{action.title}</span>
                             {(action.date || action.time) && (
                               <span className="text-xs font-mono text-muted-foreground mt-1">{action.time} • Day {action.date}</span>
                             )}
                           </div>

                           {action.status === 'PENDING' ? (
                             <div className="flex flex-col gap-2 shrink-0 ml-4">
                               <button onClick={(e) => { e.preventDefault(); actOnEmailAction(email.id, action.id) }} className="bg-foreground text-background px-5 py-2 text-[10px] uppercase font-bold tracking-widest hover:bg-foreground/80 transition-colors w-full">Act</button>
                               <button onClick={(e) => { e.preventDefault(); dismissEmailAction(email.id, action.id) }} className="border bg-background border-border px-5 py-2 text-[10px] uppercase font-bold tracking-widest hover:bg-muted transition-colors w-full">Dismiss</button>
                             </div>
                           ) : (
                             <span className="text-[10px] font-bold tracking-widest uppercase border border-border px-3 py-1 bg-background">{action.status}</span>
                           )}
                         </div>
                       ))}
                     </div>
                   )}
                 </div>
               </AccordionContent>
             </AccordionItem>
           ))}
        </Accordion>
      </div>
    </div>
  )
```

Key changes from the original:
- `[INBOX]` inline border div → `<SignalPill variant="neutral">`
- "Pending AI Actions" label now `text-signal-ai` (semantic — this is AI content)
- AI action block background + border now `bg-signal-ai/8` + `border-signal-ai/20` (soft coral wash)
- Act/Dismiss buttons use token equivalents

- [ ] **Step 3: Visual check**

Navigate to `/` and expand an email in the Inbox column:
- `[INBOX]` pill is black-bordered, same shape as before.
- "Pending AI Actions" label is coral.
- Each AI action card has a faint coral wash and coral-tinted border — reads clearly as "AI-suggested."
- Act button is warm charcoal (`#1a1a1a`), not pure black.

- [ ] **Step 4: Commit**

```bash
git add src/components/widgets/bouncer.tsx
git commit -m "refactor(widget): retheme Bouncer with SignalPill + coral AI accents"
```

---

## Task 6: Retheme DashboardCards widget

**Files:**
- Modify: `src/components/widgets/dashboard-cards.tsx`

- [ ] **Step 1: Replace the entire return block (lines 9-120)**

```tsx
  return (
    <div className={`flex flex-col gap-12 h-full ${className}`}>

      {/* Upcoming Events */}
      <div className="flex-1 flex flex-col min-h-0">
        <h2 className="font-heading text-2xl font-light tracking-tight mb-6 text-foreground">Schedule</h2>

        {scheduleInsights && scheduleInsights.length > 0 && (
          <div className="mb-6 bg-accent/8 border-l-2 border-accent p-4 rounded-none">
            <span className="text-accent text-[10px] font-bold uppercase tracking-widest block mb-2">Schedule Intelligence</span>
            <ul className="space-y-2">
              {scheduleInsights.map((insight, idx) => (
                <li key={idx} className="text-sm font-serif italic text-foreground/80 leading-tight">"{insight}"</li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex-1 overflow-y-auto w-full border-t border-border pt-6 space-y-4">
           {events.length === 0 ? (
              <p className="text-foreground/40 text-sm italic font-serif">No schedule blocks remaining today.</p>
           ) : events.map((event) => (
            <Sheet key={event.id}>
              <SheetTrigger className="w-full text-left">
                 <div className="flex justify-between items-start group cursor-pointer border-b border-transparent hover:border-border pb-1 transition-colors">
                   <div className="flex flex-col">
                     <span className="text-foreground text-sm group-hover:underline decoration-1 underline-offset-4">{event.title}</span>
                     {event.aiTravelBuffer && <span className="text-[10px] uppercase font-bold tracking-widest text-foreground/40 mt-1">[{event.aiTravelBuffer}]</span>}
                   </div>
                   <span className="text-muted-foreground text-xs tabular-nums mt-0.5">{event.time}</span>
                 </div>
              </SheetTrigger>
              <SheetContent side="right" className="w-[400px] sm:w-[540px] border-l border-border bg-background p-12 shadow-none sm:max-w-none text-foreground">
                <SheetHeader className="mb-12 flex flex-col items-start gap-4">
                  <span className="text-foreground bg-muted px-3 py-1 font-mono text-xs tracking-widest uppercase">{event.time}</span>
                  <SheetTitle className="font-heading text-4xl font-light tracking-tighter text-foreground">{event.title}</SheetTitle>
                  <SheetDescription className="text-muted-foreground text-base">
                    {event.location && event.location !== "TBD" ? `Location: ${event.location}` : "Synced from Google Calendar integration."}
                  </SheetDescription>
                </SheetHeader>
                <div className="space-y-8">
                  <div>
                    <h3 className="text-xs uppercase tracking-widest font-semibold text-foreground/40 mb-4">Event Context</h3>
                    <div className="space-y-4 text-foreground text-sm">
                       <p className="flex items-center gap-4"><span className="w-1.5 h-1.5 bg-foreground shrink-0" /><span>Travel Estimate: {event.aiTravelBuffer || "None"}</span></p>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-xs uppercase tracking-widest font-semibold text-foreground/40 mb-4">AI Prep Notes</h3>
                    <p className="border-l-2 border-signal-ai/30 pl-4 py-1 text-foreground/80 font-serif italic text-sm">
                      {event.aiPrepSuggestion ? `"${event.aiPrepSuggestion}"` : '"Routine schedule block. No executive briefing required."'}
                    </p>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
           ))}
        </div>
      </div>

      {/* To-Do List */}
      <div className="flex-1 flex flex-col min-h-0">
        <h2 className="font-heading text-2xl font-light tracking-tight mb-6 text-foreground">Tasks</h2>
        <div className="flex-1 overflow-y-auto border-t border-border pt-6 space-y-4 pr-4">

          {tasks.length === 0 ? (
             <p className="text-foreground/40 text-sm italic font-serif">All clear. No pending tasks.</p>
          ) : tasks.map((task) => (
            <Sheet key={task.id}>
              <SheetTrigger className="w-full text-left">
                <div className="flex flex-col gap-2 cursor-pointer group">
                  <div className="flex items-start justify-between">
                    <span onClick={() => toggleTask(task.id)} className={`text-lg group-hover:underline decoration-1 underline-offset-4 ${task.completed ? "line-through text-foreground/40" : "text-foreground"}`}>{task.title}</span>
                    <span className="border border-foreground px-2 py-0.5 text-[10px] font-bold tracking-widest uppercase">[{task.context}]</span>
                  </div>
                  <p className="text-muted-foreground text-sm line-clamp-1">Action required.</p>
                </div>
              </SheetTrigger>
              <SheetContent side="right" className="w-[400px] sm:w-[540px] border-l border-border bg-background p-12 shadow-none sm:max-w-none text-foreground">
                <SheetHeader className="mb-12">
                  <SheetTitle className="font-heading text-4xl font-light tracking-tighter text-foreground">{task.title}</SheetTitle>
                  <SheetDescription className="text-muted-foreground pt-4 text-base">
                    Associated contexts: <span className="text-foreground border border-border px-2 py-0.5 text-xs font-bold uppercase tracking-widest ml-2">[{task.context}]</span>
                  </SheetDescription>
                </SheetHeader>
                <div className="space-y-8">
                  <p className="text-sm uppercase tracking-widest font-semibold text-foreground/40">Status: {task.completed ? "COMPLETED" : "PENDING"}</p>
                </div>
              </SheetContent>
            </Sheet>
          ))}

        </div>
      </div>

      {/* Groceries */}
      <div className="flex-1 flex flex-col min-h-0">
        <h2 className="font-heading text-2xl font-light tracking-tight mb-6 text-foreground">Provisions</h2>
        <div className="flex-1 overflow-y-auto border-t border-border pt-6 space-y-4">
          {groceries.length === 0 ? (
             <p className="text-foreground/40 text-sm italic font-serif">Inventory is fully stocked.</p>
          ) : groceries.map((item) => (
             <div key={item.id} className="flex items-center gap-4">
               <div className="w-1.5 h-1.5 bg-foreground shrink-0" />
               <span className="text-foreground text-sm uppercase tracking-widest font-medium">{item.name}</span>
             </div>
          ))}
        </div>
      </div>

    </div>
  )
```

- [ ] **Step 2: Visual check**

Navigate to `/`. In the right column:
- "Schedule" header in warm charcoal.
- Schedule Intelligence insight box: faint coral wash (`bg-accent/8`), coral left border, coral uppercase label.
- Event list hover underline still appears.
- Open an event Sheet (click on an event) — its left border is `border-border`, not pure black. AI Prep Notes section has a coral left-border (`border-signal-ai/30`).

- [ ] **Step 3: Commit**

```bash
git add src/components/widgets/dashboard-cards.tsx
git commit -m "refactor(widget): retheme DashboardCards with coral insight + signal-ai AI notes"
```

---

## Task 7: Retheme TaskSchedule widget

**Files:**
- Modify: `src/components/widgets/task-schedule.tsx`

This file uses both Tailwind classes AND inline `style={{}}` objects with hardcoded `"black"` / `"rgba(0,0,0,…)"` values. Both need updating.

- [ ] **Step 1: Replace the return block (lines 40-201)**

```tsx
  return (
    <div className={`flex flex-col h-full ${className ?? ""}`} style={{ fontFamily: "var(--font-dm-sans, system-ui)" }}>

      {/* Tasks */}
      <div className="flex-1 flex flex-col min-h-0">
        <h2
          className="text-4xl font-light tracking-tight text-foreground mb-8 shrink-0"
          style={{ fontFamily: "var(--font-jost, sans-serif)" }}
        >
          Tasks
        </h2>

        {allDone ? (
          <div className="flex-1 flex flex-col">
            <p className="text-2xl font-serif italic text-foreground/20 leading-relaxed">All clear.</p>
            <button
              onClick={() => setShowCompleted(s => !s)}
              className="text-[10px] uppercase tracking-[0.2em] text-foreground/20 font-bold mt-4 hover:text-foreground/40 transition-colors text-left"
            >
              {showCompleted ? "Hide" : "Show"} completed ({doneTasks.length})
            </button>
            {showCompleted && (
              <div className="mt-4 space-y-1 opacity-25 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
                {doneTasks.map(task => (
                  <div key={task.id} className="flex items-start gap-3 py-2">
                    <div className="shrink-0 mt-0.5 w-4 h-4 bg-foreground flex items-center justify-center">
                      <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                        <path d="M1 3L3 5L7 1" stroke="currentColor" className="text-background" strokeWidth="1.5" strokeLinecap="square" />
                      </svg>
                    </div>
                    <p className="text-sm text-foreground line-through leading-snug">{task.title}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-1 pr-1" style={{ scrollbarWidth: "none" }}>
            {pendingTasks.map(task => {
              const isAnimating = completing.has(task.id)
              return (
                <div
                  key={task.id}
                  className="flex items-start gap-3 py-2.5"
                  style={{ opacity: isAnimating ? 0.3 : 1, transition: "opacity 0.3s ease" }}
                >
                  <button
                    onClick={() => !isAnimating && completeTask(task.id, task.title)}
                    className={`shrink-0 mt-0.5 w-4 h-4 border flex items-center justify-center transition-all ${
                      isAnimating
                        ? "bg-foreground border-foreground"
                        : "bg-background border-border"
                    }`}
                  >
                    {isAnimating && (
                      <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                        <path d="M1 3L3 5L7 1" stroke="currentColor" className="text-background" strokeWidth="1.5" strokeLinecap="square" />
                      </svg>
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm leading-snug transition-colors ${
                        isAnimating ? "line-through text-foreground/30" : "text-foreground"
                      }`}
                    >
                      {task.title}
                    </p>
                    {task.who && (
                      <p className="text-[10px] text-signal-ai font-bold uppercase tracking-[0.15em] mt-0.5">{task.who}</p>
                    )}
                  </div>
                </div>
              )
            })}

            {doneTasks.length > 0 && (
              <div className="pt-4 mt-2 border-t border-border/60 space-y-1">
                {doneTasks.map(task => (
                  <div key={task.id} className="flex items-start gap-3 py-2 opacity-25">
                    <div className="shrink-0 mt-0.5 w-4 h-4 bg-foreground flex items-center justify-center">
                      <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                        <path d="M1 3L3 5L7 1" stroke="currentColor" className="text-background" strokeWidth="1.5" strokeLinecap="square" />
                      </svg>
                    </div>
                    <p className="text-sm text-foreground line-through leading-snug">{task.title}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Provisions */}
      {groceries.length > 0 && (
        <div className="shrink-0 pt-5 border-t border-border pt-5 mt-5">
          <p className="text-[10px] uppercase tracking-[0.25em] text-foreground/25 font-bold mb-3">Provisions</p>
          <div className="space-y-1">
            {groceries.slice(0, 6).map(item => (
              <div
                key={item.id}
                className="flex items-center gap-2.5 py-1 cursor-pointer group"
                onClick={() => toggleGrocery(item.id)}
              >
                <div
                  className={`shrink-0 w-3.5 h-3.5 border flex items-center justify-center transition-all ${
                    item.checked
                      ? "bg-foreground border-foreground"
                      : "bg-background border-border"
                  }`}
                >
                  {item.checked && (
                    <svg width="7" height="5" viewBox="0 0 7 5" fill="none">
                      <path d="M1 2.5L2.5 4L6 1" stroke="currentColor" className="text-background" strokeWidth="1.5" strokeLinecap="square" />
                    </svg>
                  )}
                </div>
                <span
                  className={`text-xs ${
                    item.checked
                      ? "line-through text-foreground/25"
                      : "text-muted-foreground"
                  }`}
                >
                  {item.name}
                </span>
              </div>
            ))}
            {groceries.length > 6 && (
              <p className="text-[10px] text-foreground/25 pl-6">+{groceries.length - 6} more</p>
            )}
          </div>
        </div>
      )}

      {/* Schedule strip */}
      <div className="shrink-0 pt-6 border-t border-border mt-6">
        <p className="text-[10px] uppercase tracking-[0.25em] text-foreground/25 font-bold mb-4">Schedule</p>
        <div className="space-y-0">
          {scheduleItems.slice(0, 6).map((item, i) => (
            <div
              key={i}
              className={`flex items-baseline gap-3 py-2 border-b border-border/50 last:border-0 ${item.isPast ? "opacity-20" : ""}`}
            >
              <span className="text-[10px] font-mono text-foreground/35 w-10 shrink-0">{item.time}</span>
              <span className={`text-xs flex-1 truncate ${item.isNow ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                {item.title}
              </span>
              {item.isNow && (
                <span className="text-[8px] uppercase font-bold tracking-widest text-signal-today-foreground bg-signal-today px-1.5 py-0.5 shrink-0">now</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
```

Key changes from the original:
- All `text-black*`, `bg-black*`, `border-black/[0-9]` classes swapped per the pattern table.
- Inline `style={{ backgroundColor: "black", borderColor: "rgba(0,0,0,0.2)" }}` converted to conditional Tailwind class names (`bg-foreground border-foreground` / `bg-background border-border`).
- Inline `style={{ color: "rgba(0,0,0,0.3)" }}` etc. converted to `text-foreground/30` / `text-muted-foreground`.
- SVG check-mark stroke changed from `stroke="white"` to `stroke="currentColor"` + `className="text-background"` so the check stays visible if foreground/background ever drift.
- "who" assignment tag hex `#4285f4` → `text-signal-ai` (family-member tag, treated as AI-metadata per the spec; if it reads wrong, we can revisit in a follow-up).
- "now" marker: hex `#4285f4` text → filled `bg-signal-today text-signal-today-foreground` pill. This elevates "now" into a proper TODAY signal.

- [ ] **Step 2: Visual check**

TaskSchedule isn't wired into `page.tsx` (the main page uses `DashboardCards`, not this one — but the file does exist). Find a page that renders `<TaskSchedule />` — search for its import:

Run: `rg -l "TaskSchedule" src/`

If it's not currently rendered anywhere, confirm with the user that the widget is still desired. If it is rendered, navigate to that route and verify:
- Checkbox is a `border-border` outline → fills with `bg-foreground` when checked.
- "who" family tag reads in coral.
- "now" marker is an acid-yellow filled pill.

- [ ] **Step 3: Commit**

```bash
git add src/components/widgets/task-schedule.tsx
git commit -m "refactor(widget): retheme TaskSchedule tokens + signal-today 'now' pill"
```

---

## Task 8: Retheme BrainDump widget

**Files:**
- Modify: `src/components/widgets/brain-dump.tsx`

**Note:** this file has `// @ts-nocheck` on line 1 — keep it.

- [ ] **Step 1: Replace the return block (lines 86-131)**

```tsx
  return (
    <div className={`flex flex-col gap-4 relative bg-background px-8 py-6 -mx-8 sm:mx-0 sm:px-0 sm:py-0 transition-all ${className}`}>
      <div className="flex justify-between items-center cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
        <h2 className="font-heading text-lg font-light tracking-tight text-foreground flex items-center gap-4">
          <span className="text-accent">◇</span>
          Terminal
          {messages.length > 0 && !isExpanded && (
             <span className="text-foreground/40 text-[10px] uppercase font-mono tracking-widest leading-none mt-1 line-clamp-1">
               {messages[messages.length - 1].role === 'assistant' ? messages[messages.length - 1].content : "Processing..."}
             </span>
          )}
        </h2>
        <button className="text-foreground/20 hover:text-foreground transition-colors shrink-0">
          {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
        </button>
      </div>

      {isExpanded && messages.length > 0 && (
        <div ref={scrollRef} className="flex flex-col gap-6 max-h-[50vh] overflow-y-auto py-8 border-b border-border/50 mb-2 pr-4 scroll-smooth">
          {messages.map((m, i) => {
            const displayStr = m.content.replace(/```json\n\[[\s\S]*?\]\n```/g, '').trim();
            if (!displayStr) return null;

            return (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] sm:max-w-[70%] p-5 text-sm leading-relaxed ${m.role === 'user' ? 'bg-muted text-foreground' : 'bg-transparent border-l-2 border-accent pl-6 text-foreground/80 font-serif'}`}>
                  {displayStr}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <form className="flex gap-4 items-center" onSubmit={onSubmit}>
        <Input
          value={localInput}
          onChange={(e) => setLocalInput(e.target.value)}
          placeholder={isExpanded ? "Message Chief of Staff..." : "Awaiting directive..."}
          className="flex-1 border-0 border-b border-border rounded-none px-0 text-lg bg-transparent focus-visible:ring-0 focus-visible:border-foreground transition-colors shadow-none"
        />
        <Button type="submit" size="icon" className="rounded-none bg-foreground text-background hover:bg-foreground/80 w-12 h-12 shadow-none border-0 shrink-0">
          <Send className="w-5 h-5" />
        </Button>
      </form>
    </div>
  )
```

Key changes:
- Added a coral `◇` mark before "Terminal" (the system-voice accent).
- Assistant message bubble border-left changed from `border-black` to `border-accent` — AI responses now carry a coral bar.
- User message bubble `bg-black/5` → `bg-muted`.
- Send button `bg-black text-white` → `bg-foreground text-background`.

- [ ] **Step 2: Visual check**

Navigate to `/`. At the bottom command bar:
- The "◇ Terminal" header shows a coral diamond before the word.
- Send a chat message — your user bubble renders in a light-gray fill; the assistant's response renders with a coral left border.

- [ ] **Step 3: Commit**

```bash
git add src/components/widgets/brain-dump.tsx
git commit -m "refactor(widget): retheme BrainDump with coral prompt mark + coral assistant bubble"
```

---

## Task 9: Retheme login page

**Files:**
- Modify: `src/app/login/page.tsx`

- [ ] **Step 1: Replace the file contents**

```tsx
"use client"

import { useAuth } from "@/lib/auth-provider"
import { Button } from "@/components/ui/button"

export default function LoginPage() {
  const { signIn, loading } = useAuth()

  return (
    <main className="flex-1 w-full h-full min-h-screen bg-background text-foreground flex flex-col items-center justify-center overflow-hidden p-6 absolute inset-0 z-50">
      <div className="w-full max-w-sm flex flex-col gap-16 items-center">
        <div className="flex flex-col items-center text-center gap-4">
           <h1 className="font-heading text-6xl tracking-tighter">THE HUB</h1>
           <p className="text-foreground/40 text-xs font-medium uppercase tracking-[0.3em]">Chief of Staff Interface</p>
        </div>

        <Button
          onClick={signIn}
          disabled={loading}
          className="w-full border border-foreground bg-foreground text-background hover:bg-foreground/80 hover:text-background rounded-none py-6 uppercase tracking-widest text-xs font-semibold shadow-none transition-colors"
        >
          {loading ? "Authenticating..." : "[ Authenticate ]"}
        </Button>
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Visual check**

Sign out and navigate to `/login`:
- White background, no nav (header hidden for `/login`).
- "THE HUB" heading + "Chief of Staff Interface" label in warm charcoal.
- Authenticate button is warm-charcoal fill with white text, softens slightly on hover.

- [ ] **Step 3: Commit**

```bash
git add src/app/login/page.tsx
git commit -m "refactor(page): retheme login page to theme tokens"
```

---

## Task 10: Retheme remaining sub-pages

**Files:**
- Modify: `src/app/activity/page.tsx`
- Modify: `src/app/settings/page.tsx`
- Modify: `src/app/planner/page.tsx`
- Modify: `src/app/inbox/page.tsx`
- Modify: `src/app/life/page.tsx`
- Modify: `src/app/calendar/page.tsx`

**Strategy:** one commit per page. For each page, repeat steps 1-4 below. The swap is mechanical; the pattern table at the top of this plan is the source of truth.

Pages to sweep, in order of ascending size (smallest first, to build momentum):

| Order | Path | Lines |
|---|---|---|
| 1 | `activity/page.tsx` | 86 |
| 2 | `settings/page.tsx` | 101 |
| 3 | `planner/page.tsx` | 138 |
| 4 | `inbox/page.tsx` | 147 |
| 5 | `life/page.tsx` | 156 |
| 6 | `calendar/page.tsx` | 317 |

- [ ] **Step 1: Read the page**

Run (example): `cat src/app/activity/page.tsx`

- [ ] **Step 2: List remaining matches for that page only**

Run (example):
```
rg -n "(text|bg|border|decoration|outline|ring|divide|from|to|via)-black\b|#000\b|#111\b|#4285f4\b|#b45309\b|#cc0000\b" src/app/activity/page.tsx
```

- [ ] **Step 3: Apply each replacement**

Use `Edit` tool (one edit per unique match pattern). Reference the pattern table at the top of this plan. If a match doesn't fit any pattern (unusual hex, unique inline-style case), stop and flag it in the commit — don't guess.

- [ ] **Step 4: Visual check**

Navigate to the page in dev. Confirm:
- Nav wash renders above the page (blush header).
- No pure-black text or borders remain.
- Signal moments (any pills, AI labels, TODAY markers) render in their semantic color.
- Screen scrolls cleanly; layout intact.

- [ ] **Step 5: Commit**

```bash
git add src/app/<page>/page.tsx
git commit -m "refactor(page): retheme <page> to theme tokens"
```

- [ ] **Step 6: Repeat for each remaining page in the list above**

---

## Task 11: Update brand doc

**Files:**
- Modify: `.impeccable.md`

- [ ] **Step 1: Update the Aesthetic Direction section**

Use the Edit tool with these exact strings:

`old_string`:
```markdown
### Aesthetic Direction
- **Visual tone**: Corporate brutalism with domestic warmth. Sharp angles, monochrome palette, generous whitespace, typographic hierarchy.
- **Color**: Grayscale dominant. Black (#000), white (#fff) with transparent-black layering for depth. Amber (#b45309) for warnings only. Blue (#4285f4) for AI-generated content (Google blue — a subtle UX signal).
- **Typography**: Jost (headings, geometric, editorial) + DM Sans (body, clean) + serif italic for "system voice" moments (empty states, AI summaries, quotes). All-caps + wide tracking for labels/tags — feels like technical readout.
- **Shape**: 0px border radius everywhere. Square = sharp = decisive.
- **Dark mode**: Deep navy (#000022) background — not pure black, not glow-heavy.
- **References**: Linear, Figma UI, 1990s editorial design, command-line tools rendered as UI.
- **Anti-references**: No pastel/illustrated family apps, no rounded consumer apps (Notion/Todoist), no AI glow aesthetics (purple gradients, neon accents).
```

`new_string`:
```markdown
### Aesthetic Direction
- **Visual tone**: Sorbet Modern — feminine, elegant, modern. Warm ink, blush chrome, generous whitespace, typographic hierarchy preserved from the original brutalist frame.
- **Color**: White paper dominant (`#FFFFFF`). Warm charcoal ink (`#1A1A1A`) replaces pure black. Blush (`#FFF9F9`) washes global chrome (nav, command bar). Warm coral (`#D65A6B`) = AI content + accent moments. Acid yellow (`#FFE566`) = time-sensitive "TODAY" signal. Amber (`#B45309`) = warnings only.
- **Typography**: Jost (headings, geometric, editorial) + DM Sans (body, clean) + Cormorant Garamond italic for "system voice" moments (AI insights, empty states, quoted email snippets). All-caps + wide tracking for labels/tags — feels like technical readout.
- **Shape**: 0px border radius everywhere. Square = sharp = decisive.
- **Dark mode**: Dropped. The Hub is light-only.
- **References**: Linear, Figma UI, editorial spreads (Cereal, Kinfolk), command-line tools rendered as UI — now softened with a domestic warmth.
- **Anti-references**: No pastel/illustrated family apps, no rounded consumer apps (Notion/Todoist), no AI glow aesthetics (purple gradients, neon accents), no pure-black brutalism.
```

- [ ] **Step 2: Update Design Principle 2**

Use the Edit tool:

`old_string`:
```markdown
2. **Color signals meaning** — the only non-neutral colors are functional: amber = warning, blue = AI.
```

`new_string`:
```markdown
2. **Color signals meaning** — the only non-neutral colors are functional: coral = AI, yellow = today/urgent, amber = warning.
```

- [ ] **Step 3: Commit**

```bash
git add .impeccable.md
git commit -m "docs: update brand doc for sorbet modern palette"
```

---

## Task 12: Final static sweep + visual walk

- [ ] **Step 1: Run the static sweep across `src/`**

```
rg -n "(text|bg|border|decoration|outline|ring|divide|from|to|via)-black\b|#000\b|#111\b|#222\b|#4285f4\b|#b45309\b|#cc0000\b" src/
```

Expected matches (these are legitimate and OK):
- `src/components/ui/signal-pill.tsx` — no hex (uses token classes).
- Any `ui/` shadcn component files we haven't touched intentionally (e.g., `accordion.tsx`, `sheet.tsx`, `dialog.tsx`, `input.tsx`, `button.tsx`). If shadcn's defaults use `text-black`/`bg-black` hardcoded, leave them — shadcn generates via tokens and we don't want to fork shadcn's internals for this scope.

Unexpected matches should be triaged — apply the swap or call out the exception.

- [ ] **Step 2: Walk every route in the dev browser**

```
/        /calendar        /planner        /inbox
/life    /activity        /settings       /login
```

Checklist per page:
- Blush header wash present (except `/login`, which hides the header).
- Active nav link in coral.
- No pure-black visible text or borders.
- Signal pills render correct colors (AI = coral, TODAY = yellow, WARN = amber).
- Cormorant italic visible on at least one system-voice moment (insight box, empty-state copy, or quoted email snippet).

- [ ] **Step 3: If sweep or walk surfaces stragglers, fix inline and commit**

```bash
git add <files>
git commit -m "refactor(theme): clean up straggling color tokens"
```

- [ ] **Step 4: Final commit — tag completion**

If no stragglers:
```bash
git commit --allow-empty -m "chore(theme): sorbet modern retheme complete"
```

---

## Verification Summary

This retheme has no unit tests — it's purely presentational. The tests are:

1. The **static sweep** in Task 12 Step 1 — zero surprise matches.
2. The **visual walk** in Task 12 Step 2 — every route renders clean with the new palette.

Both must pass before the branch is merged.
