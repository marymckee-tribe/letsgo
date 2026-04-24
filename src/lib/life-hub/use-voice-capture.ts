"use client";

import { useCallback, useRef, useState, useSyncExternalStore } from "react";

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: {
    [index: number]: {
      [index: number]: { transcript: string };
      isFinal: boolean;
      length: number;
    };
    length: number;
  };
};

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type WindowWithSpeech = Window & {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
};

export type VoiceCapture = {
  supported: boolean;
  listening: boolean;
  interim: string;
  error: string | null;
  start: () => void;
  stop: () => void;
};

export type VoiceCaptureOptions = {
  /** Fired each time a final transcript chunk is produced. */
  onFinalTranscript?: (text: string) => void;
};

// --- "supported" as a subscribable snapshot so we don't setState in an effect.
function subscribeSupported(cb: () => void) {
  // Static capability — never changes after first render. No subscriber needed.
  void cb;
  return () => {};
}
function getSupportedClient() {
  if (typeof window === "undefined") return false;
  const w = window as WindowWithSpeech;
  return Boolean(w.SpeechRecognition ?? w.webkitSpeechRecognition);
}
function getSupportedServer() {
  return false;
}

export function useVoiceCapture(opts: VoiceCaptureOptions = {}): VoiceCapture {
  const supported = useSyncExternalStore(subscribeSupported, getSupportedClient, getSupportedServer);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);

  const onFinal = opts.onFinalTranscript;

  const start = useCallback(() => {
    if (typeof window === "undefined") return;
    const w = window as WindowWithSpeech;
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;

    if (recRef.current) {
      try { recRef.current.abort(); } catch {}
    }

    const rec = new Ctor();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = true;

    rec.onresult = (e) => {
      let finalText = "";
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interimText += r[0].transcript;
      }
      if (finalText) onFinal?.(finalText.trim());
      setInterim(interimText);
    };
    rec.onerror = (e) => {
      setError(e.error ?? "voice_error");
      setListening(false);
    };
    rec.onend = () => {
      setListening(false);
      setInterim("");
    };

    recRef.current = rec;
    setError(null);
    setListening(true);
    try { rec.start(); } catch (err) {
      setError(String(err));
      setListening(false);
    }
  }, [onFinal]);

  const stop = useCallback(() => {
    if (recRef.current) {
      try { recRef.current.stop(); } catch {}
    }
    setListening(false);
  }, []);

  return { supported, listening, interim, error, start, stop };
}
