import '@fontsource-variable/fraunces/full.css';
import '@fontsource-variable/fraunces/opsz-italic.css';
import '@fontsource-variable/hanken-grotesk/wght.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import './styles/base.css';
import './styles/halls.css';
import './styles/sections.css';
import './styles/chat.css';

import { $, tokenIcon } from './ui';
import { initModal } from './modal';
import { initHero } from './sections/hero';
import { initLedger } from './sections/ledger';
import { initHalls } from './sections/halls';
import { initExplorer } from './sections/explorer';
import { initMap } from './sections/map';
import { initToday } from './sections/today';
import { initQuiz } from './sections/quiz';
import { initFeatures } from './sections/features';
import { initHood } from './sections/hood';
import { initTeam, initFooter } from './sections/closing';

function initTheme(): void {
  const root = document.documentElement;
  const toggle = $<HTMLButtonElement>('#theme-toggle');
  const paint = () => {
    const night = root.dataset.theme === 'dark';
    toggle.setAttribute('aria-pressed', String(night));
    toggle.setAttribute('aria-label', night ? 'Lights are off: night museum. Switch the lights on.' : 'Lights are on: day museum. Switch the lights off.');
  };
  toggle.addEventListener('click', () => {
    root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('woi-theme', root.dataset.theme); } catch { /* private mode: the choice lasts for this visit */ }
    paint();
  });
  paint();
}

function initNav(): void {
  $('#nav-token').append(tokenIcon(30));
  const nav = $('#nav');
  const menu = $<HTMLButtonElement>('#nav-menu');
  const links = $('#nav-links');
  const close = () => { nav.classList.remove('is-open'); menu.setAttribute('aria-expanded', 'false'); };
  menu.addEventListener('click', () => {
    const open = nav.classList.toggle('is-open');
    menu.setAttribute('aria-expanded', String(open));
  });
  links.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('a')) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && nav.classList.contains('is-open')) { close(); menu.focus(); } });
  const onScroll = () => nav.classList.toggle('is-stuck', scrollY > 24);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

// Each section is independent: if one fails, the rest of the museum stays open.
const run = (name: string, init: () => void) => {
  try { init(); } catch (error) { console.error(`Section "${name}" failed to start`, error); }
};
// The entrance is built at once. The rooms behind it are built one per task,
// so the browser can paint and answer input in between.
run('theme', initTheme);
run('nav', initNav);
run('hero', initHero);
const later: [string, () => void][] = [
  ['ledger', initLedger], ['halls', initHalls], ['catalogue', initExplorer], ['map', initMap], ['this day', initToday],
  ['quiz', initQuiz], ['guide', initFeatures], ['workshop', initHood], ['team', initTeam], ['footer', initFooter], ['modal', initModal],
];
const next = () => {
  const step = later.shift();
  if (step) { run(...step); setTimeout(next, 0); return; }
  // A link straight to a section or an exhibit: the page has its final height only now.
  const target = location.hash.length > 1 && !location.hash.startsWith('#exhibit/') ? document.getElementById(location.hash.slice(1)) : null;
  target?.scrollIntoView();
  document.documentElement.classList.add('is-ready');
};
setTimeout(next, 0);
