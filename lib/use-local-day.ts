'use client';

import { useSyncExternalStore } from 'react';
import { todayKey } from './task-calendar';

function subscribe(onChange: () => void) {
  window.addEventListener('focus', onChange);
  const timer = window.setInterval(onChange, 60_000);
  return () => { window.removeEventListener('focus', onChange); window.clearInterval(timer); };
}
export function useLocalDay(initialToday: string) {
  return useSyncExternalStore(subscribe, todayKey, () => initialToday);
}
