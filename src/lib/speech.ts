/* Minimal typings for the browser's built-in speech recognition. */
export interface SpeechAlternative {
  transcript: string;
  confidence: number;
}
export interface SpeechResult {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechAlternative;
}
export interface SpeechResultEvent extends Event {
  resultIndex: number;
  results: { length: number; [index: number]: SpeechResult };
}
export interface SpeechErrorEvent extends Event {
  error: string;
}
export interface Recognizer extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechResultEvent) => void) | null;
  onerror: ((e: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

type RecognizerCtor = new () => Recognizer;

export function recognizerClass(): RecognizerCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecognizerCtor; webkitSpeechRecognition?: RecognizerCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const speechSupported = () => recognizerClass() !== null;

/** Tidies a spoken phrase: trims, capitalises the first letter, keeps the speaker's own words. */
export function tidyPhrase(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return '';
  const cap = t.charAt(0).toUpperCase() + t.slice(1);
  return /[.!?…]$/.test(cap) ? cap : `${cap}.`;
}

export function speechErrorMessage(code: string): string | null {
  switch (code) {
    case 'no-speech':
    case 'aborted':
      return null;
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Speech-to-text was blocked. Allow microphone access in your browser settings to see your words appear.';
    case 'network':
      return 'Speech-to-text needs an internet connection in this browser. Your voice is still being recorded.';
    case 'audio-capture':
      return 'This device can’t transcribe while recording. Your voice is still being saved.';
    case 'language-not-supported':
      return 'This speech language isn’t supported here. Try another one in Settings.';
    default:
      return 'Speech-to-text stopped unexpectedly. Your voice is still being recorded.';
  }
}
