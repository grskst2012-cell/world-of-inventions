// The display case: one <dialog> shared by the halls, the catalogue, the map and "This Day".
import { BY_ID, HALLS, accession, hallItems, COUNTRY_INFO, type Exhibit } from './data';
import { h, s, exhibitImage, botLink } from './ui';

let dialog: HTMLDialogElement;
let body: HTMLElement;
let current: Exhibit | null = null;
let opener: HTMLElement | null = null;
let hashBefore = '';

/** Splits prose into sentences without breaking on initials such as "J. W. Horton". */
function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])(?<![A-Z]\.)\s+(?=[A-Z0-9“"'(])/).map((x) => x.trim()).filter(Boolean);
}

function neighbours(item: Exhibit) {
  const list = hallItems(item.hall);
  const i = list.indexOf(item);
  const n = list.length;
  return { prev: list[(i - 1 + n) % n], next: list[(i + 1) % n], index: i + 1, count: n };
}

function field(label: string, value: string): HTMLElement {
  return h('div.vitrine__field', {}, h('dt', {}, label), h('dd', {}, value));
}

function render(item: Exhibit): void {
  current = item;
  const hall = HALLS[item.hall];
  const { prev, next, index, count } = neighbours(item);
  const flags = item.map_countries.map((c) => COUNTRY_INFO[c]?.[0]).filter(Boolean).join(' ');
  dialog.dataset.hall = item.hall;
  dialog.setAttribute('aria-label', `${item.name}, ${item.year}`);

  const credit = item.image
    ? h('p.vitrine__credit', {},
        `${item.name}, ${item.year}. Image: `,
        item.image.page ? h('a', { href: item.image.page, target: '_blank', rel: 'noopener' }, item.image_credit ?? 'Wikimedia Commons') : (item.image_credit ?? 'Wikimedia Commons'),
        item.image.artist ? `, ${item.image.artist}` : '',
        item.image.license ? `, ${item.image.license}` : '', '.')
    : h('p.vitrine__credit', {}, `${item.name}, ${item.year}. The photograph for this exhibit is not on display yet.`);

  const steps = sentences(item.how_it_works);
  const how = h('section.blueprint', { 'aria-labelledby': 'vitrine-how' },
    h('header.blueprint__head', {},
      h('h3', { id: 'vitrine-how' }, 'How it works'),
      h('span.blueprint__fig', {}, `Fig. ${item.no} · ${steps.length} ${steps.length === 1 ? 'step' : 'steps'}`)),
    h('ol.blueprint__steps', {}, ...steps.map((text, i) => h('li', {}, h('span.blueprint__n', { 'aria-hidden': 'true' }, String.fromCharCode(65 + i)), h('p', {}, text)))));

  body.replaceChildren(
    h('div.vitrine__media', {}, exhibitImage(item, 'full'), credit),
    h('div.vitrine__text', {},
      h('p.vitrine__acc', {}, accession(item)),
      h('h2.vitrine__title', { id: 'vitrine-title', tabindex: -1 }, item.name),
      h('p.vitrine__hall', {}, `Hall ${item.hall}: ${hall.name}, ${hall.title}`),
      h('dl.vitrine__facts', {},
        field('Inventor', item.inventor),
        field('Year', item.year),
        field('Country / context', flags ? `${item.country}  ${flags}` : item.country),
        field('Period', item.period)),
      h('section.vitrine__prose', {},
        h('h3', {}, 'Origin'), h('p', {}, item.origin),
        h('h3', {}, 'Features'), h('p', {}, item.features),
        h('h3', {}, 'Significance'), h('p', {}, item.significance),
        h('h3', {}, 'Further facts'), h('p', {}, item.further_facts)),
      how,
      item.sources.length
        ? h('section.vitrine__sources', {}, h('h3', {}, 'Sources'),
            h('ul', {}, ...item.sources.map((src) => h('li', {}, h('a', { href: src.url, target: '_blank', rel: 'noopener' }, src.title)))))
        : null,
      h('div.vitrine__cta', {}, botLink('Open this exhibit in the bot', 'btn btn--primary', `item_${item.id}`))),
  );
  dialog.querySelector('.vitrine__pos')!.textContent = `${index} / ${count} in Hall ${item.hall}`;
  dialog.querySelector<HTMLButtonElement>('[data-nav="prev"]')!.setAttribute('aria-label', `Previous exhibit: ${prev.name}`);
  dialog.querySelector<HTMLButtonElement>('[data-nav="next"]')!.setAttribute('aria-label', `Next exhibit: ${next.name}`);
  body.scrollTop = 0;
  history.replaceState(null, '', `#exhibit/${item.id}`);
}

function step(dir: 1 | -1): void {
  if (!current) return;
  const { prev, next } = neighbours(current);
  render(dir === 1 ? next : prev);
  body.querySelector<HTMLElement>('#vitrine-title')?.focus({ preventScroll: true });
}

export function openExhibit(id: string, from?: HTMLElement | null): void {
  const item = BY_ID.get(id);
  if (!item) return;
  if (!dialog.open) {
    opener = from ?? (document.activeElement as HTMLElement | null);
    hashBefore = location.hash.startsWith('#exhibit/') ? '' : location.hash;
    render(item);
    document.documentElement.classList.add('is-locked');
    dialog.showModal();
    body.scrollTop = 0; // a closed dialog cannot be scrolled, so reset once it is on screen
  } else render(item);
}

export function initModal(): void {
  const chevron = (d: string) => s('svg', { viewBox: '0 0 16 16', width: 16, height: 16, 'aria-hidden': 'true' }, s('path', { d, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5 }));
  body = h('div.vitrine__body');
  dialog = h('dialog.vitrine', { id: 'vitrine' },
    h('div.vitrine__bar', {},
      h('button.vitrine__nav', { type: 'button', 'data-nav': 'prev', onclick: () => step(-1) }, chevron('M10 2 4 8l6 6'), h('span', {}, 'Prev')),
      h('span.vitrine__pos', { 'aria-live': 'polite' }),
      h('button.vitrine__nav', { type: 'button', 'data-nav': 'next', onclick: () => step(1) }, h('span', {}, 'Next'), chevron('M6 2l6 6-6 6')),
      h('button.vitrine__close', { type: 'button', 'aria-label': 'Close the display case', onclick: () => dialog.close() }, chevron('M3 3l10 10M13 3 3 13'), h('span', {}, 'Close'))),
    body);
  document.body.append(dialog);

  dialog.addEventListener('close', () => {
    document.documentElement.classList.remove('is-locked');
    history.replaceState(null, '', hashBefore || location.pathname + location.search);
    current = null;
    opener?.focus({ preventScroll: true });
  });
  // a click on the dimmed backdrop closes the case
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') step(1);
    else if (e.key === 'ArrowLeft') step(-1);
  });
  // swipe between exhibits on touch screens
  let startX = 0;
  let startY = 0;
  dialog.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; startY = e.touches[0].clientY; }, { passive: true });
  dialog.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.8) step(dx < 0 ? 1 : -1);
  }, { passive: true });

  // any element with data-exhibit opens the case
  document.addEventListener('click', (e) => {
    const trigger = (e.target as HTMLElement).closest<HTMLElement>('[data-exhibit]');
    if (trigger) { e.preventDefault(); openExhibit(trigger.dataset.exhibit!, trigger); }
  });
  const fromHash = () => { const m = /^#exhibit\/(.+)$/.exec(location.hash); if (m) openExhibit(decodeURIComponent(m[1])); };
  window.addEventListener('hashchange', fromHash);
  fromHash();
}
