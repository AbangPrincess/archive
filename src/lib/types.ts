export type Place = {
  name: string;
  lat: number;
  lng: number;
};

/** A stretch of spoken words with its position (in seconds) inside a recording. */
export type Segment = {
  text: string;
  start: number;
  end: number;
};

export type Recording = {
  id: string;
  duration: number;
  segments: Segment[];
  mime: string;
  createdAt: number;
};

export type Entry = {
  /** Local calendar day, YYYY-MM-DD. One entry per day. */
  date: string;
  title: string;
  body: string;
  favorite: boolean;
  photoIds: string[];
  coverId?: string;
  place?: Place;
  recordings: Recording[];
  spoken: boolean;
  createdAt: number;
  updatedAt: number;
};

/** Each day's photo dump holds up to this many photos. */
export const MAX_PHOTOS = 10;

export function emptyEntry(date: string): Entry {
  const now = Date.now();
  return {
    date,
    title: '',
    body: '',
    favorite: false,
    photoIds: [],
    recordings: [],
    spoken: false,
    createdAt: now,
    updatedAt: now,
  };
}

export function hasContent(e: Entry): boolean {
  return Boolean(e.title.trim() || e.body.trim() || e.photoIds.length || e.recordings.length || e.place);
}

export function coverOf(e: Entry): string | undefined {
  if (e.coverId && e.photoIds.includes(e.coverId)) return e.coverId;
  return e.photoIds[0];
}

export function totalDuration(e: Entry): number {
  return e.recordings.reduce((sum, r) => sum + r.duration, 0);
}
