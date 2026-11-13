// ──────────────────────────────────────────────────────────────────────────
//  Everything a maintainer is expected to edit lives in this one file.
// ──────────────────────────────────────────────────────────────────────────

// The bot's Telegram address. Every "Open in Telegram" button on the site reads it.
export const BOT_URL = 'https://t.me/jdjsbehenbot';

/**
 * A link that opens the bot and sends "/start <payload>", so the bot goes straight
 * to one screen. The payloads are listed in DEEP_LINKS in ../handlers.py:
 * museum, halls, hall1..hall4, catalog, favorites, stats, today, map, search,
 * quiz, feedback, team, and item_<exhibit id>.
 */
export const botStartUrl = (payload?: string): string => (payload ? `${BOT_URL}?start=${encodeURIComponent(payload)}` : BOT_URL);

// TODO: paste the public repository URL. While it is empty, the footer simply
// leaves the repository link out.
export const REPO_URL = '';

// TODO: the address the site is deployed to (no trailing slash). It is only
// used for the absolute Open Graph / Twitter image URL.
export const SITE_URL = 'https://world-of-inventions-museum.netlify.app';

export interface TeamMember {
  name: string;
  role: string;
  /** Path or URL of a square portrait, e.g. "/team/ada.jpg" (put the file in public/team/). */
  photo?: string;
  /** Personal link: Telegram, GitHub, a portfolio. */
  link?: string;
}

// TODO: add team members. The plaque lays itself out for 1 to 8 people.
// While the list is empty, the section shows a "names are being engraved" plaque.
//
//   { name: 'Ada Lovelace', role: 'Content & research', link: 'https://github.com/ada' },
//   { name: 'Charles Babbage', role: 'Bot development', photo: '/team/charles.jpg' },
export const TEAM: TeamMember[] = [];

/** How many questions the on-site taster quiz asks (the bot's own round size comes from handlers.py). */
export const SITE_QUIZ_SIZE = 5;
