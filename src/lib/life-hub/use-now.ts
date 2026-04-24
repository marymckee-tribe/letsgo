"use client";

import { useSyncExternalStore } from "react";

let _t = Date.now();
const listeners = new Set<() => void>();
let _interval: ReturnType<typeof setInterval> | null = null;

function subscribe(cb: () => void) {
  listeners.add(cb);
  if (!_interval) {
    _interval = setInterval(() => {
      _t = Date.now();
      listeners.forEach((l) => l());
    }, 60_000);
  }
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && _interval) {
      clearInterval(_interval);
      _interval = null;
    }
  };
}

function getSnapshot() { return _t; }
function getServerSnapshot() { return 0; }

/** Subscribe to a shared, lint-clean "now" that ticks every minute. */
export function useNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
