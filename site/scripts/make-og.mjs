// Renders public/og.png (1200x630) and public/apple-touch-icon.png in the site's
// own style, with the numbers taken from the data. Uses the installed Edge/Chrome.
// Run with: npm run og
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => JSON.parse(readFileSync(resolve(SITE, 'src/data/generated', f), 'utf8'));
const inventions = read('inventions.json');
const bot = read('bot-data.json');
const years = inventions.map((i) => parseInt(/\d{4}/.exec(i.year)?.[0] ?? '0', 10)).filter(Boolean);
// fonts are inlined: a page made with setContent may not read local files
const font = (p) => 'data:font/woff2;base64,' + readFileSync(resolve(SITE, 'node_modules', p)).toString('base64');
const executablePath = [
  process.env.BROWSER_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
].filter(Boolean).find((p) => existsSync(p));
if (!executablePath) throw new Error('No Chrome or Edge found. Set BROWSER_PATH.');

function gear(teeth, outer, root) {
  const step = (Math.PI * 2) / teeth;
  const pt = (r, a) => `${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r).toFixed(1)}`;
  let d = '';
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    d += `${i ? 'L' : 'M'}${pt(root, a)}L${pt(root, a + step * 0.22)}L${pt(outer, a + step * 0.36)}L${pt(outer, a + step * 0.64)}L${pt(root, a + step * 0.78)}`;
  }
  return d + 'Z';
}
const token = readFileSync(resolve(SITE, 'public/favicon.svg'), 'utf8');

const html = `<!doctype html><meta charset="utf-8"><style>
@font-face { font-family: F; src: url("${font('@fontsource-variable/fraunces/files/fraunces-latin-full-normal.woff2')}"); font-weight: 100 900; }
@font-face { font-family: M; src: url("${font('@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2')}"); }
* { box-sizing: border-box; margin: 0; }
body { width: 1200px; height: 630px; background: #0e1116; color: #ece3cf; font-family: F, serif; position: relative; overflow: hidden; }
.frame { position: absolute; inset: 22px; border: 1px solid rgba(210,171,87,.55); outline: 1px solid rgba(210,171,87,.25); outline-offset: 5px; }
svg.gear { position: absolute; right: -170px; top: 50%; width: 760px; margin-top: -380px; fill: none; stroke: #d2ab57; stroke-width: .7; opacity: .5; }
.glow { position: absolute; right: -60px; top: 50%; width: 700px; height: 700px; margin-top: -350px; background: radial-gradient(closest-side, rgba(255,221,160,.16), transparent); }
.copy { position: absolute; left: 76px; top: 60px; right: 330px; }
.token { width: 74px; height: 74px; }
h1 { margin-top: 26px; font-size: 128px; line-height: .9; letter-spacing: -.035em; font-weight: 380; font-variation-settings: "opsz" 144, "SOFT" 100, "WONK" 1; }
p.line { margin-top: 26px; font-size: 34px; line-height: 1.15; max-width: 560px; color: #ece3cf; }
p.ref { position: absolute; left: 76px; bottom: 54px; font: 500 21px/1 M, monospace; letter-spacing: .12em; text-transform: uppercase; color: #d2ab57; }
</style>
<div class="glow"></div>
<svg class="gear" viewBox="-304 -304 608 608"><path d="${gear(48, 300, 270)}"/><circle r="222"/><circle r="210" stroke-dasharray="1 5"/><circle r="60"/><circle r="21"/>
${Array.from({ length: 6 }, (_, i) => { const a = (i * Math.PI) / 3; return `<line x1="${Math.cos(a) * 60}" y1="${Math.sin(a) * 60}" x2="${Math.cos(a) * 216}" y2="${Math.sin(a) * 216}"/>`; }).join('')}</svg>
<div class="frame"></div>
<div class="copy"><div class="token">${token}</div><h1>${bot.museumName.replace(' of ', ' of<br>')}</h1><p class="line">A museum of inventions that lives in your Telegram.</p></div>
<p class="ref">${inventions.length} exhibits · ${Object.keys(bot.halls).length} halls · ${Math.min(...years)} to ${Math.max(...years)}</p>`;

const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: resolve(SITE, 'public/og.png') });
await page.setViewportSize({ width: 180, height: 180 });
await page.setContent(`<style>*{margin:0}body{width:180px;height:180px;background:#1a2030;display:grid;place-items:center}svg{width:164px;height:164px}</style>${token}`);
await page.screenshot({ path: resolve(SITE, 'public/apple-touch-icon.png') });
await browser.close();
console.log('[make-og] wrote public/og.png and public/apple-touch-icon.png');
