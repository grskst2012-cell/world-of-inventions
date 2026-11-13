// The Halls: four rooms on one timeline. On wide screens vertical scrolling walks
// the visitor sideways through them; elsewhere the rooms simply stack.
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { HALLS, HALL_IDS, hallItemsByYear, pad3 } from '../data';
import { $, h, exhibitImage, botLink } from '../ui';

gsap.registerPlugin(ScrollTrigger);

const MORSE: Record<string, string> = {
  a: '.-', b: '-...', c: '-.-.', d: '-..', e: '.', f: '..-.', g: '--.', h: '....', i: '..', j: '.---', k: '-.-', l: '.-..', m: '--',
  n: '-.', o: '---', p: '.--.', q: '--.-', r: '.-.', s: '...', t: '-', u: '..-', v: '...-', w: '.--', x: '-..-', y: '-.--', z: '--..',
};
const toMorse = (text: string) => text.toLowerCase().split('').map((c) => (c === ' ' ? '/' : MORSE[c] ?? '')).filter(Boolean).join(' ').replace(/\./g, '•').replace(/-/g, '▬');

// A dry aside for the margin of each room. Opinion only, no facts.
const ASIDES = [
  'Mind the candle wax on the floor.',
  'Please do not feed the engines.',
  'The warm glow is the valves waking up.',
  'No flash photography. The exhibits flash back.',
];

export function initHalls(): void {
  const stage = $('#halls-stage');
  const track = $('#halls-track');
  const hudName = $('#halls-hud-name');
  const jumps = $('#halls-jumps');
  const progress = $('#halls-progress');

  const rooms = HALL_IDS.map((id, n) => {
    const hall = HALLS[id];
    const items = hallItemsByYear(id);
    const wall = h('ol.room__wall', { style: `--n:${items.length}` },
      ...items.map((item, i) =>
        h('li.plinth', { class: i % 2 ? 'plinth--low' : 'plinth--high', style: `--i:${i}` },
          h('button.plinth__btn', { type: 'button', 'data-exhibit': item.id },
            exhibitImage(item, 'thumb'),
            h('span.plinth__cap', {}, h('span.plinth__no', {}, `No. ${pad3(item.no)}`), h('span.plinth__name', {}, item.name), h('span.sr-only', {}, `, ${item.year}`))),
          h('span.plinth__year', { 'aria-hidden': 'true' }, item.year))));
    // Hall 2's rail is a telegraph tape that spells the hall's own name in Morse code.
    if (id === HALL_IDS[1]) wall.dataset.tape = `${toMorse(hall.name)}   `.repeat(10);
    const room = h('section.room', { 'data-hall': id, 'aria-labelledby': `room-${id}` },
      h('div.room__intro', {},
        h('p.room__no', {}, `Hall ${id}`),
        h('h3.room__name', { id: `room-${id}` }, hall.name),
        h('p.room__period', {}, hall.title),
        h('p.room__desc', {}, hall.description),
        h('p.room__meta', {}, `${items.length} exhibits · ${items[0]?.year ?? ''} to ${items[items.length - 1]?.year ?? ''}`),
        h('p.room__aside', {}, ASIDES[n % ASIDES.length]),
        botLink(`Open Hall ${id} in the bot`, 'btn btn--ghost btn--small room__bot', `hall${id}`)),
      h('div.room__gallery', {}, wall));
    track.append(room);
    return room;
  });

  const segs = HALL_IDS.map((id) => h('span.halls__seg', { 'data-hall': id }, h('i', {}, HALLS[id].title)));
  const marker = h('span.halls__marker');
  progress.append(...segs, marker);

  let st: ScrollTrigger | null = null;
  const navHeight = () => document.getElementById('nav')?.offsetHeight ?? 0;
  const maxShift = () => Math.max(0, track.scrollWidth - stage.clientWidth);
  const scrollToX = (x: number) => {
    if (!st) return;
    const max = maxShift();
    const p = max ? Math.min(1, Math.max(0, x / max)) : 0;
    window.scrollTo({ top: st.start + p * (st.end - st.start), behavior: 'smooth' });
  };

  jumps.append(...HALL_IDS.map((id, i) =>
    h('button', {
      type: 'button', 'data-hall': id, 'aria-label': `Go to Hall ${id}: ${HALLS[id].name}`,
      onclick: () => (st ? scrollToX(rooms[i].offsetLeft) : rooms[i].scrollIntoView({ behavior: 'smooth' })),
    }, id)));

  const setActive = (id: string) => {
    if (stage.dataset.hall === id) return;
    stage.dataset.hall = id;
    hudName.textContent = `Hall ${id} · ${HALLS[id].name} · ${HALLS[id].title}`;
    jumps.querySelectorAll('button').forEach((b) => b.toggleAttribute('aria-current', b.dataset.hall === id));
  };
  setActive(HALL_IDS[0]);

  const layoutProgress = () => {
    const total = track.scrollWidth || 1;
    rooms.forEach((room, i) => { segs[i].style.flexGrow = String(room.offsetWidth / total); });
  };

  const mm = gsap.matchMedia();
  mm.add('(min-width: 960px) and (min-height: 600px) and (prefers-reduced-motion: no-preference)', () => {
    stage.classList.add('is-horizontal');
    layoutProgress();
    const tween = gsap.to(track, {
      x: () => -maxShift(),
      ease: 'none',
      scrollTrigger: {
        trigger: stage,
        pin: true,
        scrub: 0.5,
        start: () => `top ${navHeight()}px`,
        end: () => `+=${maxShift()}`,
        invalidateOnRefresh: true,
        onRefresh: layoutProgress,
        onUpdate: (self) => {
          const centre = self.progress * maxShift() + stage.clientWidth / 2;
          const room = [...rooms].reverse().find((r) => r.offsetLeft <= centre) ?? rooms[0];
          setActive(room.dataset.hall!);
          marker.style.transform = `translateX(${(self.progress * progress.clientWidth).toFixed(1)}px)`;
        },
      },
    });
    st = tween.scrollTrigger!;
    // Keyboard users: bring a focused exhibit into view by scrolling the page to its place on the track.
    const onFocus = (e: FocusEvent) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>('.plinth, .room__intro');
      if (!target || !st) return;
      stage.scrollLeft = 0;
      const box = target.getBoundingClientRect();
      if (box.left >= 40 && box.right <= innerWidth - 40) return;
      const x = box.left - track.getBoundingClientRect().left;
      scrollToX(x - stage.clientWidth / 2 + box.width / 2);
    };
    track.addEventListener('focusin', onFocus);
    return () => {
      track.removeEventListener('focusin', onFocus);
      stage.classList.remove('is-horizontal');
      st = null;
    };
  });

  // Stacked layout: the room under the middle of the screen sets the active hall for the jump list.
  const io = new IntersectionObserver((entries) => {
    if (st) return;
    for (const e of entries) if (e.isIntersecting) setActive((e.target as HTMLElement).dataset.hall!);
  }, { rootMargin: '-45% 0px -45% 0px' });
  rooms.forEach((room) => io.observe(room));

  // "A beam of light": the torch follows the pointer across the walls (night theme only, see CSS).
  stage.addEventListener('pointermove', (e) => {
    const box = stage.getBoundingClientRect();
    stage.style.setProperty('--mx', `${e.clientX - box.left}px`);
    stage.style.setProperty('--my', `${e.clientY - box.top}px`);
  });

  document.fonts?.ready.then(() => ScrollTrigger.refresh());
  window.addEventListener('load', () => ScrollTrigger.refresh());
}
