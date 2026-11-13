// This Day in History: the visitor's own date, run through the bot's rules (see buildHistory in bot.ts).
import { BY_ID, MONTH_NAMES, eraOf } from '../data';
import { buildHistory, type DayRef } from '../bot';
import { $, h } from '../ui';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const pad = (n: number) => String(n).padStart(2, '0');
const toRef = (d: Date): DayRef => ({ year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() });
const iso = (r: DayRef) => `${r.year}-${pad(r.month)}-${pad(r.day)}`;

export function initToday(): void {
  const root = $('#today');
  const now = new Date();
  let date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const isToday = () => iso(toRef(date)) === iso(toRef(new Date()));

  const leaf = h('div.leaf', { 'aria-hidden': 'true' });
  const picker = h('input', { id: 'today-date', type: 'date', 'aria-label': 'Choose a date' });
  const back = h('button.btn.btn--ghost', { type: 'button', hidden: true }, 'Back to today');
  const heading = h('h3.today__heading', { tabindex: -1 });
  const lead = h('p.today__lead');
  const list = h('ol.clippings');
  const shift = (days: number) => { date = new Date(date.getFullYear(), date.getMonth(), date.getDate() + days); render(true); };

  picker.addEventListener('change', () => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(picker.value);
    if (m) { date = new Date(+m[1], +m[2] - 1, +m[3]); render(true); }
  });
  back.addEventListener('click', () => { const t = new Date(); date = new Date(t.getFullYear(), t.getMonth(), t.getDate()); render(true); });

  function render(animate = false): void {
    const ref = toRef(date);
    const result = buildHistory(ref);
    const month = MONTH_NAMES[ref.month - 1];
    picker.value = iso(ref);
    back.hidden = isToday();
    leaf.replaceChildren(
      h('span.leaf__month', {}, month), h('span.leaf__day', {}, String(ref.day)), h('span.leaf__week', {}, `${WEEKDAYS[date.getDay()]}, ${ref.year}`));
    if (animate) { leaf.classList.remove('is-torn'); void leaf.offsetWidth; leaf.classList.add('is-torn'); }
    heading.textContent = `${isToday() ? 'Today,' : 'On'} ${ref.day} ${month}`;
    lead.textContent = result.exact
      ? `${result.entries.length === 1 ? 'One entry' : `${result.entries.length} entries`} in the museum calendar for this date.`
      : 'No invention or discovery in our calendar is dated exactly today. The closest ones are:';
    list.replaceChildren(...result.entries.map(({ event, dayLabel, when }) => {
      const exhibit = event.related_id ? BY_ID.get(event.related_id) : undefined;
      return h('li.clipping', { 'data-era': eraOf(event.year) },
        h('p.clipping__meta', {}, h('span.clipping__kind', {}, event.kind), h('span', {}, `${dayLabel} ${event.year}`), when ? h('span.clipping__when', {}, when) : null),
        h('h4.clipping__title', {}, event.title),
        h('p.clipping__text', {}, event.text),
        exhibit ? h('button.clipping__link', { type: 'button', 'data-exhibit': exhibit.id }, `See the exhibit: ${exhibit.name}`) : null);
    }));
  }

  root.append(
    h('div.today__cal', {},
      h('div.leaf-stack', {}, leaf),
      h('div.today__nav', {},
        h('button.btn.btn--ghost', { type: 'button', onclick: () => shift(-1) }, 'Previous day'),
        h('button.btn.btn--ghost', { type: 'button', onclick: () => shift(1) }, 'Next day')),
      h('label.field', { for: 'today-date' }, h('span', {}, 'Jump to a date'), picker),
      back),
    h('div.today__events', { 'aria-live': 'polite' }, heading, lead, list));
  render();
}
