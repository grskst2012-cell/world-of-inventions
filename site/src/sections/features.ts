// The visitor's guide: every feature of the bot, each with the real screen it produces.
// The display case on the right behaves like the bot: one message, edited in place.
import { BY_ID, HALL_IDS, INVENTIONS, QUIZ, QUIZ_ROUND_SIZE, STATS, hallItems, COUNTRIES } from '../data';
import {
  hallsScreen, cardScreen, favoritesScreen, statsScreen, historyScreen, howScreen, mapScreen, filtersScreen, quizScreen, newQuizRound,
  feedbackScreen, FEEDBACK_THANKS, TEAM_SCREEN_HEAD, ITEMS_PER_PAGE, pageCount,
} from '../bot';
import { $, h, messageEl, userBubble, botLink } from '../ui';

interface Feature { id: string; title: string; text: string; note?: string; screen: () => HTMLElement[] }

/** Which bot screen each entry opens (the /start payloads handled in ../handlers.py). */
const START: Record<string, (starId: string) => string> = {
  halls: () => 'halls', card: (id) => `item_${id}`, favorites: () => 'favorites', stats: () => 'stats',
  today: () => 'today', how: (id) => `item_${id}`, map: () => 'map', search: () => 'search',
  quiz: () => 'quiz', feedback: () => 'feedback', team: () => 'team',
};

export function initFeatures(): void {
  const root = $('#guide');
  const withPhoto = INVENTIONS.filter((item) => item.image);
  const star = withPhoto[Math.min(4, withPhoto.length - 1)] ?? INVENTIONS[0];
  const today = new Date();
  const sample = { studied: Math.round(STATS.exhibits * 0.3), halls: Math.max(1, STATS.halls - 1), favorites: 3, correct: 16, total: 20, quizzes: 2 };

  const features: Feature[] = [
    {
      id: 'halls', title: 'Four halls and a full catalogue',
      text: `Walk the collection era by era, or open the catalogue and page through all ${STATS.exhibits} exhibits, ${ITEMS_PER_PAGE} to a page (${pageCount(STATS.exhibits)} pages).`,
      screen: () => [messageEl(hallsScreen())],
    },
    {
      id: 'card', title: 'The exhibit card',
      text: 'One message carries the photo and the whole label. When you move on, the bot edits that same message, so the chat stays one screen long instead of a trail of old menus.',
      screen: () => [messageEl(cardScreen(star), { clampText: 230 })],
    },
    {
      id: 'favorites', title: 'Favorites',
      text: 'Tap the star on any card. Saved exhibits wait under My Favorites, most recently added first.',
      screen: () => [messageEl(favoritesScreen([star, hallItems(HALL_IDS[HALL_IDS.length - 1])[0]].filter(Boolean)))],
    },
    {
      id: 'stats', title: 'Personal statistics',
      text: 'The bot keeps count of the exhibits you opened, the halls you visited, your favorites and your quiz answers. An exhibit counts as studied the moment you open it.',
      note: 'Sample numbers for an imaginary visitor. The totals are real.',
      screen: () => [messageEl(statsScreen(sample))],
    },
    {
      id: 'today', title: 'This Day in History',
      text: 'Open it on any date. If the calendar has nothing for today, the bot shows the nearest earlier and later entries and says how many days away each one is.',
      note: 'Generated for your date, by the same rule the bot uses.',
      screen: () => [messageEl(historyScreen({ year: today.getFullYear(), month: today.getMonth() + 1, day: today.getDate() }, BY_ID), { clampText: 420 })],
    },
    {
      id: 'how', title: 'How It Works',
      text: 'Every exhibit comes with a short, plain explanation of its principle. It replaces the caption under the same photo, and one tap brings the label back.',
      screen: () => [messageEl(howScreen(star))],
    },
    {
      id: 'map', title: 'Invention Map',
      text: `${COUNTRIES.length} places, grouped by continent, with a count beside each. An invention shared by several countries is counted for each of them.`,
      screen: () => [messageEl(mapScreen())],
    },
    {
      id: 'search', title: 'Search & Filters',
      text: 'Narrow by country, hall and period, then type a keyword to search inside what is left. Typing “tire” finds the tyre: American spellings are mapped to the British ones the museum uses.',
      screen: () => [messageEl(filtersScreen({ country: COUNTRIES[1] ?? null, hall: null, period: null }))],
    },
    {
      id: 'quiz', title: 'Invention Quiz',
      text: `Each round draws ${QUIZ_ROUND_SIZE} questions at random from a bank of ${QUIZ.length} and shuffles the answers. Every answer comes with a fact, right or wrong.`,
      screen: () => [messageEl(quizScreen(QUIZ, newQuizRound(QUIZ, QUIZ_ROUND_SIZE), 0))],
    },
    {
      id: 'feedback', title: 'Suggestions and feedback',
      text: 'Spotted a mistake or miss an invention? Send one text message and the bot forwards it to the project team.',
      note: 'The visitor’s message here is an example.',
      screen: () => [messageEl(feedbackScreen()), userBubble('Could the museum get a bicycle?'), messageEl({ text: FEEDBACK_THANKS, keyboard: [] })],
    },
    {
      id: 'team', title: 'Project team',
      text: 'A credits screen for the people who built the museum, one tap from the main menu.',
      screen: () => [messageEl({ text: `${TEAM_SCREEN_HEAD}\n\n• …`, keyboard: [[{ text: '🏠 Main Menu', cb: 'home' }]] })],
    },
  ];

  const screen = h('div.case__screen', { 'aria-hidden': 'true' });
  const note = h('p.case__note');
  const label = h('p.case__label');
  const display = h('div.case', {}, label, screen, note);
  const aside = h('div.guide__aside', {}, display);
  const wide = matchMedia('(min-width: 900px)');
  const entries = new Map<string, HTMLElement>();
  let active = '';

  const place = () => {
    if (wide.matches) aside.append(display);
    else entries.get(active)?.append(display);
  };
  const select = (f: Feature) => {
    if (active === f.id) return;
    active = f.id;
    for (const [id, li] of entries) {
      li.classList.toggle('is-active', id === f.id);
      li.querySelector('button')!.setAttribute('aria-expanded', String(id === f.id));
    }
    screen.replaceChildren(...f.screen());
    screen.scrollTop = 0;
    label.textContent = `Screen: ${f.title}`;
    note.textContent = f.note ?? 'Text and buttons exactly as the bot sends them.';
    place();
  };

  const list = h('ol.guide__list', {}, ...features.map((f) => {
    const button = h('button.guide__btn', { type: 'button', 'aria-expanded': 'false' }, f.title);
    button.addEventListener('click', () => select(f));
    const start = START[f.id]?.(star.id);
    const li = h('li.guide__item', {}, h('h3', {}, button), h('p', {}, f.text),
      start ? botLink(`Open “${f.title}” in the bot`, 'guide__bot', start) : null);
    entries.set(f.id, li);
    return li;
  }));
  wide.addEventListener('change', place);
  root.append(list, aside);
  select(features[1]);
  // Reading down the list on a wide screen: the entry crossing the middle of the window takes the case.
  const io = new IntersectionObserver((hits) => {
    if (!wide.matches) return;
    const hit = hits.find((x) => x.isIntersecting);
    const f = hit && features.find((x) => entries.get(x.id) === hit.target);
    if (f) select(f);
  }, { rootMargin: '-46% 0px -46% 0px' });
  entries.forEach((li) => io.observe(li));
}
