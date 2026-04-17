# Feminine Palette Retheme — Design Spec

**Date:** 2026-04-17
**Status:** Draft — pending review

## Overview

Shift The Hub away from the current stark black-on-white brutalism toward a warmer, airier, feminine palette while preserving the existing layout, typography, and information architecture. No structural changes; this is a token-level retheme with targeted component edits where colors are hardcoded.

Direction: **Sorbet Modern, minimal.** Pure-white paper with a blush-washed nav, warm-coral AI accents, acid-yellow "today" signals, and warm-charcoal ink replacing pure black.

## Non-Goals

- No layout changes (3-column Hub + command bar stays as-is).
- No new widgets, no widget re-ordering, no navigation restructuring.
- No typography changes (Jost / DM Sans / Cormorant Garamond are preserved).
- No dark mode — dropped entirely.
- No new features, no new routes, no store changes.

## Palette

All tokens live in `src/app/globals.css` inside the existing `@theme inline` block.

### Surface tokens

| Token | Value | Change |
|---|---|---|
| `--color-background` | `#FFFFFF` | unchanged |
| `--color-foreground` | `#1A1A1A` | softened from `#000000` (warm charcoal) |
| `--color-card` | `#FFFFFF` | unchanged |
| `--color-card-foreground` | `#1A1A1A` | softened from `#000000` |
| `--color-popover` | `#FFFFFF` | unchanged |
| `--color-popover-foreground` | `#1A1A1A` | softened from `#000000` |
| `--color-border` | `color-mix(in srgb, black 8%, transparent)` | softened from 10% |
| `--color-input` | `color-mix(in srgb, black 8%, transparent)` | softened from 10% |
| `--color-ring` | `#1A1A1A` | softened from `#000000` |
| `--color-primary` | `#1A1A1A` | softened from `#000000` |
| `--color-primary-foreground` | `#FFFFFF` | unchanged |
| `--color-muted` | `color-mix(in srgb, black 5%, transparent)` | unchanged |
| `--color-muted-foreground` | `color-mix(in srgb, black 60%, transparent)` | unchanged |
| `--color-destructive` | `#B45309` | amber (was `#CC0000`), aligned with `--color-signal-warn` |
| `--color-destructive-foreground` | `#FFFFFF` | unchanged |

### New tokens

| Token | Value | Purpose |
|---|---|---|
| `--color-nav` | `#FFF9F9` | Blush wash on `<header>` and command-bar chrome |
| `--color-accent` | `#D65A6B` | Warm coral — active nav link, insight borders, "◇ ASK" prompt, system-voice accent |
| `--color-accent-foreground` | `#FFFFFF` | Text on coral fills |
| `--color-signal-ai` | `#D65A6B` | AI-content pill (warm coral, replaces Google blue) |
| `--color-signal-ai-foreground` | `#FFFFFF` | |
| `--color-signal-today` | `#FFE566` | Today / urgent attention pill (acid yellow) |
| `--color-signal-today-foreground` | `#1A1A1A` | |
| `--color-signal-warn` | `#B45309` | Warnings only (existing amber, kept) |
| `--color-signal-warn-foreground` | `#FFFFFF` | |

### Radius

Unchanged — all radius tokens remain `0px`. Brutalist squares stay.

### Dark mode

Dark mode is dropped entirely:

- The `@custom-variant dark (&:is(.dark *))` line is removed.
- The duplicate `:root { … }` + `.dark { … }` blocks below `@theme inline` are removed. They are dead code today — `ThemeProvider` in `layout.tsx` already sets `enableSystem={false}` + `defaultTheme="light"`, so the `.dark` class is never applied, and the bare `--background` / `--foreground` / `--border` vars in those blocks are not wired into `@theme inline` (which hardcodes hex). Cleanup only.
- `.impeccable.md` references to navy dark mode are removed. `AGENTS.md` is unrelated and left alone.

### Accent vs signal-ai

`--color-accent` and `--color-signal-ai` share the same hex (`#D65A6B`). They are kept as distinct tokens because they mean different things:

- **`accent`** = structural chrome moments where coral carries brand personality but isn't a categorical signal (active nav underline, "◇ ASK" prompt mark, `.impeccable`-style system-voice accents).
- **`signal-ai`** = semantic "this chunk is AI-generated." Applies to pill fills, insight card borders, "Pending AI Actions" labels.

When editing a component, pick based on meaning, not color. If the color later drifts apart (say, accent becomes a softer rose), the distinction matters.

## Typography

No value changes. Making the serif explicit:

| Token | Value | Notes |
|---|---|---|
| `--font-heading` | `var(--font-jost)` | unchanged |
| `--font-sans` | `var(--font-dm-sans)` | unchanged |
| `--font-serif` | `Cormorant Garamond, Georgia, serif` | **new token** — already used inline via `font-serif` class across widgets; promoting to a named token for consistency |

## Signal Semantics

| Signal | Token | Visual | Use cases |
|---|---|---|---|
| AI-generated content | `--color-signal-ai` (coral) | Filled pill `bg-signal-ai text-signal-ai-foreground` | AI reply drafts, AI-suggested actions, AI insight borders & labels, "Pending AI Actions" labels |
| Time-sensitive | `--color-signal-today` (yellow) | Filled pill `bg-signal-today text-signal-today-foreground` | "TODAY" markers, leave-by times, urgent event tags |
| Warning | `--color-signal-warn` (amber) | Filled pill `bg-signal-warn text-signal-warn-foreground` | Overdue bills, broken sync, destructive confirmations |

## Signal Pill Component

New file: `src/components/ui/signal-pill.tsx`

```tsx
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const signalPillVariants = cva(
  "inline-block font-mono text-[9px] tracking-[0.22em] uppercase font-bold px-2 py-0.5",
  {
    variants: {
      variant: {
        ai:    "bg-signal-ai text-signal-ai-foreground",
        today: "bg-signal-today text-signal-today-foreground",
        warn:  "bg-signal-warn text-signal-warn-foreground",
        neutral: "border border-foreground text-foreground",
      },
    },
    defaultVariants: { variant: "neutral" },
  }
)

export function SignalPill({
  variant,
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof signalPillVariants>) {
  return (
    <span className={cn(signalPillVariants({ variant }), className)} {...props}>
      {children}
    </span>
  )
}
```

Replaces the several near-duplicate inline pill snippets in `bouncer.tsx`, `dashboard-cards.tsx`, and other places.

## File-by-File Changes

### Config

**`src/app/globals.css`** — update the `@theme inline` block per the palette tables. Remove `.dark { … }`. Remove `@custom-variant dark`.

### Chrome

**`src/components/nav.tsx`**
- `<header>`: `border-b border-black/10` → `border-b border-border`; add `bg-nav`.
- Active link: `text-black font-medium border-b border-black` → `text-accent font-medium border-b border-accent`.
- Inactive link: `text-black/40 hover:text-black/80` → `text-foreground/40 hover:text-foreground/80`.
- Logo: unchanged structurally; it inherits `text-foreground` from body.

**`src/app/layout.tsx`**
- `<body>` class: `bg-white text-black` → `bg-background text-foreground`.
- Toaster `toastOptions.className`: `bg-black text-white` → `bg-foreground text-background`.

### Widgets

**`src/components/widgets/command-center.tsx`**
- `text-black`, `border-black/10`, `text-black/40`, `text-black/60`, `hover:border-black/20` → token equivalents (`text-foreground`, `border-border`, `text-foreground/40`, `text-muted-foreground`, `hover:border-border`).
- Header & disconnect button use `text-foreground` / `text-muted-foreground`.

**`src/components/widgets/bouncer.tsx`**
- Black-swap pass across all `text-black*`, `border-black*`, `bg-black*` tokens.
- `[INBOX]` neutral tag → `<SignalPill variant="neutral">INBOX</SignalPill>`.
- "Pending AI Actions" label `text-black/40` → `text-signal-ai` (upgrade — this is AI content, signal accordingly).
- Each AI action block: `bg-black/5 border border-black/10` → `bg-signal-ai/8 border border-signal-ai/20` to signal "AI-suggested."
- Act button `bg-black text-white` → `bg-foreground text-background` (unchanged appearance).
- Email body snippet: keeps `font-serif italic`; border-left color `border-black/20` → `border-border`.

**`src/components/widgets/dashboard-cards.tsx`**
- Black-swap pass.
- Schedule-intelligence insight: `bg-black/5 border-l-2 border-black` → `bg-accent/8 border-l-2 border-accent`; label `text-black` → `text-accent`.
- AI prep notes border `border-black/10` → `border-signal-ai/30` (semantic: AI-generated content).
- Sheet trigger hover `hover:border-black/10` → `hover:border-border`.
- Event-detail Sheet: `border-l border-black` → `border-l border-border`; time badge `bg-black/5` → `bg-muted`.

**`src/components/widgets/brain-dump.tsx`**
- Input border → `border-border`.
- Add a coral `◇` mark before the input prompt (small moment, via `text-accent`).
- Send button keeps `bg-foreground text-background`.

**`src/components/widgets/task-schedule.tsx`**
- Black-swap pass following the same pattern.
- Any task-tag pills → `<SignalPill variant="…">`.

### Pages

Same black-swap pattern applied to the top-level page file in each route. Verify no hardcoded `#000` / `text-black` / `border-black/…` / `#4285f4` / `#b45309` remain after the pass.

- `src/app/calendar/`
- `src/app/planner/`
- `src/app/inbox/`
- `src/app/life/`
- `src/app/activity/`
- `src/app/settings/`
- `src/app/login/`

### Brand documentation

**`.impeccable.md`** — update the palette, dark-mode, and color-signal sections:
- Replace amber-warning + Google-blue-AI language with coral-AI + yellow-today + amber-warning mapping.
- Remove the deep-navy dark-mode paragraph.
- Add note: "Warm charcoal (#1A1A1A) replaces pure black for ink to read softer against blush chrome."

**`AGENTS.md`** — no changes (the Next.js-16 warning is unrelated).

## Verification

Theming changes are easy to half-finish. Two guardrails:

**Dev-time visual sweep**
- `npm run dev`, log in, walk every route: `/`, `/calendar`, `/planner`, `/inbox`, `/life`, `/activity`, `/settings`, `/login`.
- Confirm blush nav wash on every page.
- Confirm coral active tab on each route.
- Confirm no pure-black borders or text bleed through.
- Verify live examples of each signal pill (AI, TODAY, WARN) render with the correct token color.
- Confirm Cormorant italic still appears on system-voice moments (insights, empty states, email snippet quotes).

**Static sweep**
```
rg -n "(text|bg|border|decoration|outline|ring|divide|from|to|via)-black\b|#000\b|#111\b|#222\b|#4285f4\b|#b45309\b|#cc0000\b" src/
```
Every match needs a reason. Hardcoded hex inside `signal-pill.tsx` variants is fine; structural colors should move to tokens. Signal-pill consumers should import from the component, not re-declare inline.

## Testing

No unit tests. This is purely presentational; there is no logic to assert against. Visual verification in the browser is the test.

## Rollout

Single PR. Commit sequence:
1. Token updates in `globals.css` + dark-mode removal.
2. `SignalPill` component.
3. Chrome (nav + layout).
4. Widgets (one commit per widget file).
5. Pages (one commit for the sub-page sweep).
6. Brand doc update.

Each commit runs a dev-server visual check before the next starts.
