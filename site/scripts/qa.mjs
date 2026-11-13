// Self-check: serves the production build and walks through the site in a real
// browser (the Edge or Chrome already installed), on desktop, on a phone and
// with reduced motion. Prints a report and exits with 1 if anything fails.
//
//   npm run build && node scripts/qa.mjs [folder-for-screenshots]
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';
import { chromium } from 'playwright-core';

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = process.argv[2] ? resolve(process.argv[2]) : null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const BROWSERS = [
  process.env.BROWSER_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].filter(Boolean);
const executablePath = BROWSERS.find((p) => existsSync(p));
if (!executablePath) throw new Error('No Chrome or Edge found. Set BROWSER_PATH.');

const server = await preview({ root: SITE, preview: { port: 4183, strictPort: true, host: '127.0.0.1' } });
const URL = 'http://127.0.0.1:4183/';
const browser = await chromium.launch({ executablePath, headless: true });
const results = [];
const problems = [];
const check = (name, ok, detail = '') => { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); if (!ok) problems.push(name); };

async function open(options, label) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url()}`); });
  page.on('requestfailed', (r) => errors.push(`failed: ${r.url()} ${r.failure()?.errorText}`));
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const shot = async (name, opts = {}) => { if (SHOTS) await page.screenshot({ path: resolve(SHOTS, `${label}-${name}.png`), ...opts }); };
  return { context, page, errors, shot };
}
const toSection = async (page, id) => { await page.evaluate((i) => document.getElementById(i).scrollIntoView({ behavior: 'instant', block: 'start' }), id); await page.waitForTimeout(700); };

// ─────────────────────────────────────────────── desktop, 1440px
{
  const { context, page, errors, shot } = await open({ viewport: { width: 1440, height: 900 } }, 'desktop');
  const stats = await page.evaluate(() => ({
    h1: document.querySelectorAll('h1').length,
    sub: document.querySelector('.hero__sub').textContent,
    ledger: [...document.querySelectorAll('.ledger__value .sr-only')].map((e) => e.textContent),
    rooms: document.querySelectorAll('.room').length,
    plinths: document.querySelectorAll('.plinth').length,
    cards: document.querySelectorAll('.card').length,
    horizontal: document.getElementById('halls-stage').classList.contains('is-horizontal'),
    imgsNoAlt: [...document.querySelectorAll('img')].filter((i) => !i.hasAttribute('alt')).length,
    deadLinks: [...document.querySelectorAll('a')].filter((a) => !a.getAttribute('href') || a.getAttribute('href') === '#').length,
  }));
  console.log('facts on the page:', JSON.stringify(stats));
  check('one h1', stats.h1 === 1);
  check('every exhibit has a plinth and a card', stats.plinths === stats.cards && stats.cards > 0, `${stats.plinths} plinths, ${stats.cards} cards`);
  check('halls travel horizontally on desktop', stats.horizontal);
  check('all images have alt', stats.imgsNoAlt === 0);
  check('no empty or # links', stats.deadLinks === 0);
  await page.waitForTimeout(9000); // let the phone demo reach the exhibit card
  await shot('01-hero');

  // the corridor
  await toSection(page, 'halls-stage');
  const before = await page.evaluate(() => getComputedStyle(document.getElementById('halls-track')).transform);
  await shot('02-hall1');
  for (const [i, f] of [0.3, 0.62, 0.8, 0.97].entries()) {
    await page.evaluate((frac) => { const st = document.querySelector('.pin-spacer'); const top = st.getBoundingClientRect().top + scrollY - document.getElementById('nav').offsetHeight; window.scrollTo(0, top + (st.offsetHeight - document.getElementById('halls-stage').offsetHeight) * frac); }, f);
    await page.waitForTimeout(1500);
    await shot(`03-corridor-${i + 1}`);
  }
  const after = await page.evaluate(() => ({ t: getComputedStyle(document.getElementById('halls-track')).transform, hall: document.getElementById('halls-stage').dataset.hall }));
  check('corridor moves and reaches the last hall', before !== after.t && after.hall === '4', `active hall ${after.hall}`);

  // keyboard: focusing a plinth far down the corridor brings it into view
  await page.locator('.plinth__btn').nth(30).focus();
  await page.waitForTimeout(2200);
  const seen = await page.evaluate(() => { const r = document.activeElement.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; });
  check('corridor follows keyboard focus', seen);

  // display case: mouse, keyboard, focus trap
  await toSection(page, 'catalogue');
  await shot('04-catalogue');
  const firstCard = page.locator('.card__btn').nth(2);
  await firstCard.click();
  await page.waitForTimeout(600);
  check('display case opens on click', await page.evaluate(() => document.getElementById('vitrine').open));
  await page.waitForTimeout(1500);
  await shot('05-case');
  const title1 = await page.locator('#vitrine-title').textContent();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(300);
  check('next exhibit with the keyboard', (await page.locator('#vitrine-title').textContent()) !== title1);
  for (let i = 0; i < 25; i++) await page.keyboard.press('Tab');
  check('focus stays inside the case', await page.evaluate(() => document.getElementById('vitrine').contains(document.activeElement)));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  check('Esc closes the case and returns focus', await page.evaluate(() => !document.getElementById('vitrine').open && document.activeElement?.classList.contains('card__btn')));

  // catalogue search and filters
  await page.fill('#f-q', 'tire');
  check('"tire" finds the tyre (spelling variants)', (await page.locator('.card:not([hidden]) .card__name').allTextContents()).some((t) => /tyre/i.test(t)));
  await page.fill('#f-q', '');
  await page.selectOption('#f-hall', { index: 1 });
  await page.selectOption('#f-country', { index: 1 });
  const combo = await page.locator('.explorer__count').textContent();
  await page.fill('#f-q', 'zzzz');
  check('empty state appears', await page.locator('.explorer__empty').isVisible(), combo);
  await shot('06-catalogue-empty');
  await page.locator('.explorer__empty .btn').click();
  check('reset restores every card', (await page.locator('.card:not([hidden])').count()) === stats.cards);

  // map
  await toSection(page, 'atlas');
  await page.waitForSelector('.atlas__world');
  await page.waitForTimeout(600);
  await page.locator('.place[data-country="Canada"]').click({ force: true });
  check('map: clicking Canada lists its exhibits', /Canada/.test(await page.locator('.atlas__country').textContent()) && (await page.locator('.atlas__items li').count()) > 0);
  await page.locator('.place[data-country="Scotland"]').hover({ force: true });
  await shot('07-map');

  // this day
  await toSection(page, 'this-day');
  const day1 = await page.locator('.today__heading').textContent();
  await page.getByRole('button', { name: 'Next day' }).click();
  check('this day: next day changes the date', (await page.locator('.today__heading').textContent()) !== day1);
  await page.fill('#today-date', `${new Date().getFullYear()}-12-28`);
  await page.locator('#today-date').dispatchEvent('change');
  check('this day: 28 December has exact entries with exhibit links', (await page.locator('.clipping').count()) >= 2 && (await page.locator('.clipping__link').count()) >= 1);
  await shot('08-today');
  await page.getByRole('button', { name: 'Back to today' }).click();

  // quiz, played to the end
  await toSection(page, 'quiz-room');
  await shot('09-quiz');
  let rounds = 0;
  while (await page.locator('.option').count()) {
    await page.locator('.option').first().click();
    await page.waitForTimeout(150);
    if (rounds === 0) await shot('10-quiz-answer');
    await page.locator('.paper__feedback .btn').click();
    rounds++;
    if (rounds > 12) break;
  }
  check('quiz: five questions then a result', rounds === 5 && /You scored \d out of 5/.test(await page.locator('.paper__q').textContent()), `${rounds} questions`);
  await shot('11-quiz-result');
  await page.getByRole('button', { name: 'Play again' }).click();
  check('quiz: play again starts a new round', (await page.locator('.option').count()) === 4);

  for (const [id, name] of [['visitor-guide', '12-guide'], ['workshop', '13-workshop'], ['team', '14-team'], ['visit', '15-visit']]) { await toSection(page, id); await shot(name); }
  await page.locator('.guide__btn').nth(7).click();
  await toSection(page, 'guide');
  await shot('12b-guide-search');
  await toSection(page, 'decisions');
  await shot('13b-decisions');

  // lights off
  await page.evaluate(() => scrollTo(0, 0));
  await page.locator('#theme-toggle').click();
  await page.waitForTimeout(600);
  check('theme toggle switches to night', (await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark');
  await shot('16-night-hero');
  await toSection(page, 'halls-stage');
  await page.mouse.move(700, 400);
  await shot('17-night-hall');
  for (const [id, name] of [['catalogue', '18-night-catalogue'], ['atlas', '19-night-map'], ['this-day', '20-night-today'], ['quiz-room', '21-night-quiz'], ['team', '22-night-team']]) { await toSection(page, id); await shot(name); }
  await page.locator('.card__btn').first().click();
  await page.waitForTimeout(1200);
  await shot('23-night-case');
  await page.keyboard.press('Escape');

  check('desktop: no console errors or failed requests', errors.length === 0, errors.slice(0, 6).join(' | '));
  await context.close();
}

// ─────────────────────────────────────────────── phone, 390px
{
  const { context, page, errors, shot } = await open({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, 'mobile');
  const m = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - innerWidth,
    horizontal: document.getElementById('halls-stage').classList.contains('is-horizontal'),
    mapHidden: getComputedStyle(document.querySelector('.atlas__sheet')).display === 'none',
    countries: document.querySelectorAll('.atlas__ledger button').length,
  }));
  check('mobile: no horizontal scroll', m.overflow <= 0, `${m.overflow}px`);
  check('mobile: halls are a vertical timeline', !m.horizontal);
  check('mobile: the map is a list of countries', m.mapHidden && m.countries > 0, `${m.countries} countries`);
  await page.waitForTimeout(1500);
  await shot('01-hero');
  for (const [id, name] of [['phone', '02-phone'], ['ledger-title', '03-ledger'], ['halls-stage', '04-hall'], ['catalogue', '05-catalogue'], ['atlas', '06-map'], ['this-day', '07-today'], ['quiz-room', '08-quiz'], ['visitor-guide', '09-guide'], ['guide', '09b-guide-list'], ['workshop', '10-workshop'], ['arch', '10b-arch'], ['team', '11-team'], ['visit', '12-visit']]) {
    await toSection(page, id);
    await shot(name);
  }
  await page.locator('#nav-menu').click();
  await shot('13-menu');
  await page.locator('#nav-menu').click();
  await toSection(page, 'catalogue');
  await page.locator('.card__btn').nth(2).click();
  await page.waitForTimeout(1500);
  const sheet = await page.evaluate(() => { const r = document.getElementById('vitrine').getBoundingClientRect(); return r.width >= innerWidth && r.height >= innerHeight - 1; });
  check('mobile: the display case is a full-screen sheet', sheet);
  await shot('14-case');
  await page.locator('.vitrine__close').click();
  check('mobile: no horizontal scroll after interaction', (await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0);
  check('mobile: no console errors or failed requests', errors.length === 0, errors.slice(0, 6).join(' | '));
  await context.close();
}

// ─────────────────────────────────────────────── tiny phone and very wide screen
for (const [w, h] of [[360, 740], [2560, 1300]]) {
  const { context, page, shot } = await open({ viewport: { width: w, height: h } }, `w${w}`);
  const wide = await page.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 1 && !e.closest('.hero__gears, .halls__track')).slice(0, 4).map((e) => `${e.tagName}.${e.className}`).join(', '));
  check(`${w}px: no horizontal scroll`, (await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0, wide);
  await page.waitForTimeout(1200);
  await shot('hero');
  await context.close();
}

// ─────────────────────────────────────────────── reduced motion
{
  const { context, page, errors } = await open({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' }, 'reduced');
  const r = await page.evaluate(() => ({
    horizontal: document.getElementById('halls-stage').classList.contains('is-horizontal'),
    paused: document.querySelector('.phone__toggle').getAttribute('aria-pressed'),
    gear: getComputedStyle(document.querySelector('.gear')).animationName,
    digits: document.querySelector('.ledger__digits').textContent,
  }));
  check('reduced motion: halls scroll vertically', !r.horizontal);
  check('reduced motion: the phone demo does not autoplay', r.paused === 'true');
  check('reduced motion: gears stand still, counters show final numbers', r.gear === 'none' && Number(r.digits) > 0, `${r.gear}, ${r.digits}`);
  check('reduced motion: no console errors', errors.length === 0, errors.slice(0, 4).join(' | '));
  await context.close();
}

await browser.close();
await new Promise((done) => server.httpServer.close(done));
console.log('\n' + results.join('\n'));
console.log(problems.length ? `\n${problems.length} check(s) failed.` : '\nAll checks passed.');
process.exit(problems.length ? 1 : 0);
