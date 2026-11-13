# World of Inventions · showcase site

A one-page site for the World of Inventions Telegram bot: the halls, a searchable
catalogue, the invention map, "This Day in History", a playable quiz, the feature
guide and a look under the hood.

Every fact, number and bot text on the page comes from the bot's own files
(`../handlers.py`, `../keyboards.py`, `../database.py`, `../data/*.json`).
Nothing is retyped by hand, and the site never reads `../.env`.

Stack: Vite, TypeScript (no framework), GSAP ScrollTrigger for the horizontal halls.

## Run it locally

Needs Node.js 18 or newer.

```bash
cd site
npm install
npm run dev
```

Open the address Vite prints (usually http://localhost:5173).

Production build and a local check of it:

```bash
npm run build
npm run preview
```

The finished site is the `dist/` folder: plain static files.

## The three things you will want to edit

All of them live in one file, [`src/config.ts`](src/config.ts).

### 1. The bot link

```ts
export const BOT_URL = 'https://t.me/jdjsbehenbot';
```

Every "Open in Telegram" button reads this constant, including the ones in the
static HTML.

**Buttons that open one function of the bot.** A link `BOT_URL?start=<payload>`
opens the chat and sends `/start <payload>`; the bot then shows that screen
instead of the main menu (`DEEP_LINKS` in `../handlers.py`). Payloads: `museum`,
`halls`, `hall1`..`hall4`, `catalog`, `favorites`, `stats`, `today`, `map`,
`search`, `quiz`, `feedback`, `team`, `item_<exhibit id>`. Build such a link with
`botStartUrl(payload)` from `src/config.ts`, or `botLink(label, cls, payload)` in `src/ui.ts`.

### 2. The team

```ts
export const TEAM: TeamMember[] = [];
```

Add one object per person:

```ts
export const TEAM: TeamMember[] = [
  { name: 'Ada Lovelace', role: 'Content and research', link: 'https://github.com/ada' },
  { name: 'Charles Babbage', role: 'Bot development', photo: '/team/charles.jpg' },
];
```

- `name` and `role` are required.
- `photo` is optional. Put a square image in `public/team/` and write its path.
  Without a photo the plaque shows the person's initials.
- `link` is optional (Telegram, GitHub, portfolio). The name becomes a link.

The plaque lays itself out for 1 to 8 people. **While the list is empty the section
stays visible and shows a brass plaque that reads "The names are being engraved."**
That was chosen over hiding the section, so the page keeps its shape and a visitor
can see that credits are coming.

### 3. Repository and site address

```ts
export const REPO_URL = '';   // footer link "Source code"; left out while empty
export const SITE_URL = '';   // e.g. 'https://example.github.io/world-of-inventions'
```

`SITE_URL` is only used for the absolute address of the social preview image
(`og:image`), which Telegram, X and others require.

## Updating the data

The site keeps generated copies of the bot's content in `src/data/generated/`.
They are committed, so the site also builds on a host that only has the `site/` folder.

After changing `inventions.json`, `history.json`, `handlers.py`, `keyboards.py`
or `database.py`, run:

```bash
npm run data
npm run build
```

`npm run data` does two things:

1. **`scripts/extract-data.mjs`** (fast). Parses the Python sources without running
   them and writes `bot-data.json`: `HALLS`, `QUIZ`, `QUIZ_ROUND_SIZE`,
   `COUNTRY_INFO`, `CONTINENTS`, the static menus from `keyboards.py`, the
   `CREATE TABLE` statements from `database.py`, the FSM state groups and the code
   snippets shown in the "Workshop" section (with their real line numbers).
   It copies the two JSON files byte for byte and runs the same validation the bot
   runs at start-up, so a broken data file fails here with a named error.
2. **`scripts/check-images.mjs`**. The exhibit photos live in the project,
   `public/exhibits/<id>.jpg` (and a 400 px copy in `public/exhibits/thumb/`).
   The site serves them itself and the bot uploads the same files to Telegram.
   The script downloads a photo for any exhibit that has an `image_url` but no
   local file yet, then writes `image-status.json` with pixel sizes and the
   author and licence (kept in `scripts/image-credits.json`).

Two things are **not** extracted automatically, because they are code rather than data:

- Screen texts and dynamic keyboards (exhibit card, statistics, search screen and so on)
  are ported to TypeScript in [`src/bot.ts`](src/bot.ts). If you reword a screen in
  `handlers.py`, reword it there as well.
- The "This Day" rule and the search rules are ported in the same file
  (`buildHistory`, `searchMatches`). They follow `build_history()` and
  `search_matches()` line by line.

If a new country is added to `COUNTRY_INFO`, also run `npm run data:map`. It redraws
the map shapes from Natural Earth data. A country without a shape still appears in
the list beside the map.

To refresh the social preview image after the numbers change: `npm run og`.

## Checking the result

```bash
npm run build
npm run qa
```

`scripts/qa.mjs` opens the built site in the Edge or Chrome installed on the machine
and walks through it: halls, display case with mouse and keyboard, search and
filters, map, "This Day", a full quiz, the theme switch, a phone-sized screen and
reduced motion. It fails on any console error or failed request.
Pass a folder to keep screenshots: `node scripts/qa.mjs ./shots`.

## Deploying

The build is static and uses relative paths, so it works from a domain root or
from a sub-folder without extra settings.

**GitHub Pages**

1. Build locally: `npm run build`.
2. Publish the `site/dist` folder, for example with the `gh-pages` branch:
   `npx gh-pages -d dist` (run inside `site/`).
3. In the repository settings choose Pages, branch `gh-pages`.

Or use a GitHub Actions workflow with `working-directory: site`, the steps
`npm ci` and `npm run build`, and `actions/upload-pages-artifact` pointing at `site/dist`.

**Render** (bot and site together)

`../render.yaml` is a Render Blueprint: Render > New > Blueprint > this repository.
It creates the static site (`site/`, `npm ci && npm run build`, publish `dist`) and the
bot as a free web service in webhook mode. Enter `BOT_TOKEN` and `ADMIN_ID` when asked.
Every push to `main` redeploys both.

**Netlify**

- Base directory: `site`
- Build command: `npm run build`
- Publish directory: `site/dist`

**Vercel**

- Root directory: `site`
- Framework preset: Vite (build command `npm run build`, output `dist`)

After the first deploy, put the final address into `SITE_URL` and rebuild.

## Where things are

```
site/
  index.html              page skeleton and static copy; __TOKENS__ are filled from the data at build time
  src/config.ts           BOT_URL, TEAM, REPO_URL, SITE_URL
  src/data.ts             reads the generated data and derives every number
  src/bot.ts              the bot's texts, keyboards and rules, ported from Python
  src/modal.ts            the display case (dialog)
  src/sections/           one file per section
  src/styles/             design tokens and styles (base, halls, sections, chat)
  src/data/generated/     output of the scripts below (committed)
  scripts/                extract-data, check-images, build-map, make-og, qa
  public/                 favicon, social preview image
```

## Good to know

- **Photographs.** All 43 photos come from Wikimedia Commons and are stored in
  `public/exhibits/`. To replace one: change `image_url` in `../data/inventions.json`,
  delete `public/exhibits/<id>.jpg` and `public/exhibits/thumb/<id>.jpg`, run
  `npm run data` and `npm run build`. The bot picks up the new file on restart.
- **Themes.** "Lights on" is the day museum, "Lights off" the night one. The choice
  is remembered in the browser; the first visit follows the system setting.
- **Reduced motion.** With the system setting on, the halls scroll vertically, the
  phone demo waits for its Play button, and counters show their final values.
- **Design tokens** (colours for both themes and the four halls, type scale,
  spacing, radii, shadows, durations) are at the top of `src/styles/base.css`
  and `src/styles/halls.css`.
