// Small DOM helpers shared by every section.
import { botStartUrl } from './config';
import { BOT, pad3, altText, type Exhibit, type Btn } from './data';
import type { Screen } from './bot';

type Child = Node | string | null | undefined | false;
type Attrs = Record<string, string | number | boolean | null | undefined | ((e: any) => void)>;

/** Hyperscript: h('button.plinth', { type: 'button', onclick }, child, ...) */
export function h<K extends keyof HTMLElementTagNameMap>(spec: K | `${K}.${string}`, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const [tag, ...classes] = spec.split('.');
  const el = document.createElement(tag) as HTMLElementTagNameMap[K];
  if (classes.length) el.className = classes.join(' ');
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (typeof value === 'function') el.addEventListener(key.replace(/^on/, ''), value as EventListener);
    else if (key === 'class') el.className += ` ${value}`;
    else el.setAttribute(key, value === true ? '' : String(value));
  }
  el.append(...(children.filter((c) => c != null && c !== false) as (Node | string)[]));
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
export function s(tag: string, attrs: Record<string, string | number | null | undefined> = {}, ...children: (Node | string)[]): SVGElement {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) if (value != null) el.setAttribute(key, String(value));
  el.append(...children);
  return el;
}

export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T => {
  const el = root.querySelector<T>(sel);
  if (!el) throw new Error(`Missing element: ${sel}`);
  return el;
};
export const reducedMotion = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Run `fn` once, the first time `el` comes near the viewport. */
export function whenVisible(el: Element, fn: () => void, rootMargin = '200px'): void {
  if (!('IntersectionObserver' in window)) { fn(); return; }
  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) { io.disconnect(); fn(); }
  }, { rootMargin });
  io.observe(el);
}

/** A button that opens the bot; with `start` the bot opens that screen right away (see botStartUrl). */
export function botLink(label: string, cls = 'btn btn--primary', start?: string): HTMLAnchorElement {
  return h('a', { class: cls, href: botStartUrl(start), target: '_blank', rel: 'noopener' }, h('span', {}, label), arrowIcon());
}
export function arrowIcon(): SVGElement {
  return s('svg', { viewBox: '0 0 16 16', width: 14, height: 14, 'aria-hidden': 'true', class: 'icon-arrow' },
    s('path', { d: 'M3 13 13 3M6 3h7v7', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5 }));
}

// ------------------------------------------------------------------ exhibit images
const widthUrl = (url: string, width: number) => url.replace(/width=\d+/, `width=${width}`);

/** The engraved plate that stands in for a missing or broken photograph. */
export function plate(item: Exhibit, variant: 'thumb' | 'full'): HTMLElement {
  // Thumbnails sit inside buttons that already name the exhibit, so the plate stays silent there.
  const a11y = variant === 'full' ? { role: 'img', 'aria-label': `${item.name}: no photograph, the exhibit is being restored` } : { 'aria-hidden': 'true' };
  return h('div.plate', a11y,
    h('span.plate__no', { 'aria-hidden': 'true' }, pad3(item.no)),
    variant === 'full'
      ? h('span.plate__note', { 'aria-hidden': 'true' }, 'This exhibit is being restored')
      : h('span.plate__note', { 'aria-hidden': 'true' }, 'plate in restoration'));
}

/** A framed exhibit picture with lazy loading, reserved space and a graceful fallback. */
export function exhibitImage(item: Exhibit, variant: 'thumb' | 'full'): HTMLElement {
  const frame = h('div.frame', { class: `frame--${variant}` });
  if (!item.image || !item.image_url) {
    frame.classList.add('frame--plate');
    frame.append(plate(item, variant));
    return frame;
  }
  const { width, height, file } = item.image;
  const img = h('img', {
    alt: altText(item),
    loading: 'lazy',
    decoding: 'async',
    crossorigin: 'anonymous',
    referrerpolicy: 'no-referrer',
    width: variant === 'thumb' ? 330 : width,
    height: variant === 'thumb' ? Math.round((330 * height) / width) : height,
    src: variant === 'thumb' ? (item.image.thumb ?? widthUrl(item.image_url, 330)) : (item.image.src ?? item.image_url),
  });
  if (/\.svg$/i.test(file)) frame.classList.add('frame--logo');
  frame.classList.add('is-loading');
  img.addEventListener('load', () => frame.classList.remove('is-loading'));
  img.addEventListener('error', () => {
    frame.classList.remove('is-loading');
    frame.classList.add('frame--plate');
    frame.replaceChildren(plate(item, variant));
  });
  frame.append(img);
  return frame;
}

// ------------------------------------------------------------------ mock Telegram messages
// These are pictures of the bot's screens, not controls: the keys are spans and the
// whole mock is hidden from assistive technology (each one has a text description beside it).
export function keyboardEl(rows: Btn[][]): HTMLElement {
  return h('div.tg-kb', {}, ...rows.map((row) => h('div.tg-kb__row', {}, ...row.map((b) => h('span.tg-key', { 'data-cb': b.cb }, b.text)))));
}
export function messageEl(screen: Screen, opts: { clampText?: number } = {}): HTMLElement {
  const bubble = h('div.tg-bubble');
  if (screen.photo?.image_url) {
    const img = h('img.tg-photo', { alt: '', crossorigin: 'anonymous', referrerpolicy: 'no-referrer', src: screen.photo.image?.thumb ?? widthUrl(screen.photo.image_url, 330), width: 330, height: Math.round((330 * screen.photo.image!.height) / screen.photo.image!.width), decoding: 'async' });
    img.addEventListener('error', () => img.remove());
    bubble.append(img);
  }
  const text = opts.clampText && screen.text.length > opts.clampText ? screen.text.slice(0, opts.clampText).replace(/\s+\S*$/, '') + ' …' : screen.text;
  bubble.append(h('p.tg-text', {}, text));
  const msg = h('div.tg-msg', {}, bubble);
  if (screen.keyboard.length) msg.append(keyboardEl(screen.keyboard));
  return msg;
}
export const userBubble = (text: string): HTMLElement => h('div.tg-msg.tg-msg--user', {}, h('div.tg-bubble', {}, h('p.tg-text', {}, text)));

/** The round museum token used as the logo, the bot avatar and the favicon. */
export function tokenIcon(size = 28): SVGElement {
  return s('svg', { viewBox: '0 0 64 64', width: size, height: size, 'aria-hidden': 'true', class: 'token' },
    s('circle', { cx: 32, cy: 32, r: 30, fill: 'none', stroke: 'currentColor', 'stroke-width': 2 }),
    s('circle', { cx: 32, cy: 32, r: 24.5, fill: 'none', stroke: 'currentColor', 'stroke-width': 1, 'stroke-dasharray': '1.5 3' }),
    s('circle', { cx: 32, cy: 9.5, r: 2.4, fill: 'currentColor' }),
    s('path', { d: 'M17 26l5.2 17 5-12.5L32 43l4.8-12.5 5 12.5L47 26', fill: 'none', stroke: 'currentColor', 'stroke-width': 3, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
}

export const MUSEUM = BOT.museumName as string;
