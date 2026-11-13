// Under the hood: architecture, the real SQLite schema, and real code from the bot.
import { BOT } from '../data';
import { $, h, s } from '../ui';

// ------------------------------------------------------------------ a tiny Python highlighter
const KEYWORDS = new Set(('def async await return if elif else for in not and or with as try except raise import from class lambda while is None True False pass').split(' '));
function highlight(code: string): (Node | string)[] {
  const out: (Node | string)[] = [];
  const re = /("""[\s\S]*?"""|f?"(?:[^"\\\n]|\\.)*"|f?'(?:[^'\\\n]|\\.)*')|(#.*)|(@[\w.]+)|\b(\d+(?:\.\d+)?)\b|([A-Za-z_]\w*)/g;
  let last = 0;
  let prev = '';
  for (const m of code.matchAll(re)) {
    if (m.index! > last) out.push(code.slice(last, m.index));
    const [text, str, comment, decorator, num, word] = m;
    const cls = str ? 'str' : comment ? 'com' : decorator ? 'dec' : num ? 'num' : word && KEYWORDS.has(word) ? 'kw' : word && (prev === 'def' || prev === 'class') ? 'fn' : '';
    out.push(cls ? h('span', { class: `tok-${cls}` }, text) : text);
    if (word) prev = word;
    last = m.index! + text.length;
  }
  out.push(code.slice(last));
  return out;
}
type SnippetId = keyof typeof BOT.snippets;
function snippet(id: SnippetId): HTMLElement {
  const sn = BOT.snippets[id];
  const lines = sn.code.split('\n').length;
  return h('figure.code', {},
    h('figcaption', {}, h('span', {}, sn.file), h('span', {}, `lines ${sn.line} to ${sn.line + lines - 1}`)),
    h('pre', { tabindex: 0, 'aria-label': `Python code from ${sn.file}` }, h('code', {}, ...highlight(sn.code))));
}

// ------------------------------------------------------------------ architecture diagram
interface ArchNode { id: string; label: string; sub: string; kind?: string; wide: [number, number, number, number]; tall: [number, number, number, number] }
const NODES: ArchNode[] = [
  { id: 'tg', label: 'Telegram', sub: 'the visitor’s chat', kind: 'ext', wide: [20, 172, 150, 56], tall: [14, 14, 160, 54] },
  { id: 'bot', label: 'bot.py', sub: 'entry point, polling', wide: [250, 172, 150, 56], tall: [14, 128, 160, 54] },
  { id: 'handlers', label: 'handlers.py', sub: 'router, screens, FSM', kind: 'core', wide: [480, 172, 170, 56], tall: [14, 262, 160, 54] },
  { id: 'keyboards', label: 'keyboards.py', sub: 'inline menus', wide: [480, 40, 170, 56], tall: [206, 262, 160, 54] },
  { id: 'database', label: 'database.py', sub: 'favorites, statistics', wide: [740, 172, 150, 56], tall: [14, 412, 160, 54] },
  { id: 'sqlite', label: 'museum.db', sub: 'SQLite', kind: 'store', wide: [960, 172, 140, 56], tall: [14, 540, 160, 54] },
  { id: 'config', label: 'config.py', sub: 'settings', wide: [250, 320, 150, 56], tall: [206, 128, 160, 54] },
  { id: 'env', label: '.env', sub: 'token, admin id', kind: 'store', wide: [20, 320, 150, 56], tall: [206, 14, 160, 54] },
  { id: 'json', label: 'data/*.json', sub: 'exhibits, calendar', kind: 'store', wide: [740, 320, 170, 56], tall: [206, 412, 160, 54] },
];
interface Edge { wide: string; tall: string; label?: string; wideAt?: [number, number]; tallAt?: [number, number] }
const EDGES: Edge[] = [
  { wide: 'M170 200H250', tall: 'M94 68V128', label: 'updates', wideAt: [210, 190], tallAt: [126, 102] },
  { wide: 'M400 200H480', tall: 'M60 182V262', label: 'router', wideAt: [440, 190], tallAt: [96, 240] },
  { wide: 'M565 172V96', tall: 'M174 289H206', label: 'menus', wideAt: [596, 138] },
  { wide: 'M650 200H740', tall: 'M70 316V412', label: 'user rows', wideAt: [695, 190], tallAt: [118, 386] },
  { wide: 'M890 200H960', tall: 'M94 466V540' },
  { wide: 'M740 348H610V228', tall: 'M286 412V350H140V316', label: 'validated at start-up', wideAt: [676, 366], tallAt: [262, 344] },
  { wide: 'M325 320V228', tall: 'M206 155H174', label: 'token', wideAt: [352, 280] },
  { wide: 'M400 348H530V228', tall: 'M286 182V222H120V262', label: 'name, admin id', wideAt: [465, 366], tallAt: [240, 216] },
  { wide: 'M170 348H250', tall: 'M286 68V128' },
];
function diagram(layout: 'wide' | 'tall'): SVGElement {
  const size = layout === 'wide' ? [1120, 400] : [380, 610];
  const svg = s('svg', {
    viewBox: `0 0 ${size[0]} ${size[1]}`, class: `arch arch--${layout}`, role: 'img',
    'aria-label': 'Architecture: Telegram sends updates to bot.py, which hands them to the router in handlers.py. handlers.py builds menus with keyboards.py, ' +
      'reads the validated JSON content, and stores favorites and statistics through database.py in the SQLite file museum.db. config.py reads the token and admin id from .env.',
  });
  EDGES.forEach((e, i) => {
    svg.append(s('path', { d: e[layout], class: 'arch__wire' }), s('path', { d: e[layout], class: 'arch__flow', style: `animation-delay:${-i * 0.37}s` }));
    const at = layout === 'wide' ? e.wideAt : e.tallAt;
    if (e.label && at) svg.append(s('text', { x: at[0], y: at[1], class: 'arch__edge', 'text-anchor': 'middle' }, e.label));
  });
  for (const n of NODES) {
    const [x, y, w, hgt] = n[layout];
    svg.append(s('g', { class: `arch__node${n.kind ? ` arch__node--${n.kind}` : ''}`, transform: `translate(${x} ${y})` },
      s('rect', { width: w, height: hgt, rx: 2 }),
      s('text', { x: 12, y: 23, class: 'arch__label' }, n.label),
      s('text', { x: 12, y: 42, class: 'arch__sub' }, n.sub)));
  }
  return svg;
}

export function initHood(): void {
  $('#arch').append(diagram('wide'), diagram('tall'));

  $('#schema').append(...BOT.schema.map((t) =>
    h('table.schema', {},
      h('caption', {}, t.table),
      h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Column'), h('th', { scope: 'col' }, 'Type'), h('th', { scope: 'col' }, 'Rule'))),
      h('tbody', {}, ...t.columns.map((c) =>
        h('tr', {}, h('th', { scope: 'row' }, c.name, c.pk ? h('abbr.schema__pk', { title: 'part of the primary key' }, 'PK') : null), h('td', {}, c.type), h('td', {}, c.constraints.replace('PRIMARY KEY', '').trim() || '·')))))));

  const states = BOT.fsmStates.map((g) => g.states.map((st) => `${g.group}.${st}`)).flat();
  const decisions: [string, string, SnippetId][] = [
    ['Content lives in JSON and is checked before the doors open',
      'A new exhibit is an edit to a data file, not to the code. At start-up every record is checked for required fields, a real hall and known map countries. A broken file stops the bot with a named error, before any visitor sees it.', 'validate'],
    ['One message, edited in place',
      'Screens replace each other inside a single bot message. Text is edited directly. A photo cannot turn into text, so the new text is sent first and the old photo removed. Either way the chat never fills up.', 'edit'],
    [`FSM for the ${states.length === 2 ? 'two ' : ''}moments the bot has to listen`,
      `Typed text only means something in ${states.join(' and ')}. Everywhere else the bot points back to the menu. A quiz round (question order, shuffled options, score) travels in the same FSM storage as plain data.`, 'fsm'],
    ['Shuffled answers that still know which one is right',
      'Each round stores the original index of every option next to its shuffled position. The buttons can be reordered freely and the check stays one comparison.', 'quiz'],
    ['Statistics and favorites belong to the visitor',
      'Every row is keyed by the Telegram user id. INSERT OR IGNORE makes “studied” count unique exhibits: opening the same card twice adds nothing.', 'stats'],
  ];
  $('#decisions').append(...decisions.map(([title, why, id]) =>
    h('article.decision', {}, h('div.decision__text', {}, h('h4', {}, title), h('p', {}, why)), snippet(id))));

  $('#nearest-rule').append(snippet('nearest'));
}
