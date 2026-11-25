import { useSyncExternalStore } from 'react';

export type Settings = {
  autoLock: number; // minutes away before the PIN is asked again; 0 = right away
  speechLang: string; // '' = automatic
  smartSpeech: boolean; // on-device language detection + transcription after each recording
};

const KEY = 'archive.settings';
const DEFAULTS: Settings = { autoLock: 1, speechLang: '', smartSpeech: false };

let current: Settings = load();
const listeners = new Set<() => void>();

function load(): Settings {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>) };
  } catch {
    return DEFAULTS;
  }
}

export function getSettings() {
  return current;
}

export function setSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export function resetSettings() {
  localStorage.removeItem(KEY);
  current = DEFAULTS;
  listeners.forEach((l) => l());
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}

/**
 * The language the browser's speech engine should listen for. "Automatic" picks
 * Filipino + English (which follows Taglish code-switching) on Philippine devices,
 * otherwise the device language.
 */
export function speechLangFor(): string {
  return current.speechLang || autoSpeechLang();
}

/** What "Automatic" resolves to on this device. */
export function autoSpeechLang(): string {
  return inPhilippines() ? 'fil-PH' : navigator.language || 'en-US';
}

/**
 * Most phones in the Philippines are set to English, so the device language alone
 * misses Tagalog speakers. The Philippine time zone is a far better signal.
 */
function inPhilippines(): boolean {
  const langs = navigator.languages?.length ? navigator.languages : [navigator.language];
  if (langs.some((l) => /^(fil|tl|ceb|hil|ilo|war|pam|bik)\b/i.test(l) || /-PH$/i.test(l))) return true;
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone === 'Asia/Manila';
  } catch {
    return false;
  }
}

/** Languages to fall back to, in order, if the browser can't listen in the chosen one. */
export function speechFallbacks(lang: string): string[] {
  return ['fil-PH', navigator.language || 'en-US', 'en-US'].filter((l, i, a) => l !== lang && a.indexOf(l) === i);
}

export const SPEECH_LANGUAGES: { code: string; label: string }[] = [
  { code: '', label: 'Automatic (Recommended)' },
  { code: 'fil-PH', label: 'Filipino + English (Taglish)' },
  { code: 'ceb-PH', label: 'Cebuano (Bisaya)' },
  { code: 'hil-PH', label: 'Hiligaynon (Ilonggo)' },
  { code: 'ilo-PH', label: 'Ilocano' },
  { code: 'en-PH', label: 'English (Philippines)' },
  { code: 'en-US', label: 'English (United States)' },
  { code: 'en-GB', label: 'English (United Kingdom)' },
  { code: 'es-ES', label: 'Español' },
  { code: 'fr-FR', label: 'Français' },
  { code: 'de-DE', label: 'Deutsch' },
  { code: 'it-IT', label: 'Italiano' },
  { code: 'pt-BR', label: 'Português (Brasil)' },
  { code: 'ja-JP', label: '日本語' },
  { code: 'ko-KR', label: '한국어' },
  { code: 'zh-CN', label: '中文 (简体)' },
];
