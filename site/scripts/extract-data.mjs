// Extracts the museum's content from the bot's own source files, so the site
// never keeps a hand-copied version of it.
//
//   handlers.py   -> HALLS, QUIZ, QUIZ_ROUND_SIZE, COUNTRY_INFO, CONTINENTS, ...
//   keyboards.py  -> the static menus and button labels
//   database.py   -> the SQLite schema (CREATE TABLE statements)
//   config.py     -> MUSEUM_NAME
//   data/*.json   -> copied byte for byte
//
// It never opens .env. Run with: npm run data:extract
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BOT = resolve(SITE, '..');
const OUT = resolve(SITE, 'src/data/generated');

const need = ['handlers.py', 'keyboards.py', 'database.py', 'config.py', 'data/inventions.json', 'data/history.json'];
const missing = need.filter((f) => !existsSync(resolve(BOT, f)));
if (missing.length) {
  if (existsSync(resolve(OUT, 'bot-data.json'))) {
    console.warn(`[extract-data] Bot sources not found (${missing.join(', ')}). Keeping the existing generated files.`);
    process.exit(0);
  }
  throw new Error(`[extract-data] Bot sources not found: ${missing.join(', ')}`);
}

const read = (f) => readFileSync(resolve(BOT, f), 'utf8').replace(/\r\n/g, '\n');
const handlers = read('handlers.py');
const keyboards = read('keyboards.py');
const database = read('database.py');
const config = read('config.py');

// ---------------------------------------------------------------- a small Python literal parser
function parseLiteral(src, start) {
  let i = start;
  const skip = () => {
    for (;;) {
      while (i < src.length && /\s/.test(src[i])) i++;
      if (src[i] === '#') { while (i < src.length && src[i] !== '\n') i++; continue; }
      if (src[i] === '\\' && src[i + 1] === '\n') { i += 2; continue; }
      return;
    }
  };
  const string = () => {
    let out = '';
    for (;;) {
      const q = src[i];
      const triple = src.startsWith(q.repeat(3), i);
      const end = triple ? q.repeat(3) : q;
      i += end.length;
      while (!src.startsWith(end, i)) {
        if (i >= src.length) throw new Error('Unterminated string');
        if (src[i] === '\\') {
          const c = src[i + 1];
          const map = { n: '\n', t: '\t', '\\': '\\', "'": "'", '"': '"', '\n': '' };
          if (c === 'u') { out += String.fromCharCode(parseInt(src.slice(i + 2, i + 6), 16)); i += 6; continue; }
          out += c in map ? map[c] : '\\' + c;
          i += 2;
        } else out += src[i++];
      }
      i += end.length;
      skip();
      if (src[i] !== '"' && src[i] !== "'") return out; // adjacent literals are concatenated
    }
  };
  const seq = (close) => {
    const items = [];
    let sawComma = false;
    i++;
    for (;;) {
      skip();
      if (src[i] === close) { i++; return { items, sawComma }; }
      items.push(value());
      skip();
      if (src[i] === ',') { sawComma = true; i++; }
    }
  };
  const value = () => {
    skip();
    const c = src[i];
    if (c === '"' || c === "'") return string();
    if (c === '[') return seq(']').items;
    if (c === '(') { const { items, sawComma } = seq(')'); return items.length === 1 && !sawComma ? items[0] : items; }
    if (c === '{') {
      const obj = {};
      i++;
      for (;;) {
        skip();
        if (src[i] === '}') { i++; return obj; }
        const key = value();
        skip();
        if (src[i] !== ':') throw new Error(`Expected ":" at ${i}`);
        i++;
        obj[key] = value();
        skip();
        if (src[i] === ',') i++;
      }
    }
    const rest = src.slice(i);
    const num = rest.match(/^-?\d+(\.\d+)?/);
    if (num) {
      i += num[0].length;
      skip();
      // tiny arithmetic such as "5 * 1024 * 1024"
      let n = Number(num[0]);
      while (src[i] === '*') { i++; n *= value(); }
      return n;
    }
    const word = rest.match(/^(True|False|None)\b/);
    if (word) { i += word[0].length; return { True: true, False: false, None: null }[word[0]]; }
    throw new Error(`Cannot parse Python literal near: ${rest.slice(0, 40)}`);
  };
  return value();
}

function constant(src, name, file) {
  const m = new RegExp(`^${name}\\s*=\\s*`, 'm').exec(src);
  if (!m) throw new Error(`[extract-data] ${name} not found in ${file}`);
  return parseLiteral(src, m.index + m[0].length);
}

// ---------------------------------------------------------------- handlers.py
const bot = {
  museumName: constant(config, 'MUSEUM_NAME', 'config.py'),
  halls: constant(handlers, 'HALLS', 'handlers.py'),
  quizRoundSize: constant(handlers, 'QUIZ_ROUND_SIZE', 'handlers.py'),
  quiz: constant(handlers, 'QUIZ', 'handlers.py'),
  countryInfo: constant(handlers, 'COUNTRY_INFO', 'handlers.py'),
  continents: constant(handlers, 'CONTINENTS', 'handlers.py'),
  periodOrder: constant(handlers, 'PERIOD_ORDER', 'handlers.py'),
  monthNames: constant(handlers, 'MONTH_NAMES', 'handlers.py'),
  historyKindIcons: constant(handlers, 'HISTORY_KIND_ICONS', 'handlers.py'),
  spellingVariants: constant(handlers, 'SPELLING_VARIANTS', 'handlers.py'),
  listBackLabels: constant(handlers, 'LIST_BACK_LABELS', 'handlers.py'),
  captionLimit: constant(handlers, 'CAPTION_LIMIT', 'handlers.py'),
  itemsPerPage: constant(keyboards, 'ITEMS_PER_PAGE', 'keyboards.py'),
  favoriteAddText: constant(keyboards, 'FAVORITE_ADD_TEXT', 'keyboards.py'),
  favoriteRemoveText: constant(keyboards, 'FAVORITE_REMOVE_TEXT', 'keyboards.py'),
};

// ---------------------------------------------------------------- keyboards.py: static menus
function functionBody(src, name, file) {
  const m = new RegExp(`^def ${name}\\(`, 'm').exec(src);
  if (!m) throw new Error(`[extract-data] def ${name} not found in ${file}`);
  const next = src.slice(m.index + 1).search(/^(def |class |# -{10,})/m);
  return src.slice(m.index, next === -1 ? undefined : m.index + 1 + next);
}
const BTN = /btn\(\s*"((?:[^"\\]|\\.)*)",\s*"((?:[^"\\]|\\.)*)"\s*\)/g;
const rowOf = (line) => [...line.matchAll(BTN)].map((m) => ({ text: m[1], cb: m[2] }));
const navRow = rowOf(functionBody(keyboards, 'nav_row', 'keyboards.py'));
if (navRow.length !== 2) throw new Error('[extract-data] nav_row() no longer has two buttons');
function staticKeyboard(name) {
  const rows = [];
  for (const line of functionBody(keyboards, name, 'keyboards.py').split('\n').slice(1)) {
    if (/^\s*nav_row\(\),?\s*$/.test(line)) rows.push(navRow);
    else { const row = rowOf(line); if (row.length) rows.push(row); }
  }
  if (!rows.length) throw new Error(`[extract-data] No buttons found in ${name}()`);
  return rows;
}
bot.keyboards = {
  navRow,
  main: staticKeyboard('main_keyboard'),
  museum: staticKeyboard('museum_keyboard'),
  halls: staticKeyboard('halls_keyboard'),
};

// ---------------------------------------------------------------- database.py: schema
bot.schema = [...database.matchAll(/CREATE TABLE IF NOT EXISTS (\w+) \(([\s\S]*?)\n\s*\)\s*"""/g)].map((m) => {
  const lines = m[2].split('\n').map((l) => l.trim().replace(/,$/, '')).filter(Boolean);
  const pk = lines.find((l) => l.startsWith('PRIMARY KEY'))?.match(/\(([^)]+)\)/)?.[1].split(',').map((s) => s.trim()) ?? [];
  const columns = lines.filter((l) => !l.startsWith('PRIMARY KEY')).map((l) => {
    const [name, type, ...rest] = l.split(/\s+/);
    const constraints = rest.join(' ');
    return { name, type, constraints, pk: pk.includes(name) || /PRIMARY KEY/.test(constraints) };
  });
  return { table: m[1], columns };
});
if (!bot.schema.length) throw new Error('[extract-data] No CREATE TABLE statements found in database.py');

// ---------------------------------------------------------------- real code snippets (kept in sync with the sources)
const SNIPPETS = [
  { id: 'validate', file: 'handlers.py', start: /^ {4}for item in items:\n {8}missing = required/m, end: /^ {4}return items/m },
  { id: 'edit', file: 'handlers.py', start: /^async def show_text\(/m, end: /^async def show_card_text\(/m },
  { id: 'quiz', file: 'handlers.py', start: /^ {4}round_size = min\(QUIZ_ROUND_SIZE/m, end: /^ {4}await state\.update_data\(\n {8}quiz_order/m },
  { id: 'stats', file: 'database.py', start: /^def mark_exhibit_studied\(/m, end: /^def mark_hall_opened\(/m },
  { id: 'fsm', file: 'handlers.py', start: /^@router\.message\(FeedbackState\.waiting_for_message, F\.text\)/m, end: /^ {4}if not ADMIN_ID:/m },
  { id: 'nearest', file: 'handlers.py', start: /^ {8}upcoming = min\(HISTORY/m, end: /^ {8}lines = \[\]/m },
];
const sources = { 'handlers.py': handlers, 'database.py': database };
bot.snippets = {};
for (const s of SNIPPETS) {
  const src = sources[s.file];
  const a = s.start.exec(src);
  if (!a) throw new Error(`[extract-data] Snippet "${s.id}": start not found in ${s.file}`);
  const rest = src.slice(a.index);
  const b = s.end.exec(rest);
  if (!b) throw new Error(`[extract-data] Snippet "${s.id}": end not found in ${s.file}`);
  const lines = rest.slice(0, b.index).replace(/\s+$/, '').split('\n');
  const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length));
  bot.snippets[s.id] = {
    file: s.file,
    line: src.slice(0, a.index).split('\n').length,
    code: lines.map((l) => l.slice(indent)).join('\n'),
  };
}

// FSM state groups, straight from the class definitions
bot.fsmStates = [...handlers.matchAll(/^class (\w+)\(StatesGroup\):\n((?: {4}\w+ = State\(\)\n)+)/gm)].map((m) => ({
  group: m[1],
  states: [...m[2].matchAll(/(\w+) = State\(\)/g)].map((x) => x[1]),
}));

// ---------------------------------------------------------------- the same validation the bot runs at start-up
const inventions = JSON.parse(read('data/inventions.json'));
const history = JSON.parse(read('data/history.json'));
const required = ['id', 'name', 'hall', 'period', 'year', 'inventor', 'country', 'origin', 'features',
  'significance', 'further_facts', 'sources', 'how_it_works', 'map_countries'];
const ids = new Set();
for (const item of inventions) {
  const lost = required.filter((k) => !(k in item));
  if (lost.length) throw new Error(`Invention ${item.id ?? '?'} is missing fields: ${lost}`);
  if (!(String(item.hall) in bot.halls)) throw new Error(`Invention ${item.id} has an invalid hall: ${item.hall}`);
  if (!item.map_countries.length || item.map_countries.some((c) => !(c in bot.countryInfo))) {
    throw new Error(`Invention ${item.id} has invalid map_countries: ${item.map_countries}`);
  }
  if (ids.has(item.id)) throw new Error(`Duplicate invention id: ${item.id}`);
  ids.add(item.id);
}
for (const event of history) {
  const lost = ['month', 'day', 'year', 'kind', 'title', 'text'].filter((k) => !(k in event));
  if (lost.length) throw new Error(`History event ${event.title ?? '?'} is missing fields: ${lost}`);
  const d = new Date(Date.UTC(2001, event.month - 1, event.day));
  if (d.getUTCMonth() !== event.month - 1 || d.getUTCDate() !== event.day) throw new Error(`History event ${event.title} has an impossible date`);
  if (event.related_id != null && !ids.has(event.related_id)) throw new Error(`History event ${event.title} refers to an unknown exhibit: ${event.related_id}`);
}
for (const q of bot.quiz) {
  if (!q.options?.[q.answer]) throw new Error(`Quiz question has no valid answer: ${q.question}`);
}

// ---------------------------------------------------------------- write
mkdirSync(OUT, { recursive: true });
writeFileSync(resolve(OUT, 'bot-data.json'), JSON.stringify(bot, null, 2) + '\n');
copyFileSync(resolve(BOT, 'data/inventions.json'), resolve(OUT, 'inventions.json'));
copyFileSync(resolve(BOT, 'data/history.json'), resolve(OUT, 'history.json'));
if (!existsSync(resolve(OUT, 'image-status.json'))) writeFileSync(resolve(OUT, 'image-status.json'), '{}\n');

console.log(`[extract-data] ${inventions.length} exhibits, ${Object.keys(bot.halls).length} halls, ${history.length} history events, ` +
  `${bot.quiz.length} quiz questions (round of ${bot.quizRoundSize}), ${Object.keys(bot.countryInfo).length} places, ` +
  `${bot.schema.length} tables, ${Object.keys(bot.snippets).length} snippets.`);
