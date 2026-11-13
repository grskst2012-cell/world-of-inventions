// The invention map: an engraved world sheet with an inset for the British Isles and France.
// The list beside it is always there; on small screens it is the whole feature.
import { COUNTRIES, COUNTRY_INFO, COUNTRY_COUNTS, CONTINENTS, countryItems, pad3 } from '../data';
import { $, h, s, whenVisible } from '../ui';

interface Place { d: string; x: number; y: number; clip?: string }
interface Sheet { width: number; height: number; land: string; graticule: string; places: Record<string, Place> }
interface MapData { world: Sheet & { outline: string; insetFrame: { x: number; y: number; width: number; height: number } }; inset: Sheet }

const max = Math.max(...COUNTRY_COUNTS.values());
/** 1 to 4: how densely a country is hatched, by its share of the largest count. */
const level = (c: string) => 1 + Math.min(3, Math.floor((Math.sqrt(COUNTRY_COUNTS.get(c) ?? 0) / Math.sqrt(max)) * 3.999));
const plural = (n: number) => `${n} ${n === 1 ? 'exhibit' : 'exhibits'}`;

export function initMap(): void {
  const root = $('#map');
  const panel = h('div.atlas__panel', { 'aria-live': 'polite' });
  const tip = h('div.atlas__tip', { role: 'tooltip', hidden: true });
  const sheet = h('div.atlas__sheet', {}, tip);
  let selected: string | null = null;

  const select = (country: string, focusPanel = false) => {
    selected = country;
    root.querySelectorAll<HTMLElement | SVGElement>('[data-country]').forEach((el) => {
      const on = el.dataset.country === country;
      el.classList.toggle('is-selected', on);
      if (el instanceof HTMLButtonElement) el.setAttribute('aria-pressed', String(on));
    });
    const items = countryItems(country);
    const title = h('h3.atlas__country', { tabindex: -1 }, h('span', { 'aria-hidden': 'true' }, COUNTRY_INFO[country][0]), ` ${country === 'International' ? 'International / several countries' : country}`);
    panel.replaceChildren(
      title,
      h('p.atlas__sub', {}, `${plural(items.length)} connected with this place.`),
      h('ul.atlas__items', {}, ...items.map((item) =>
        h('li', {}, h('button', { type: 'button', 'data-exhibit': item.id }, h('span.atlas__no', {}, pad3(item.no)), h('span', {}, item.name), h('span.atlas__year', {}, item.year))))));
    if (focusPanel) title.focus({ preventScroll: true });
  };

  // ---- the ledger of countries (grouped by continent, like the bot's map screen)
  const groups: [string, string[]][] = CONTINENTS.map(([continent]) => [continent, COUNTRIES.filter((c) => COUNTRY_INFO[c][1] === continent)] as [string, string[]]).filter(([, list]) => list.length);
  if (COUNTRY_COUNTS.has('International')) groups.push(['Several countries', ['International']]);
  const ledger = h('div.atlas__ledger', {}, ...groups.map(([continent, list]) =>
    h('div.atlas__group', {}, h('h3', {}, continent),
      h('ul', {}, ...list.map((c) =>
        h('li', {}, h('button', { type: 'button', 'data-country': c, 'aria-pressed': 'false', onclick: () => select(c) },
          h('span.atlas__flag', { 'aria-hidden': 'true' }, COUNTRY_INFO[c][0]),
          h('span.atlas__name', {}, c),
          h('span.atlas__bar', { 'aria-hidden': 'true', style: `--w:${((COUNTRY_COUNTS.get(c)! / max) * 100).toFixed(1)}%` }),
          h('span.atlas__n', {}, String(COUNTRY_COUNTS.get(c)), h('span.sr-only', {}, ' exhibits')))))))));

  root.append(sheet, h('div.atlas__side', {}, ledger, panel));
  select(COUNTRIES[0]);

  // ---- the engraved sheet, loaded only when the section comes into view
  whenVisible(root, async () => {
    const data = (await import('../data/generated/world-map.json')).default as unknown as MapData;
    const { world, inset } = data;

    const showTip = (country: string, target: Element) => {
      const a = target.getBoundingClientRect();
      const b = sheet.getBoundingClientRect();
      tip.replaceChildren(h('span', { 'aria-hidden': 'true' }, COUNTRY_INFO[country][0]), h('b', {}, country), h('span', {}, plural(COUNTRY_COUNTS.get(country) ?? 0)));
      tip.hidden = false;
      tip.style.left = `${Math.min(b.width - 12, Math.max(12, a.left + a.width / 2 - b.left))}px`;
      tip.style.top = `${a.top - b.top}px`;
    };
    const place = (country: string, p: Place, clipId?: string) => {
      const g = s('g', {
        class: `place place--l${level(country)}${selected === country ? ' is-selected' : ''}`, 'data-country': country, tabindex: 0, role: 'button',
        'aria-label': `${country}: ${plural(COUNTRY_COUNTS.get(country) ?? 0)}`,
      }, s('path', { d: p.d, 'clip-path': clipId ? `url(#${clipId})` : null }), s('path', { d: p.d, class: 'place__hatch', 'clip-path': clipId ? `url(#${clipId})` : null }));
      g.addEventListener('click', () => select(country));
      g.addEventListener('keydown', (e) => { const k = (e as KeyboardEvent).key; if (k === 'Enter' || k === ' ') { e.preventDefault(); select(country, true); } });
      g.addEventListener('pointerenter', () => showTip(country, g));
      g.addEventListener('focus', () => showTip(country, g));
      g.addEventListener('pointerleave', () => { tip.hidden = true; });
      g.addEventListener('blur', () => { tip.hidden = true; });
      return g;
    };
    const label = (text: string, x: number, y: number, cls = 'atlas__label') => s('text', { x, y, class: cls, 'text-anchor': 'middle' }, text);
    const hatch = (id: string, gap: number) => s('pattern', { id, width: gap, height: gap, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(38)' }, s('line', { x1: 0, y1: 0, x2: 0, y2: gap, class: 'hatch-line' }));

    const f = world.insetFrame;
    const worldSvg = s('svg', { viewBox: `0 0 ${world.width} ${world.height}`, class: 'atlas__world', role: 'group', 'aria-label': 'World map of the countries the exhibits came from' },
      s('defs', {}, hatch('hatch-1', 7), hatch('hatch-2', 5), hatch('hatch-3', 3.5), hatch('hatch-4', 2.4)),
      s('path', { d: world.outline, class: 'atlas__sphere' }),
      s('path', { d: world.graticule, class: 'atlas__grat' }),
      s('path', { d: world.land, class: 'atlas__land' }),
      ...Object.entries(world.places).filter(([c]) => COUNTRY_COUNTS.has(c)).flatMap(([c, p]) => [place(c, p), label(c, p.x, p.y)]),
      s('rect', { x: f.x, y: f.y, width: f.width, height: f.height, class: 'atlas__frame' }),
      s('text', { x: f.x + f.width / 2, y: f.y - 6, class: 'atlas__note', 'text-anchor': 'middle' }, 'see inset'));

    const insetSvg = s('svg', { viewBox: `0 0 ${inset.width} ${inset.height}`, class: 'atlas__inset', role: 'group', 'aria-label': 'Inset map: the British Isles and France' },
      s('defs', {}, ...Object.entries(inset.places).filter(([, p]) => p.clip).map(([c, p]) => s('clipPath', { id: `clip-${c}` }, s('polygon', { points: p.clip! })))),
      s('rect', { width: inset.width, height: inset.height, class: 'atlas__sea' }),
      s('path', { d: inset.graticule, class: 'atlas__grat' }),
      s('path', { d: inset.land, class: 'atlas__land' }),
      ...Object.values(inset.places).filter((p) => p.clip).slice(0, 1).map((p) => s('path', { d: p.d, class: 'atlas__land' })),
      ...Object.entries(inset.places).filter(([c]) => COUNTRY_COUNTS.has(c)).flatMap(([c, p]) => [place(c, p, p.clip ? `clip-${c}` : undefined), label(c, p.x, p.y)]),
      s('rect', { width: inset.width, height: inset.height, class: 'atlas__frame' }));

    sheet.append(worldSvg, h('div.atlas__lower', {},
      h('figure.atlas__insetbox', {}, insetSvg, h('figcaption', {}, 'Inset: the British Isles and France')),
      h('div.atlas__titleblock', {},
        s('svg', { viewBox: '-60 -62 120 124', class: 'atlas__rose', 'aria-hidden': 'true' }, compass(0, 0)),
        h('p.atlas__title', { 'aria-hidden': 'true' }, 'A Map of the World, shewing whence the Inventions came'),
        h('p.atlas__legend', {}, h('span', {}, 'Shading by number of exhibits'), h('span.atlas__sws', {}, ...[1, 2, 3, 4].map((n) => h('i', { class: `sw sw--${n}`, 'aria-hidden': 'true' }))), h('span', {}, `from 1 to ${max}`)))));
  });
}

function compass(cx: number, cy: number): SVGElement {
  const g = s('g', { class: 'atlas__compass', transform: `translate(${cx} ${cy})`, 'aria-hidden': 'true' });
  g.append(s('circle', { r: 34 }), s('circle', { r: 27, 'stroke-dasharray': '1 4' }));
  for (let i = 0; i < 8; i++) {
    const long = i % 2 === 0;
    g.append(s('path', { d: `M0 ${long ? -44 : -24}L${long ? 5 : 3.5} 0L0 ${long ? 44 : 24}L${long ? -5 : -3.5} 0Z`, transform: `rotate(${i * 45})`, class: i % 2 ? 'minor' : 'major' }));
  }
  g.append(s('text', { y: -50, 'text-anchor': 'middle' }, 'N'));
  return g;
}
