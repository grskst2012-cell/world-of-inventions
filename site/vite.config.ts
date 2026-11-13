import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import { BOT_URL, SITE_URL as CONFIG_SITE_URL } from './src/config';

// On Render the site's own address is known at build time; config.ts is the fallback.
const SITE_URL = (process.env.SITE_URL || process.env.RENDER_EXTERNAL_URL || CONFIG_SITE_URL).replace(/\/$/, '');

/** Fills the __TOKENS__ in index.html from the data, so even the static HTML never hardcodes a number. */
function museumHtml(): Plugin {
  return {
    name: 'museum-html',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        const read = (f: string) => JSON.parse(readFileSync(new URL(`./src/data/generated/${f}`, import.meta.url), 'utf8'));
        const inventions: { name: string; year: string }[] = read('inventions.json');
        const bot = read('bot-data.json');
        const year = (y: string) => parseInt(/\d{4}/.exec(y)?.[0] ?? '0', 10);
        const sorted = [...inventions].sort((a, b) => year(a.year) - year(b.year));
        const first = sorted[0];
        const last = sorted[sorted.length - 1];
        const tokens: Record<string, string> = {
          MUSEUM: bot.museumName,
          N_EXHIBITS: String(inventions.length),
          N_HALLS: String(Object.keys(bot.halls).length),
          N_EVENTS: String(read('history.json').length),
          N_QUESTIONS: String(bot.quiz.length),
          YEAR_MIN: String(year(first.year)),
          YEAR_MAX: String(year(last.year)),
          FIRST_NAME: first.name,
          LAST_NAME: last.name,
          BOT_URL,
          OG_IMAGE: `${SITE_URL}/og.png`,
          SITE_URL: SITE_URL || '.',
        };
        return html.replace(/__([A-Z_]+)__/g, (all, key) => tokens[key] ?? all);
      },
    },
    generateBundle() {
      const read = (f: string) => JSON.parse(readFileSync(new URL(`./src/data/generated/${f}`, import.meta.url), 'utf8'));
      const bot = read('bot-data.json');
      const halls = Object.entries(bot.halls as Record<string, { name: string; title: string; description: string }>);
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: 'User-agent: *\nAllow: /\n' });
      this.emitFile({
        type: 'asset', fileName: 'llms.txt',
        source: `# ${bot.museumName}\n\n> An educational Telegram bot: a virtual museum of inventions with ${read('inventions.json').length} exhibits, ` +
          `${read('history.json').length} dated events and a quiz bank of ${bot.quiz.length} questions.\n\n## Halls\n\n` +
          halls.map(([id, hall]) => `- Hall ${id}, ${hall.name} (${hall.title}): ${hall.description}`).join('\n') +
          `\n\n## Links\n\n- [The site](${SITE_URL || '.'}/index.html): halls, catalogue, map, This Day in History, quiz\n- [The bot in Telegram](${BOT_URL})\n`,
      });
    },
    buildStart() {
      if (BOT_URL.includes('<USERNAME>')) {
        this.warn('BOT_URL in src/config.ts still contains <USERNAME>. The Telegram buttons will not open the bot until it is set.');
      }
    },
  };
}

/** The two fonts used above the fold start loading together with the stylesheet. */
function preloadFonts(): Plugin {
  const wanted = [/fraunces-latin-full-normal-.*\.woff2$/, /hanken-grotesk-latin-wght-normal-.*\.woff2$/];
  return {
    name: 'preload-fonts',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const files = Object.keys(ctx.bundle ?? {}).filter((f) => wanted.some((re) => re.test(f)));
        return {
          html,
          tags: files.map((f) => ({ tag: 'link', attrs: { rel: 'preload', as: 'font', type: 'font/woff2', href: `./${f}`, crossorigin: '' }, injectTo: 'head' as const })),
        };
      },
    },
  };
}

export default defineConfig({
  base: './',
  appType: 'mpa',
  plugins: [museumHtml(), preloadFonts()],
  build: { target: 'es2020', cssMinify: true },
});
