"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useLifeHub } from "@/lib/life-hub/store";
import { useVoiceCapture } from "@/lib/life-hub/use-voice-capture";
import { parseIntent } from "@/lib/life-hub/intent-parser";

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="3" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
      <path d="M9 21h6" />
    </svg>
  );
}

type Suggestion = { tag: string; label: string; onApply: () => void };

export function ChiefOfStaff() {
  const { addToList, shapes, priorities } = useLifeHub();
  const [input, setInput] = useState("");
  const [activeContext, setActiveContext] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFinalTranscript = useCallback((text: string) => {
    setInput((prev) => (prev ? prev + (prev.endsWith(" ") ? "" : " ") : "") + text);
  }, []);

  const voice = useVoiceCapture({ onFinalTranscript: handleFinalTranscript });
  const interim = voice.interim;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    const text = activeContext ? `${activeContext}: ${input.trim()}` : input.trim();
    runIntent(text);
    setInput("");
  };

  const runIntent = (text: string) => {
    const intent = parseIntent(text);
    switch (intent.kind) {
      case 'addToList':
        addToList(intent.list, intent.text);
        return;
      case 'completeInList':
        toast('Mark done', { description: `Say which list: "${intent.text}" in Groceries? Owen? Ellie?` });
        return;
      case 'remind':
        toast('Got it', { description: `Reminder: ${intent.text}${intent.when ? ` · ${intent.when}` : ''} (full scheduling in next build)` });
        return;
      case 'query':
        toast('Ask me later', { description: `I can't yet answer "${intent.query}" — LLM chat hooks up in the next PR.` });
        return;
      case 'unmatched':
        toast("I didn't catch that", {
          description: 'Try: "add diapers to Owen", "groceries: oat milk, eggs", "remind me to book pumpkin carving".',
        });
    }
  };

  const contextChips = useMemo(() => {
    const hashes: string[] = [];
    for (const s of shapes) {
      if (s.kind === 'THREAD') {
        for (const l of s.lists) hashes.push(l.id);
      } else {
        hashes.push(s.slug);
      }
    }
    return hashes;
  }, [shapes]);

  const suggestions: Suggestion[] = useMemo(() => {
    const list: Suggestion[] = [];
    // Proactive based on state
    const pendingDisney = priorities.find(p => p.id === 'book-disney-character-dining' && !p.snoozed);
    if (pendingDisney) {
      list.push({
        tag: 'remind',
        label: 'Nov 2 · 9 PM · Disney booking',
        onApply: () => toast('Reminder set', { description: 'Alarm Nov 2 · 9 PM for Disney character dining.' }),
      });
    }
    const mom = priorities.find(p => p.id === 'reply-mom-care-package' && !p.snoozed);
    if (mom) {
      list.push({
        tag: 'draft',
        label: 'mom thank-you (voice)',
        onApply: () => toast('Voice draft', { description: 'Hold to talk — will draft a reply from your voice note.' }),
      });
    }
    list.push({
      tag: 'file',
      label: '3 emails into Halloween',
      onApply: () => toast('Filed', { description: '3 Halloween-tagged emails routed into the Fall season.' }),
    });
    list.push({
      tag: 'book',
      label: 'Sunday boat slot 10 AM',
      onApply: () => toast('Held', { description: 'Sunday 10 AM boat slot held. Confirm 24h before.' }),
    });
    return list;
  }, [priorities]);

  const holdToTalk = () => {
    if (voice.listening) voice.stop();
    else voice.start();
  };

  const listenBtnLabel = !voice.supported
    ? 'Voice N/A'
    : voice.listening ? 'Listening…' : 'Hold to talk';

  return (
    <section className="fixed left-0 right-0 bottom-0 z-50 bg-background border-t border-border" aria-label="Chief of Staff">
      <div className="max-w-[1600px] mx-auto px-8 pt-3 pb-3.5 flex flex-col gap-2">

        <div className="flex items-center justify-between gap-4">
          <h2 className="font-heading font-light text-[16px] tracking-[-0.01em] text-foreground flex items-center gap-2.5">
            <span className="text-accent text-[15px] leading-none">◇</span>
            <span>Chief of Staff</span>
            <span className="font-mono text-[9px] text-accent tracking-[0.14em] uppercase border border-accent/20 px-1.5 py-[1px] bg-accent/8">
              LIVE
            </span>
          </h2>

          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            <span className="font-sans text-[9px] font-bold tracking-[0.2em] uppercase text-muted-foreground whitespace-nowrap">
              Suggests:
            </span>
            {suggestions.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={s.onApply}
                className="inline-flex items-center gap-[7px] font-sans text-[12px] text-foreground border border-border px-2.5 py-[5px] whitespace-nowrap hover:border-accent hover:bg-accent/8 transition-colors"
              >
                <span className="font-mono text-[9.5px] text-accent tracking-[0.06em]">{s.tag}</span>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3.5 border-b border-border px-0.5 py-1"
        >
          <span className="font-mono text-[16px] text-accent leading-none">›</span>
          <div className="relative flex items-center">
            {activeContext && (
              <span className="font-mono text-[11px] text-accent border border-accent/30 bg-accent/8 px-1.5 py-[2px] mr-2">
                {activeContext}
                <button
                  type="button"
                  aria-label="Clear context"
                  onClick={() => setActiveContext(null)}
                  className="ml-1 text-muted-foreground hover:text-accent"
                >
                  ×
                </button>
              </span>
            )}
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={interim || "Say or type what you need — e.g. “add diapers to Owen's list”, “remind me to book pumpkin carving”."}
              className="flex-1 font-sans text-[15px] text-foreground bg-transparent border-0 outline-none py-1 placeholder:text-muted-foreground"
            />
          </div>
          <button
            type="button"
            onClick={holdToTalk}
            disabled={!voice.supported}
            className={`inline-flex items-center gap-2 px-3 py-1.5 font-sans text-[10px] font-bold tracking-[0.2em] uppercase text-white transition-all ${
              voice.listening
                ? 'bg-foreground'
                : voice.supported
                ? 'bg-accent hover:bg-accent/85'
                : 'bg-muted text-muted-foreground cursor-not-allowed'
            }`}
          >
            <span
              aria-hidden="true"
              className={`w-1.5 h-1.5 rounded-full bg-white ${voice.listening ? 'animate-pulse' : ''}`}
              style={voice.listening ? undefined : { opacity: 0.7 }}
            />
            <MicIcon />
            {listenBtnLabel}
          </button>
          <span className="font-mono text-[10px] text-muted-foreground tracking-[0.08em] border border-border px-1.5 py-[3px]">
            ↵
          </span>
        </form>

        <div className="flex gap-1.5 flex-wrap">
          {contextChips.slice(0, 10).map((tag) => {
            const active = activeContext === tag;
            return (
              <button
                key={tag}
                type="button"
                onClick={() => {
                  setActiveContext(active ? null : tag);
                  inputRef.current?.focus();
                }}
                className={
                  active
                    ? "font-mono text-[10px] tracking-[0.03em] px-2 py-[3px] border border-accent bg-accent/8 text-accent"
                    : "font-mono text-[10px] tracking-[0.03em] px-2 py-[3px] border border-border text-muted-foreground hover:text-foreground hover:border-foreground/20 hover:bg-nav transition-colors"
                }
              >
                #{tag}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => toast('Coming soon', { description: 'Create a new shape — endeavor, season, rhythm, or thread.' })}
            className="font-mono text-[10px] tracking-[0.03em] px-2 py-[3px] border border-border text-muted-foreground hover:text-foreground hover:border-foreground/20 hover:bg-nav transition-colors"
          >
            + new shape
          </button>
        </div>

      </div>
    </section>
  );
}
