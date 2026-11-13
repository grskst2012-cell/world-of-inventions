// A faithful port of the bot's screen texts, keyboards and small algorithms,
// so that the mock chats and the live widgets behave like the real thing.
// Source of truth: handlers.py and keyboards.py. If a text changes there,
// change it here too (static menus, HALLS, QUIZ etc. are extracted automatically).
import {
  BOT, MUSEUM_NAME, HALLS, HALL_IDS, INVENTIONS, HISTORY, COUNTRIES, COUNTRY_INFO, CONTINENTS, COUNTRY_COUNTS,
  MONTH_NAMES, PERIODS, countryLabel, hallItems,
  type Exhibit, type HistoryEvent, type Keyboard, type Btn, type QuizQuestion,
} from './data';

const btn = (text: string, cb: string): Btn => ({ text, cb });
const NAV_ROW = BOT.keyboards.navRow as Btn[];
const HOME = NAV_ROW[1];
export const ITEMS_PER_PAGE: number = BOT.itemsPerPage;
export const FAVORITE_ADD: string = BOT.favoriteAddText;
export const FAVORITE_REMOVE: string = BOT.favoriteRemoveText;

export interface Screen { text: string; keyboard: Keyboard; photo?: Exhibit | null }

// ------------------------------------------------------------------ menus
export const mainScreen = (): Screen => ({
  text:
    `Welcome to ${MUSEUM_NAME}! 🏛\n\n` +
    'Explore remarkable inventions, discover the people behind them, ' +
    'and test your knowledge of the ideas that changed the world.\n\n' +
    'Choose an option below to begin.',
  keyboard: BOT.keyboards.main,
});
export const museumScreen = (): Screen => ({
  text: '🏛 Welcome to the Museum\n\nChoose how you would like to explore the exhibits:',
  keyboard: BOT.keyboards.museum,
});
export const hallsScreen = (): Screen => ({
  text: '🏛 Museum Halls\n\nChoose a historical period:',
  keyboard: BOT.keyboards.halls,
});

// ------------------------------------------------------------------ paged lists
export const pageCount = (total: number): number => Math.max(1, Math.ceil(total / ITEMS_PER_PAGE));
function pagedKeyboard(items: Exhibit[], key: string, page: number, footer: Keyboard, prefix = ''): Keyboard {
  const pages = pageCount(items.length);
  const p = ((page % pages) + pages) % pages;
  const rows: Keyboard = items.slice(p * ITEMS_PER_PAGE, (p + 1) * ITEMS_PER_PAGE).map((item) => [btn(`${prefix}${item.name}`, `item:${item.id}`)]);
  if (pages > 1) rows.push([btn('◀️', `pg:${(p - 1 + pages) % pages}:${key}`), btn(`${p + 1}/${pages}`, 'noop'), btn('▶️', `pg:${(p + 1) % pages}:${key}`)]);
  return [...rows, ...footer];
}
export function hallScreen(hallId: string, page = 0): Screen {
  const hall = HALLS[hallId];
  const items = hallItems(hallId);
  return {
    text: `🏛 ${hall.name}\n${hall.title}\n\n${hall.description}\n\n` + (items.length ? 'Choose an exhibit below.' : 'This hall is being prepared. Check back later.'),
    keyboard: pagedKeyboard(items, `hall:${hallId}`, page, [[btn('⬅️ All Halls', 'halls'), HOME]]),
  };
}
export const catalogueScreen = (page = 0): Screen => ({
  text: `📚 Full Catalogue\n\n${INVENTIONS.length} inventions. Choose one:`,
  keyboard: pagedKeyboard(INVENTIONS, 'catalog', page, [NAV_ROW]),
});
export function favoritesScreen(items: Exhibit[]): Screen {
  if (!items.length) {
    return {
      text: '⭐ My Favorites\n\nYou have not saved any exhibits yet.\nOpen an exhibit and tap “Add Favorite” to keep it here.',
      keyboard: [NAV_ROW],
    };
  }
  return {
    text: `⭐ My Favorites\n\nYou have saved ${items.length} exhibit(s). Tap one to open it:`,
    keyboard: pagedKeyboard(items, 'fav', 0, [NAV_ROW], '⭐ '),
  };
}

// ------------------------------------------------------------------ exhibit card
export function formatInvention(item: Exhibit): string {
  let text =
    `🏺 ${item.name}\n\n` +
    `📅 Period: ${item.period}\n` +
    `Year: ${item.year}\n` +
    `👤 Inventor: ${item.inventor}\n` +
    `🌍 Country / context: ${item.country}\n\n` +
    `📜 Origin\n${item.origin}\n\n` +
    `⚙️ Features\n${item.features}\n\n` +
    `🌐 Significance\n${item.significance}\n\n` +
    `💡 Further Facts\n${item.further_facts}`;
  if (item.sources.length) {
    text += '\n\n📚 Sources';
    for (const source of item.sources) text += `\n• ${source.title}: ${source.url}`;
  }
  return text;
}
/** The exhibit card as the bot shows it when opened from its hall list. */
export function cardScreen(item: Exhibit, saved = false): Screen {
  const ids = hallItems(item.hall);
  const index = ids.indexOf(item);
  const count = ids.length;
  const rows: Keyboard = [];
  if (count > 1) {
    rows.push([
      btn('◀️ Prev', `item:${ids[(index - 1 + count) % count].id}`),
      btn(`${index + 1}/${count}`, 'noop'),
      btn('Next ▶️', `item:${ids[(index + 1) % count].id}`),
    ]);
  }
  rows.push([btn(saved ? FAVORITE_REMOVE : FAVORITE_ADD, `favorite:toggle:${item.id}`), btn('⚙️ How It Works', `how:${item.id}`)]);
  rows.push([btn(BOT.listBackLabels.hall, `pg:${Math.floor(index / ITEMS_PER_PAGE)}:hall:${item.hall}`), HOME]);
  const text = formatInvention(item);
  // JS string length is already counted in UTF-16 code units, like Telegram's caption limit.
  const withPhoto = Boolean(item.image) && text.length <= BOT.captionLimit;
  return { text, keyboard: rows, photo: withPhoto ? item : null };
}
export function howScreen(item: Exhibit, saved = false): Screen {
  const index = hallItems(item.hall).indexOf(item);
  const text = `⚙️ How It Works · ${item.name}\n\n${item.how_it_works}`;
  return {
    text,
    photo: item.image && text.length <= BOT.captionLimit ? item : null,
    keyboard: [
      [btn(saved ? FAVORITE_REMOVE : FAVORITE_ADD, `favorite:toggle:${item.id}`), btn('⬅️ Back to Exhibit', `item:${item.id}`)],
      [btn(BOT.listBackLabels.hall, `pg:${Math.floor(index / ITEMS_PER_PAGE)}:hall:${item.hall}`), HOME],
    ],
  };
}
export const FAVORITE_TOAST = '⭐ Added to your favorites';

// ------------------------------------------------------------------ statistics
export interface VisitorStats { studied: number; halls: number; favorites: number; correct: number; total: number; quizzes: number }
export function statsScreen(s: VisitorStats): Screen {
  const studied = Math.min(s.studied, INVENTIONS.length);
  const halls = Math.min(s.halls, HALL_IDS.length);
  const answers = s.total ? `${s.correct} of ${s.total} (${Math.round((100 * s.correct) / s.total)}%)` : 'no quiz answers yet';
  return {
    text:
      '📊 Personal Statistics\n\n' +
      `📚 Exhibits studied: ${studied} of ${INVENTIONS.length}\n` +
      `🏛 Halls opened: ${halls} of ${HALL_IDS.length}\n` +
      `⭐ Favorites saved: ${s.favorites}\n` +
      `🧠 Correct quiz answers: ${answers}\n` +
      `🏁 Quizzes completed: ${s.quizzes}\n\n` +
      'An exhibit counts as studied when you open it.',
    keyboard: [NAV_ROW],
  };
}

// ------------------------------------------------------------------ This Day in History
const DAY = 86400000;
const utc = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d);
export interface DayRef { year: number; month: number; day: number }
const nextOccurrence = (e: HistoryEvent, t: DayRef) => {
  const thisYear = utc(t.year, e.month, e.day);
  return thisYear >= utc(t.year, t.month, t.day) ? thisYear : utc(t.year + 1, e.month, e.day);
};
const previousOccurrence = (e: HistoryEvent, t: DayRef) => {
  const thisYear = utc(t.year, e.month, e.day);
  return thisYear <= utc(t.year, t.month, t.day) ? thisYear : utc(t.year - 1, e.month, e.day);
};
export interface HistoryEntry { event: HistoryEvent; dayLabel: string; when: string | null }
export interface HistoryResult { heading: string; exact: boolean; entries: HistoryEntry[]; related: string[]; text: string }
const historyLine = (e: HistoryEvent) => `${(BOT.historyKindIcons as Record<string, string>)[e.kind] ?? '📅'} ${e.year} — ${e.title}\n${e.text}`;

/** Same rules as build_history() in handlers.py: up to three exact matches for the date,
 *  otherwise the nearest earlier and the nearest later event, the closer one first. */
export function buildHistory(today: DayRef): HistoryResult {
  const now = utc(today.year, today.month, today.day);
  const heading = `📅 This Day in History · ${today.day} ${MONTH_NAMES[today.month - 1]}`;
  const dayLabel = (e: HistoryEvent) => `${e.day} ${MONTH_NAMES[e.month - 1]}`;
  const exact = HISTORY.filter((e) => e.month === today.month && e.day === today.day).sort((a, b) => a.year - b.year);
  let entries: HistoryEntry[];
  let text: string;
  if (exact.length) {
    entries = exact.slice(0, 3).map((event) => ({ event, dayLabel: dayLabel(event), when: null }));
    text = heading + '\n\n' + entries.map((x) => historyLine(x.event)).join('\n\n');
  } else {
    // Python's min()/max() keep the first of several equal candidates.
    let upcoming = HISTORY[0];
    let past = HISTORY[0];
    for (const e of HISTORY) {
      if (nextOccurrence(e, today) < nextOccurrence(upcoming, today)) upcoming = e;
      if (previousOccurrence(e, today) > previousOccurrence(past, today)) past = e;
    }
    const ahead = Math.round((nextOccurrence(upcoming, today) - now) / DAY);
    const behind = Math.round((now - previousOccurrence(past, today)) / DAY);
    const ordered = behind <= ahead ? [past, upcoming] : [upcoming, past];
    entries = ordered.map((event) => ({
      event,
      dayLabel: dayLabel(event),
      when: event === upcoming ? (ahead === 1 ? 'tomorrow' : `in ${ahead} days`) : behind === 1 ? 'yesterday' : `${behind} days ago`,
    }));
    text =
      heading + '\n\nNo invention or discovery in our calendar is dated exactly today. The closest ones are:\n\n' +
      entries.map((x) => `(${x.when}, on ${x.dayLabel})\n${historyLine(x.event)}`).join('\n\n');
  }
  const related: string[] = [];
  for (const { event } of entries) if (event.related_id && !related.includes(event.related_id)) related.push(event.related_id);
  return { heading, exact: exact.length > 0, entries, related, text };
}
export function historyScreen(today: DayRef, byId: Map<string, Exhibit>): Screen {
  const result = buildHistory(today);
  return {
    text: result.text,
    keyboard: [...result.related.map((id) => [btn(`🏺 Open exhibit: ${byId.get(id)!.name}`, `item:${id}`)]), [HOME]],
  };
}

// ------------------------------------------------------------------ invention map
export function mapScreen(): Screen {
  const lines = ['🗺 Invention Map', '', 'Where did our inventions come from? Tap a country to see its exhibits.', ''];
  for (const [continent, icon] of CONTINENTS) {
    const members = COUNTRIES.filter((c) => COUNTRY_INFO[c][1] === continent);
    if (members.length) {
      lines.push(`${icon} ${continent}`);
      lines.push(...members.map((c) => `${COUNTRY_INFO[c][0]} ${c} — ${COUNTRY_COUNTS.get(c)}`));
      lines.push('');
    }
  }
  if (COUNTRY_COUNTS.has('International')) {
    lines.push(`🌐 International / several countries — ${COUNTRY_COUNTS.get('International')}`);
    lines.push('');
  }
  lines.push('Inventions that involve several countries are counted for each of them.');
  const buttons = COUNTRIES.map((c) => btn(countryLabel(c), `map:country:${c}`));
  const rows: Keyboard = [];
  for (let i = 0; i < buttons.length; i += 2) rows.push(buttons.slice(i, i + 2));
  return { text: lines.join('\n'), keyboard: [...rows, NAV_ROW] };
}

// ------------------------------------------------------------------ search & filters
export interface Filters { country: string | null; hall: string | null; period: string | null }
const VARIANTS = BOT.spellingVariants as Record<string, string>;
/** Lower-case text and map common American spellings to the British ones used in the museum. */
export const normalizeText = (text: string): string => text.toLowerCase().replace(/[a-z]+/g, (w) => VARIANTS[w] ?? w);
export const applyFilters = (items: Exhibit[], f: Filters): Exhibit[] =>
  items.filter((item) =>
    (!f.country || item.map_countries.includes(f.country)) &&
    (!f.hall || item.hall === f.hall) &&
    (!f.period || item.period === f.period));
const SEARCH_KEYS = ['name', 'period', 'year', 'inventor', 'country', 'origin', 'features', 'significance', 'further_facts'] as const;
const haystack = new Map<string, string>();
/** Exhibits that pass the filters and (if given) contain the keyword. */
export function searchMatches(f: Filters, query: string | null): Exhibit[] {
  const items = applyFilters(INVENTIONS, f);
  if (!query || !query.trim()) return items;
  const needle = normalizeText(query.trim());
  return items.filter((item) => {
    if (!haystack.has(item.id)) haystack.set(item.id, normalizeText(SEARCH_KEYS.map((k) => String(item[k] ?? '')).join(' ')));
    return haystack.get(item.id)!.includes(needle);
  });
}
export const describeFilters = (f: Filters): string =>
  `Country: ${f.country ? countryLabel(f.country) : 'All'}\n` +
  `Hall: ${f.hall ? `Hall ${f.hall} · ${HALLS[f.hall].title}` : 'All'}\n` +
  `Period: ${f.period || 'All'}`;
export function filtersScreen(f: Filters): Screen {
  const matches = applyFilters(INVENTIONS, f);
  const rows: Keyboard = [[btn(`📋 Show Results (${matches.length})`, 'filter:results')]];
  rows.push([btn(f.country ? '🌍 All Countries' : '✅ 🌍 All Countries', 'filter:country:all')]);
  const countries = COUNTRIES.map((c) => btn(f.country === c ? `✅ ${countryLabel(c)}` : countryLabel(c), `filter:country:${c}`));
  for (let i = 0; i < countries.length; i += 2) rows.push(countries.slice(i, i + 2));
  rows.push([btn(f.hall ? '✅ 🏛 Hall' : '🏛 Hall', 'filter:hall:menu'), btn(f.period ? '✅ 📅 Period' : '📅 Period', 'filter:period:menu')]);
  rows.push([btn('🔄 Reset', 'filter:reset'), NAV_ROW[0]]);
  return {
    text:
      '🔎 Search & Filters\n\n' +
      `${describeFilters(f)}\n\n` +
      `Matching exhibits: ${matches.length}\n\n` +
      'Choose filters below and tap “Show Results”, or type a keyword ' +
      '(invention, inventor, country, year…) to search within the chosen filters.',
    keyboard: rows,
  };
}
export { PERIODS };

// ------------------------------------------------------------------ quiz
export interface QuizRound { order: number[]; optionOrders: number[][] }
function shuffle<T>(list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
/** Like start_quiz(): a random sample of questions, each with its own shuffled option order.
 *  Original option indexes are kept so the correct answer can still be recognised. */
export function newQuizRound(bank: QuizQuestion[], size: number): QuizRound {
  const order = shuffle(bank.map((_, i) => i)).slice(0, Math.min(size, bank.length));
  return { order, optionOrders: order.map((q) => shuffle(bank[q].options.map((_, i) => i))) };
}
export function quizScreen(bank: QuizQuestion[], round: QuizRound, index: number): Screen {
  const q = bank[round.order[index]];
  return {
    text: `🧠 Invention Quiz · Question ${index + 1}/${round.order.length}\n\n${q.question}`,
    keyboard: [
      ...round.optionOrders[index].map((o, i) => [btn(`${String.fromCharCode(65 + i)}. ${q.options[o]}`, `quiz:answer:${index}:${i}`)]),
      [btn('🏠 Quit Quiz', 'home')],
    ],
  };
}

// ------------------------------------------------------------------ feedback & team
export const feedbackScreen = (): Screen => ({
  text:
    '💬 Suggestions & Feedback\n\n' +
    'Have an idea, spotted a mistake, or want to suggest an invention? ' +
    'Send your message here and it will be forwarded to the project team.\n\n' +
    'Please send one text message. Send /start to cancel.',
  keyboard: [],
});
export const FEEDBACK_THANKS = 'Thank you! Your message has been sent to the project team. 💙';
export const TEAM_SCREEN_HEAD = '👥 Project Team\n\nThis museum is an educational project created by:';
export const TEAM_SCREEN_TAIL = 'Thank you for visiting our project!';
