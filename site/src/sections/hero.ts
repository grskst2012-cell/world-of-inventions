// Hero: the phone that plays a real walk through the bot, and the slow gear train behind it.
import { HALL_IDS, hallItems, MUSEUM_NAME, type Exhibit } from '../data';
import { mainScreen, museumScreen, hallsScreen, hallScreen, cardScreen, FAVORITE_REMOVE, FAVORITE_TOAST, type Screen } from '../bot';
import { $, h, s, messageEl, userBubble, tokenIcon, reducedMotion } from '../ui';

/** A virtual clock: scenes await it, so the demo can be paused, slowed and resumed mid-step. */
class Clock {
  speed = 1;
  paused = false;
  private waiters = new Set<{ left: number; done: () => void }>();
  constructor() {
    setInterval(() => {
      if (this.paused) return;
      for (const w of this.waiters) {
        w.left -= 50 * this.speed;
        if (w.left <= 0) { this.waiters.delete(w); w.done(); }
      }
    }, 50);
  }
  wait(ms: number): Promise<void> {
    return new Promise((done) => this.waiters.add({ left: ms, done }));
  }
}

function gearPath(teeth: number, outer: number, root: number): string {
  const step = (Math.PI * 2) / teeth;
  const pt = (r: number, a: number) => `${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r).toFixed(1)}`;
  let d = '';
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    d += `${i ? 'L' : 'M'}${pt(root, a)}L${pt(root, a + step * 0.22)}L${pt(outer, a + step * 0.36)}L${pt(outer, a + step * 0.64)}L${pt(root, a + step * 0.78)}`;
  }
  return d + 'Z';
}
function gear(teeth: number, radius: number, cls: string): SVGElement {
  const spokes = Array.from({ length: 6 }, (_, i) => {
    const a = (i * Math.PI) / 3;
    return s('line', { x1: Math.cos(a) * radius * 0.2, y1: Math.sin(a) * radius * 0.2, x2: Math.cos(a) * radius * 0.72, y2: Math.sin(a) * radius * 0.72 });
  });
  return s('svg', { viewBox: `${-radius - 2} ${-radius - 2} ${radius * 2 + 4} ${radius * 2 + 4}`, class: `gear ${cls}`, 'aria-hidden': 'true' },
    s('path', { d: gearPath(teeth, radius, radius * 0.9) }),
    s('circle', { r: radius * 0.74 }), s('circle', { r: radius * 0.7, 'stroke-dasharray': '1 5' }),
    s('circle', { r: radius * 0.2 }), s('circle', { r: radius * 0.07 }), ...spokes);
}

function pickDemoExhibit(): Exhibit {
  const items = hallItems(HALL_IDS[0]);
  return items.find((item) => cardScreen(item).photo) ?? items[0];
}

export function initHero(): void {
  $('.hero__gears').append(gear(48, 300, 'gear--big'), gear(16, 100, 'gear--small'));

  const item = pickDemoExhibit();
  const chat = h('div.phone__chat');
  const typed = h('span.phone__typed');
  const toast = h('div.phone__toast', {}, FAVORITE_TOAST);
  const phone = h('div.phone', { 'aria-hidden': 'true' },
    h('div.phone__top', {}, h('span.phone__avatar', {}, tokenIcon(22)), h('span.phone__who', {}, h('b', {}, MUSEUM_NAME), h('i', {}, 'bot'))),
    chat, toast,
    h('div.phone__input', {}, typed, h('span.phone__send', {}, s('svg', { viewBox: '0 0 16 16', width: 14, height: 14 }, s('path', { d: 'M2 8h11M9 4l4 4-4 4', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6 })))));

  const screens = h('span', {}, '0');
  const toggle = h('button.phone__toggle', { type: 'button' });
  const note = h('p.phone__note', {},
    h('span', {}, 'Bot messages in this chat: ', h('b', {}, '1')), h('span', {}, 'Screens shown in it: ', h('b', {}, screens)));
  const sr = h('p.sr-only', {},
    `Animated demo of the bot. The visitor sends /start and the main menu appears. They tap Enter the Museum, then Explore the Halls, ` +
    `pick Hall ${item.hall} and open ${item.name}: one message with a photo and its text. A tap on Add Favorite saves it. ` +
    'The bot keeps editing the same message instead of sending new ones.');
  $('#phone').append(phone, h('div.phone__meta', {}, toggle, note), sr);

  const clock = new Clock();
  let userPaused = reducedMotion();
  let onScreen = true;
  const sync = () => {
    clock.paused = userPaused || !onScreen || document.hidden;
    toggle.textContent = userPaused ? 'Play the walkthrough' : 'Pause the walkthrough';
    toggle.setAttribute('aria-pressed', String(userPaused));
    phone.classList.toggle('is-paused', userPaused);
  };
  toggle.addEventListener('click', () => { userPaused = !userPaused; sync(); });
  phone.addEventListener('pointerenter', () => { clock.speed = 0.4; });
  phone.addEventListener('pointerleave', () => { clock.speed = 1; });
  document.addEventListener('visibilitychange', sync);
  new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; sync(); }).observe(phone);

  let message: HTMLElement;
  let shown = 0;
  const scrollChat = (top: number) => chat.scrollTo({ top, behavior: reducedMotion() ? 'auto' : 'smooth' });
  const show = (screen: Screen, edited: boolean) => {
    const next = messageEl(screen);
    if (edited) { message.replaceWith(next); next.classList.add('is-edited'); } else { chat.append(next); next.classList.add('is-new'); }
    message = next;
    screens.textContent = String(++shown);
    scrollChat(chat.scrollHeight);
  };
  const tap = async (cb: string) => {
    const key = message.querySelector<HTMLElement>(`.tg-key[data-cb="${cb}"]`);
    if (!key) return;
    const top = key.offsetTop - chat.clientHeight + key.offsetHeight + 60;
    if (chat.scrollTop < top) { scrollChat(top); await clock.wait(450); }
    key.classList.add('is-tap');
    await clock.wait(560);
  };

  const finalState = () => {
    chat.replaceChildren(userBubble('/start'));
    shown = 4;
    show(cardScreen(item, true), false);
    chat.scrollTop = 0;
  };

  async function scene(): Promise<void> {
    chat.classList.add('is-clearing');
    await clock.wait(450);
    chat.replaceChildren();
    chat.classList.remove('is-clearing');
    shown = 0;
    screens.textContent = '0';
    await clock.wait(600);
    for (const ch of '/start') { typed.textContent += ch; await clock.wait(110); }
    await clock.wait(380);
    typed.textContent = '';
    chat.append(userBubble('/start'));
    await clock.wait(650);
    show(mainScreen(), false);
    await clock.wait(1900);
    await tap('museum'); show(museumScreen(), true);
    await clock.wait(1400);
    await tap('halls'); show(hallsScreen(), true);
    await clock.wait(1400);
    await tap(`hall:${item.hall}`); show(hallScreen(item.hall), true);
    await clock.wait(1600);
    await tap(`item:${item.id}`); show(cardScreen(item), true);
    scrollChat(message.offsetTop - 12);
    await clock.wait(2600);
    await tap(`favorite:toggle:${item.id}`);
    const star = message.querySelector<HTMLElement>(`.tg-key[data-cb="favorite:toggle:${item.id}"]`);
    if (star) { star.textContent = FAVORITE_REMOVE; star.classList.remove('is-tap'); }
    toast.classList.add('is-on');
    await clock.wait(2000);
    toast.classList.remove('is-on');
    await clock.wait(2400);
  }

  finalState();
  sync();
  (async () => { for (;;) await scene(); })();
}
