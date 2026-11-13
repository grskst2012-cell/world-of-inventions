// The single place where the generated data is read and counted.
// Nothing below is typed in by hand: every number on the site is derived here.
import inventionsRaw from './data/generated/inventions.json';
import historyRaw from './data/generated/history.json';
import bot from './data/generated/bot-data.json';
import imageStatusRaw from './data/generated/image-status.json';

export interface Source { title: string; url: string }
export interface ImageInfo {
  width: number;
  height: number;
  file: string;
  /** Direct address that image_url redirects to, resolved at build time. */
  src?: string;
  thumb?: string;
  page?: string;
  artist?: string | null;
  license?: string | null;
  licenseUrl?: string | null;
}
export interface Exhibit {
  id: string;
  name: string;
  hall: string;
  period: string;
  year: string;
  inventor: string;
  country: string;
  origin: string;
  features: string;
  significance: string;
  further_facts: string;
  how_it_works: string;
  map_countries: string[];
  image_url?: string;
  image_credit?: string;
  sources: Source[];
  /** Position in the catalogue (the order of inventions.json), starting at 1. */
  no: number;
  /** First four-digit year found in `year` ("1830s–1850s" -> 1830). */
  yearNum: number;
  /** Set only when the build-time check confirmed that image_url returns an image. */
  image: ImageInfo | null;
}
export interface HistoryEvent {
  month: number;
  day: number;
  year: number;
  kind: string;
  title: string;
  text: string;
  related_id?: string | null;
}
export interface Hall { title: string; name: string; description: string }
export interface QuizQuestion { question: string; options: string[]; answer: number; fact: string }
export interface Btn { text: string; cb: string }
export type Keyboard = Btn[][];

const imageStatus = imageStatusRaw as Record<string, ({ ok: boolean } & Partial<ImageInfo>) | undefined>;

export const yearOf = (year: string | number): number => parseInt(/\d{4}/.exec(String(year))?.[0] ?? '0', 10);

export const BOT = bot;
export const MUSEUM_NAME: string = bot.museumName;
export const HALLS = bot.halls as Record<string, Hall>;
export const HALL_IDS = Object.keys(HALLS);
export const QUIZ = bot.quiz as QuizQuestion[];
export const QUIZ_ROUND_SIZE: number = bot.quizRoundSize;
export const COUNTRY_INFO = bot.countryInfo as unknown as Record<string, [string, string]>;
export const CONTINENTS = bot.continents as unknown as [string, string][];
export const MONTH_NAMES: string[] = bot.monthNames;

export const INVENTIONS: Exhibit[] = (inventionsRaw as Omit<Exhibit, 'no' | 'yearNum' | 'image'>[]).map((item, index) => {
  const status = imageStatus[item.id];
  return {
    ...item,
    hall: String(item.hall),
    no: index + 1,
    yearNum: yearOf(item.year),
    image: item.image_url && status?.ok && status.width && status.height ? (status as ImageInfo) : null,
  };
});
export const BY_ID = new Map(INVENTIONS.map((item) => [item.id, item]));
export const HISTORY = historyRaw as HistoryEvent[];

export const hallItems = (hallId: string): Exhibit[] => INVENTIONS.filter((item) => item.hall === String(hallId));
/** The same hall, ordered along the timeline (stable for equal years). */
export const hallItemsByYear = (hallId: string): Exhibit[] => [...hallItems(hallId)].sort((a, b) => a.yearNum - b.yearNum);

// Countries of the map, most inventions first (same ordering as COUNTRIES in handlers.py).
export const COUNTRY_COUNTS = new Map<string, number>();
for (const item of INVENTIONS) for (const c of item.map_countries) COUNTRY_COUNTS.set(c, (COUNTRY_COUNTS.get(c) ?? 0) + 1);
export const COUNTRIES = [...COUNTRY_COUNTS.keys()].sort((a, b) => COUNTRY_COUNTS.get(b)! - COUNTRY_COUNTS.get(a)! || (a < b ? -1 : a > b ? 1 : 0));
export const countryLabel = (c: string): string => `${COUNTRY_INFO[c]?.[0] ?? ''} ${c}`.trim();
export const countryItems = (c: string): Exhibit[] =>
  INVENTIONS.filter((item) => item.map_countries.includes(c)).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

const order = bot.periodOrder as string[];
const rank = (p: string) => (order.includes(p) ? order.indexOf(p) : order.length);
export const PERIODS = [...new Set(INVENTIONS.map((item) => item.period))].sort((a, b) => rank(a) - rank(b));

const years = INVENTIONS.map((item) => item.yearNum).filter(Boolean);
const byYear = [...INVENTIONS].sort((a, b) => a.yearNum - b.yearNum);
export const STATS = {
  exhibits: INVENTIONS.length,
  halls: HALL_IDS.length,
  yearMin: Math.min(...years),
  yearMax: Math.max(...years),
  span: Math.max(...years) - Math.min(...years),
  events: HISTORY.length,
  questions: QUIZ.length,
  places: COUNTRIES.length,
  withImage: INVENTIONS.filter((item) => item.image).length,
  first: byYear[0],
  last: byYear[byYear.length - 1],
};

export const pad3 = (n: number): string => String(n).padStart(3, '0');
/** Museum-style accession line: "No. 017 · Hall 2 · 1876". */
export const accession = (item: Exhibit): string => `No. ${pad3(item.no)} · Hall ${item.hall} · ${item.year}`;
export const altText = (item: Exhibit): string => `${item.name}, ${item.year}. ${item.inventor}.`;

/** First year covered by a hall, read from its title ("19th century" -> 1800, "1900–1950" -> 1900). */
export function hallStart(hallId: string): number {
  const title = HALLS[hallId].title;
  const exact = /^(\d{4})/.exec(title);
  if (exact) return Number(exact[1]);
  const century = /^(\d{1,2})(?:st|nd|rd|th)/.exec(title);
  return century ? (Number(century[1]) - 1) * 100 : 0;
}
/** Which hall's era a calendar year falls into (used to dress "This Day" clippings in the right century). */
export function eraOf(year: number): string {
  let era = HALL_IDS[0];
  for (const id of HALL_IDS) if (hallStart(id) <= year) era = id;
  return era;
}
