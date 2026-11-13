// The accession register: the collection in numbers, each one counted from the data.
import gsap from 'gsap';
import { STATS } from '../data';
import { $, h, reducedMotion, whenVisible } from '../ui';

export function initLedger(): void {
  const rows: [number, string, string][] = [
    [STATS.exhibits, 'exhibits on display', 'inventions.json'],
    [STATS.halls, 'halls, one per era', 'HALLS in handlers.py'],
    [STATS.span, `years of history, ${STATS.yearMin} to ${STATS.yearMax}`, 'first and last exhibit'],
    [STATS.events, 'dates in the calendar', 'history.json'],
    [STATS.questions, 'questions in the quiz bank', 'QUIZ in handlers.py'],
  ];
  const list = $('#ledger-rows');
  const cells: { el: HTMLElement; value: number; width: number }[] = [];
  list.replaceChildren(...rows.map(([value, label, source], i) => {
    const digits = h('span.ledger__digits', { 'aria-hidden': 'true' });
    cells.push({ el: digits, value, width: String(value).length });
    return h('li.ledger__row', {},
      h('span.ledger__line', { 'aria-hidden': 'true' }, `L.${i + 1}`),
      h('span.ledger__value', {}, h('span.sr-only', {}, String(value)), digits),
      h('span.ledger__label', {}, label),
      h('span.ledger__src', {}, source));
  }));
  const paint = (cell: (typeof cells)[number], n: number) => {
    cell.el.replaceChildren(...String(Math.round(n)).padStart(cell.width, '0').split('').map((d) => h('span.flap', {}, d)));
  };
  cells.forEach((cell) => paint(cell, cell.value));
  if (reducedMotion()) return;
  cells.forEach((cell) => paint(cell, 0));
  whenVisible(list, () => {
    cells.forEach((cell, i) => {
      const state = { n: 0 };
      gsap.to(state, { n: cell.value, duration: 1.3, delay: i * 0.12, ease: 'power2.out', onUpdate: () => paint(cell, state.n), onComplete: () => paint(cell, cell.value) });
    });
  }, '-40px');
}
