"""End-to-end check of the museum features.

Drives the real aiogram handlers with simulated Telegram updates: every button
that the bot can show is "pressed", and the resulting screen, keyboard and
database state are inspected. The user's real data/museum.db is never touched
(a separate test database is used and removed afterwards).

Run:  .\\.venv\\Scripts\\python.exe _verify_features.py
"""
import asyncio
import datetime
import hashlib
import sys
from pathlib import Path
from unittest.mock import MagicMock

BASE = Path(__file__).resolve().parent
REAL_DB = BASE / "data" / "museum.db"
TEST_DB = BASE / "data" / "_verify_test.db"
USER_ID = 777001
PASS, FAIL = [], []

try:  # the museum uses emoji; the Windows console is not UTF-8 by default
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass



def check(name, condition, detail=""):
    (PASS if condition else FAIL).append((name, detail))
    print(f"  [{'PASS' if condition else 'FAIL'}] {name}" + (f"   -> {detail}" if detail and not condition else ""))


def db_hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()[:16] if path.exists() else "missing"


def buttons(message):
    markup = getattr(message, "reply_markup", None)
    return [b.text for row in markup.inline_keyboard for b in row] if markup else []


def button_data(message, label_contains):
    markup = getattr(message, "reply_markup", None)
    if not markup:
        return None
    for row in markup.inline_keyboard:
        for b in row:
            if label_contains.lower() in b.text.lower():
                return b.callback_data
    return None


def find_buttons(message, prefix):
    markup = getattr(message, "reply_markup", None)
    if not markup:
        return []
    return [b.callback_data for row in markup.inline_keyboard for b in row
            if b.callback_data.startswith(prefix)]


def row_count(message):
    markup = getattr(message, "reply_markup", None)
    return len(markup.inline_keyboard) if markup else 0


def col_count(message):
    markup = getattr(message, "reply_markup", None)
    return len(markup.inline_keyboard[0]) if markup else 0


class FakeMessage:
    """A message shown to the user (text, or photo with a caption) plus its buttons."""

    next_id = 1

    def __init__(self, text="", photo=False, caption=None):
        self.message_id = FakeMessage.next_id
        FakeMessage.next_id += 1
        self.chat = MagicMock(id=USER_ID)
        self.text = text
        self.caption = caption
        self.photo = [MagicMock()] if photo else None
        self.reply_markup = None
        self.deleted = False
        self.edits = 0
        self.edit_media_calls = 0

    @property
    def shown(self):
        return self.caption or self.text or ""

    async def edit_text(self, text=None, reply_markup=None, **kw):
        self.text, self.caption, self.edits = text, None, self.edits + 1
        if reply_markup is not None:
            self.reply_markup = reply_markup

    async def edit_caption(self, caption=None, reply_markup=None, **kw):
        self.caption, self.text, self.edits = caption, None, self.edits + 1
        if reply_markup is not None:
            self.reply_markup = reply_markup

    async def edit_reply_markup(self, reply_markup=None, **kw):
        self.reply_markup = reply_markup

    async def edit_media(self, media, reply_markup=None, **kw):
        self.edit_media_calls += 1
        self.caption = getattr(media, "caption", None)
        self.text = None
        self.photo = [MagicMock()]
        if reply_markup is not None:
            self.reply_markup = reply_markup

    async def delete(self):
        self.deleted = True


class StartMessage(FakeMessage):
    def __init__(self):
        super().__init__()

    async def answer(self, text, reply_markup=None, **kw):
        self.sent = FakeMessage(text=text)
        self.sent.reply_markup = reply_markup
        return self.sent


class Harness:
    def __init__(self, handlers, storage):
        self.h = handlers
        self.bot = MagicMock()
        self.bot.id = 424242
        self.bot.send_message = self._admin_send
        self.storage = storage
        import aiogram.fsm.storage.base as base
        self.state = handlers.FSMContext(
            storage, base.StorageKey(bot_id=self.bot.id, chat_id=USER_ID, user_id=USER_ID)
        )
        self.screen = FakeMessage()
        self.admin_inbox = []
        self.errors = []
        # route table so that "pressing" a button goes through the real router filter
        self.routes = []
        for entry in handlers.router.callback_query.handlers:
            self.routes.append((entry.callback, entry.filters[0]))

    async def _admin_send(self, chat_id, text, **kw):
        self.admin_inbox.append((chat_id, text))
        return FakeMessage(text=text)

    def _new_screen(self, text="", reply_markup=None):
        m = FakeMessage(text=text)
        m.reply_markup = reply_markup
        return m

    def attach(self, message):
        """Give a fake message the answer/edit helpers that keep the 'screen' current."""
        async def answer(text, reply_markup=None, **kw):
            self.screen = self._new_screen(text, reply_markup)
            return self.screen

        async def answer_photo(photo, caption=None, reply_markup=None, **kw):
            self.screen = FakeMessage(caption=caption, photo=True)
            self.screen.reply_markup = reply_markup
            message.deleted = True
            return self.screen

        message.answer = answer
        message.answer_photo = answer_photo
        message.delete = message.delete
        return message

    async def press(self, data):
        """Press a button whose callback_data is `data`."""
        handler_name, handler = self.find_route(data)
        if handler is None:
            self.errors.append(f"no route for callback {data!r}")
            return None
        callback = MagicMock()
        callback.data = data
        callback.id = "cb"
        callback.chat_instance = "ci"
        callback.from_user = MagicMock(id=USER_ID, full_name="Test User", username="tester")
        callback.bot = self.bot
        callback.message = self.screen
        callback.answers = []

        async def answer(text=None, show_alert=False, **kw):
            callback.answers.append((text, show_alert))

        callback.answer = answer
        await self.call(handler, callback)
        return callback

    async def call(self, handler, callback):
        """Call a handler, passing FSM state only when it declares that parameter."""
        import inspect as _inspect
        params = _inspect.signature(handler).parameters
        if any(p.kind is p.VAR_KEYWORD for p in params.values()):
            await handler(callback, state=self.state)
        elif len(params) >= 2:
            await handler(callback, self.state)
        else:
            await handler(callback)

    def find_route(self, data):
        """Resolve callback_data through the router's own MagicFilters."""
        from aiogram.types import CallbackQuery, Message, User, Chat
        probe_message = Message.model_construct(
            message_id=1, chat=Chat.model_construct(id=USER_ID, type="private")
        )
        probe = CallbackQuery.model_construct(
            id="probe", from_user=User.model_construct(id=USER_ID, is_bot=False, first_name="T"),
            chat_instance="ci", message=probe_message, data=data,
        )
        for handler, flt in self.routes:
            try:
                if flt.callback(probe):
                    return handler.__name__, handler
            except Exception as exc:
                self.errors.append(f"{handler.__name__}: {exc!r}")
        return None, None

    async def user_text(self, text, handler=None):
        """Simulate the user typing a message."""
        msg = self.attach(FakeMessage(text=text))
        msg.from_user = MagicMock(id=USER_ID, full_name="Test User", username="tester")
        msg.text = text
        await handler(msg, self.state)
        return self.screen


async def main():
    from aiogram.fsm.storage.memory import MemoryStorage
    import database as dbmod

    real_before = db_hash(REAL_DB)
    if TEST_DB.exists():
        TEST_DB.unlink()
    dbmod.DB_FILE = TEST_DB
    dbmod.init_db()

    import handlers

    async def to_thread_inline(func, *args, **kw):
        return func(*args, **kw)

    handlers.asyncio.to_thread = to_thread_inline  # deterministic, no thread pool

    INVENTIONS, BY_ID = handlers.INVENTIONS, handlers.BY_ID
    h = Harness(handlers, MemoryStorage())

    print("\n" + "=" * 74)
    print("1. MAIN MENU")
    print("=" * 74)
    start_msg = StartMessage()
    start_msg.from_user = MagicMock(id=USER_ID)
    await handlers.start(start_msg, h.state)
    h.screen = start_msg.sent
    print("  " + h.screen.shown.splitlines()[0])
    expected_menu = ["Enter the Museum", "My Favorites", "Personal Statistics", "This Day in History",
                     "Invention Map", "Search & Filters", "Suggestions & Feedback", "Project Team",
                     "Invention Quiz"]
    for label in expected_menu:
        check(f"menu button: {label}", any(label in b for b in buttons(h.screen)))
    check("all 9 menu buttons reachable", len(buttons(h.screen)) == len(expected_menu), str(buttons(h.screen)))
    for label in expected_menu:
        body = button_data(h.screen, label)
        _, handler = h.find_route(body)
        check(f"route exists for '{label}'", handler is not None, body)

    print("\n" + "=" * 74)
    print("2. HALLS & EXHIBIT CARD")
    print("=" * 74)
    await h.press("museum")
    check("museum menu shown", "Welcome to the Museum" in h.screen.shown)
    await h.press("halls")
    check("4 halls listed", len(find_buttons(h.screen, "hall:")) == 4, str(buttons(h.screen)))
    await h.press("hall:2")
    check("hall 2 = The Industrial Age", "Industrial Age" in h.screen.shown)
    hall_items = find_buttons(h.screen, "item:")
    expected_hall2 = [i for i in INVENTIONS if str(i["hall"]) == "2"]
    check(f"hall 2 lists all {len(expected_hall2)} exhibits", len(hall_items) == len(expected_hall2),
          f"{len(hall_items)} buttons")

    target = next(i for i in INVENTIONS if i["id"] == "telephone")
    await h.press(f"item:{target['id']}")
    check("exhibit card opened (photo + caption)", target["name"] in h.screen.shown and bool(h.screen.photo))
    for label in ["Add to Favorites", "How It Works", "Back to Hall", "Full Catalogue"]:
        check(f"card button: {label}", any(label in b for b in buttons(h.screen)))
    for field in ["Period:", "Year:", "Inventor:", "Country", "Origin", "Features", "Significance", "Further Facts", "Sources"]:
        check(f"card shows {field}", field in h.screen.shown)
    check("card shows image credit", "credit" in h.screen.shown.lower(),
          h.screen.shown[-200:])
    check("studied counter = 1", dbmod.get_stats(USER_ID)["studied_exhibits"] == 1)
    await h.press("catalog")
    await h.press(f"item:{target['id']}")
    check("re-opening does not double count", dbmod.get_stats(USER_ID)["studied_exhibits"] == 1)

    print("\n" + "=" * 74)
    print("3. HOW IT WORKS")
    print("=" * 74)
    await h.press(f"how:{target['id']}")
    check("How It Works screen", "How It Works" in h.screen.shown)
    check("shows the exhibit's own explanation", target["how_it_works"][:40] in h.screen.shown)
    check("photo kept (caption edited, no new message)", bool(h.screen.photo) and h.screen.edits >= 1)
    check("button: Back to Exhibit", any("Back to Exhibit" in b for b in buttons(h.screen)))
    await h.press(f"item:{target['id']}")
    check("returning shows the full card again", "Period:" in h.screen.shown)

    print("\n" + "=" * 74)
    print("4. FAVORITES")
    print("=" * 74)
    check("not favourite initially", dbmod.is_favorite(USER_ID, target["id"]) is False)
    await h.press(f"favorite:toggle:{target['id']}")
    check("toggle adds to favourites", dbmod.is_favorite(USER_ID, target["id"]) is True)
    check("card offers removal", any("Remove from Favorites" in b for b in buttons(h.screen)))
    await h.press("favorites")
    check("favourites list contains the exhibit", target["name"] in h.screen.shown)
    check("favourites list has exactly 1 exhibit button", len(find_buttons(h.screen, "item:")) == 1)
    fav_button = find_buttons(h.screen, "item:")[0]
    check("saved counter shown", "saved 1 exhibit" in h.screen.shown, h.screen.shown)
    await h.press(fav_button)
    check("exhibit opens from favourites", "Period:" in h.screen.shown)
    await h.press(f"favorite:toggle:{target['id']}")
    check("toggle removes from favourites", dbmod.is_favorite(USER_ID, target["id"]) is False)
    await h.press("favorites")
    check("empty-favourites message", "not saved any exhibits" in h.screen.shown, h.screen.shown)

    print("\n" + "=" * 74)
    print("5. PERSONAL STATISTICS")
    print("=" * 74)
    await h.press("stats")
    shown = h.screen.shown
    check("statistics screen", "Personal Statistics" in shown)
    check(f"studied: 1 of {len(INVENTIONS)}", f"Exhibits studied: 1 of {len(INVENTIONS)}" in shown, shown)
    check("halls opened: 1 of 4", "Halls opened: 1 of 4" in shown, shown)
    check("favourites: 0", "Favorites saved: 0" in shown, shown)
    check("quiz answers line", "Correct quiz answers: no quiz answers yet" in shown, shown)
    check("quizzes completed line", "Quizzes completed: 0" in shown, shown)

    print("\n" + "=" * 74)
    print("6. THIS DAY IN HISTORY")
    print("=" * 74)
    today = datetime.datetime.now().date()
    await h.press("history:today")
    check("history screen", "This Day in History" in h.screen.shown)
    check("today's date in the heading",
          f"{today.day} {handlers.MONTH_NAMES[today.month - 1]}" in h.screen.shown, h.screen.shown[:120])
    has_exact = any((e["month"], e["day"]) == (today.month, today.day) for e in handlers.HISTORY)
    if has_exact:
        ev = next(e for e in handlers.HISTORY if (e["month"], e["day"]) == (today.month, today.day))
        check("exact-date event shown", ev["title"] in h.screen.shown, h.screen.shown[:200])
    else:
        check("nearest-date fallback shown", "closest ones are" in h.screen.shown, h.screen.shown[:200])
    print(f"  note: today ({today.day} {handlers.MONTH_NAMES[today.month-1]}) "
          f"{'has' if has_exact else 'has NO'} dated event")
    linked = find_buttons(h.screen, "item:")
    print(f"  linked exhibit buttons: {linked}")
    if linked:
        await h.press(linked[0])
        check("related exhibit opens from history", "Period:" in h.screen.shown)
    for forced, label in [(datetime.date(2024, 1, 24), "24 January (known event)"),
                          (datetime.date(2024, 6, 15), "15 June (likely empty)")]:
        text, related = handlers.build_history(forced)
        check(f"build_history works for {label}", "This Day in History" in text and len(text) > 40)
    exact_hits = sum(1 for e in handlers.HISTORY
                     if (e["month"], e["day"]) in {(x["month"], x["day"]) for x in handlers.HISTORY})
    covered = len({(e["month"], e["day"]) for e in handlers.HISTORY})
    check("history covers many calendar days", covered >= 50, f"{covered} distinct days of 366")

    print("\n" + "=" * 74)
    print("7. INVENTION MAP")
    print("=" * 74)
    await h.press("map")
    check("map screen", "Invention Map" in h.screen.shown)
    check("continents shown", all(c in h.screen.shown for c in ("Europe", "North America", "Oceania")))
    countries = find_buttons(h.screen, "map:country:")
    check(f"all {len(handlers.COUNTRIES)} countries listed", len(countries) == len(handlers.COUNTRIES),
          f"{len(countries)} buttons")
    check("per-country counts in text", "вЂ”" in h.screen.shown)
    for cb in countries:
        country = cb.split(":", 2)[2]
        await h.press(cb)
        expected = [i for i in INVENTIONS if country in i["map_countries"]]
        listed = find_buttons(h.screen, "item:")
        check(f"{country}: {len(expected)} exhibit(s) listed", len(listed) == len(expected),
              f"{len(listed)} buttons vs {len(expected)}")
    await h.press(countries[0])
    check("country page has a way back to the map", any("Back to Map" in b for b in buttons(h.screen)))

    print("\n" + "=" * 74)
    print("8. SEARCH & FILTERS")
    print("=" * 74)
    await h.press("search")
    check("filters screen", "Search & Filters" in h.screen.shown)
    check("all 43 exhibits match with no filters", "Matching exhibits: 43" in h.screen.shown, h.screen.shown)
    for label in ["All Countries", "Filter by Hall", "Filter by Period", "Reset Filters", "Show Results"]:
        check(f"filters button: {label}", any(label in b for b in buttons(h.screen)))
    await h.press("filter:hall:menu")
    check("hall submenu", "Filter by Hall" in h.screen.shown)
    await h.press("filter:hall:2")
    check("hall filter applied", "Hall: Hall 2" in h.screen.shown, h.screen.shown)
    await h.press("filter:country:United States")
    check("country filter applied", "Country: рџ‡єрџ‡ё United States" in h.screen.shown, h.screen.shown)
    await h.press("filter:period:menu")
    check("period submenu", "Filter by Period" in h.screen.shown)
    await h.press("filter:period:19th century")
    check("period filter applied", "Period: 19th century" in h.screen.shown, h.screen.shown)
    expected = handlers.apply_filters(
        INVENTIONS, {"country": "United States", "hall": "2", "period": "19th century"})
    print(f"  expected matches: {[i['name'] for i in expected]}")
    await h.press("filter:results")
    check(f"results screen reports {len(expected)}", f"{len(expected)} exhibit" in h.screen.shown, h.screen.shown)
    check("results buttons match", len(find_buttons(h.screen, "item:")) == len(expected))
    if expected:
        check("result names correct",
              all(i["name"] in h.screen.shown for i in expected) or len(find_buttons(h.screen, "item:")) == len(expected))
    await h.press("filter:results")
    check("results have a way back to the filters", any("Change Filters" in b for b in buttons(h.screen)))
    await h.press("filter:reset")
    check("reset clears everything", all(x in h.screen.shown for x in ("Country: All", "Hall: All", "Period: All")),
          h.screen.shown)

    await h.press("search")
    await h.state.set_state(handlers.SearchState.waiting_for_query)
    await h.user_text("bell", handlers.search)
    check("keyword search 'bell' finds results", "Found" in h.screen.shown, h.screen.shown[:160])
    await h.state.set_state(handlers.SearchState.waiting_for_query)
    await h.user_text("qqqzzz", handlers.search)
    check("no-match search handled", "No matching exhibits found" in h.screen.shown, h.screen.shown[:160])
    await h.state.set_state(handlers.SearchState.waiting_for_query)
    await h.user_text("colour", handlers.search)
    found_colour = "Found" in h.screen.shown
    await h.state.set_state(handlers.SearchState.waiting_for_query)
    await h.user_text("color", handlers.search)
    check("American spelling 'color' also finds results",
          found_colour and "Found" in h.screen.shown, h.screen.shown[:160])
    # search respects the active filters
    await h.press("search")
    await h.press("filter:country:United States")
    await h.state.set_state(handlers.SearchState.waiting_for_query)
    await h.user_text("telephone", handlers.search)
    check("search respects active country filter", "Active filters" in h.screen.shown, h.screen.shown[:200])

    print("\n" + "=" * 74)
    print("9. QUIZ")
    print("=" * 74)
    await h.press("quiz:start")
    check("quiz started", "Question 1/10" in h.screen.shown, h.screen.shown)
    check("options are labelled A/B/C/D",
          all(any(f"{l}." in b for b in buttons(h.screen)) for l in "ABCD"),
          str(buttons(h.screen)))
    for q in range(10):
        data = await h.state.get_data()
        order = data["quiz_option_orders"][data["quiz_index"]]
        question = handlers.QUIZ[data["quiz_order"][data["quiz_index"]]]
        display = order.index(question["answer"])  # answer correctly on purpose
        await h.press(f"quiz:answer:{q}:{display}")
        if q < 9:
            check(f"answer {q+1}: feedback + fact", "Correct!" in h.screen.shown and "рџ’Ў" in h.screen.shown)
            nxt = button_data(h.screen, "Next Question")
            check(f"answer {q+1}: Next Question button", nxt is not None)
            await h.press(nxt)
            check(f"question {q+2} of 10 shown", f"Question {q+2}/10" in h.screen.shown, h.screen.shown[:80])
    check("final score 10/10", "10/10" in h.screen.shown, h.screen.shown[-260:])
    check("perfect-score message", "Perfect score" in h.screen.shown)
    check("Play Again offered", any("Play Again" in b for b in buttons(h.screen)))
    stats = dbmod.get_stats(USER_ID)
    check("db: 10 correct answers", stats["correct_answers"] == 10, str(stats))
    check("db: 10 total answers", stats["total_answers"] == 10, str(stats))
    check("db: 1 quiz completed", stats["quizzes_completed"] == 1, str(stats))
    await h.press("stats")
    check("statistics show 10 of 10 (100%)", "10 of 10 (100%)" in h.screen.shown, h.screen.shown)
    # second, deliberately wrong quiz
    await h.press("quiz:start")
    for q in range(10):
        data = await h.state.get_data()
        order = data["quiz_option_orders"][data["quiz_index"]]
        question = handlers.QUIZ[data["quiz_order"][data["quiz_index"]]]
        wrong = next(i for i in range(len(order)) if order[i] != question["answer"])
        await h.press(f"quiz:answer:{q}:{wrong}")
        if q < 9:
            check(f"wrong answer {q+1} shows the right one", "Not quite" in h.screen.shown)
            await h.press(button_data(h.screen, "Next Question"))
    check("second quiz score 0/10", "0/10" in h.screen.shown, h.screen.shown[-200:])
    stats = dbmod.get_stats(USER_ID)
    check("db: 20 total, 10 correct after second quiz",
          stats["total_answers"] == 20 and stats["correct_answers"] == 10, str(stats))
    check("db: 2 quizzes completed", stats["quizzes_completed"] == 2, str(stats))
    await h.press("stats")
    check("accuracy recalculated to 50%", "10 of 20 (50%)" in h.screen.shown, h.screen.shown)
    # replaying an answered question must be refused
    await h.press("quiz:start")
    await h.press("quiz:answer:0:0")
    before = h.screen.shown
    await h.press("quiz:answer:0:0")
    check("double answer refused", dbmod.get_stats(USER_ID)["total_answers"] == 21,
          str(dbmod.get_stats(USER_ID)))

    print("\n" + "=" * 74)
    print("10. FEEDBACK")
    print("=" * 74)
    await h.press("feedback")
    check("feedback prompt", "Suggestions & Feedback" in h.screen.shown)
    await h.state.set_state(handlers.FeedbackState.waiting_for_message)
    await h.user_text("Please add the laser!", handlers.receive_feedback)
    sent = h.admin_inbox[-1][1] if h.admin_inbox else ""
    check("forwarded to the admin", "Please add the laser!" in sent)
    check("admin message has sender info", str(USER_ID) in sent and "Test User" in sent, sent[:150])
    check("confirmation to the user", "sent to the project team" in h.screen.shown, h.screen.shown)

    print("\n" + "=" * 74)
    print("11. TEAM / UNKNOWN INPUT / HELP")
    print("=" * 74)
    await h.press("team")
    check("team screen", "Project Team" in h.screen.shown)
    help_msg = h.attach(FakeMessage())
    help_msg.from_user = MagicMock(id=USER_ID)
    await handlers.help_command(help_msg)
    check("/help works", "/start" in h.screen.shown)
    await h.user_text("hello there", handlers.unknown_message)
    check("unknown text answered with a menu hint", "menu buttons" in h.screen.shown, h.screen.shown)

    print("\n" + "=" * 74)
    print("12. DATA & LIMITS")
    print("=" * 74)
    check("43 exhibits", len(INVENTIONS) == 43, str(len(INVENTIONS)))
    check("unique ids", len({i['id'] for i in INVENTIONS}) == 43)
    check("all halls valid", all(str(i["hall"]) in handlers.HALLS for i in INVENTIONS))
    check("all map_countries valid",
          all(c in handlers.COUNTRY_INFO for i in INVENTIONS for c in i["map_countries"]))
    check("all how_it_works filled", all(i["how_it_works"].strip() for i in INVENTIONS))
    check("all sources present", all(i["sources"] for i in INVENTIONS))
    missing_images = [i["id"] for i in INVENTIONS if not i.get("image_url")]
    check("every exhibit has an image_url", not missing_images, str(missing_images))
    check("66 history events", len(handlers.HISTORY) == 66, str(len(handlers.HISTORY)))
    check("history related_id valid",
          all(e["related_id"] in BY_ID for e in handlers.HISTORY if e.get("related_id")))
    await h.press("catalog")
    n_items = len(find_buttons(h.screen, "item:"))
    check("catalogue lists all 43 exhibits", n_items == 43, f"{n_items} buttons")
    print(f"  catalogue keyboard: {n_items} buttons in {row_count(h.screen)} rows "
          f"(Telegram limit: 100 buttons, 100 rows)  -> {'OK' if n_items <= 100 else 'TOO MANY'}")
    check("catalogue under Telegram's 100-button limit", n_items <= 100, f"{n_items}")

    print("\n" + "=" * 74)
    print("SUMMARY")
    print("=" * 74)
    print(f"  passed: {len(PASS)}")
    print(f"  failed: {len(FAIL)}")
    for name, detail in FAIL:
        print(f"    FAIL {name}" + (f"  -> {detail}" if detail else ""))
    if h.errors:
        print("  route errors:", h.errors[:5])
    real_after = db_hash(REAL_DB)
    print(f"  real data/museum.db untouched: {real_before == real_after} ({real_before})")
    if TEST_DB.exists():
        TEST_DB.unlink()
    return 1 if FAIL else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))

