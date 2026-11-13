from math import ceil

from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton

ITEMS_PER_PAGE = 8
FAVORITE_ADD_TEXT = "⭐ Add Favorite"
FAVORITE_REMOVE_TEXT = "💔 Remove Favorite"


def btn(text: str, callback: str) -> InlineKeyboardButton:
    return InlineKeyboardButton(
        text=text,
        callback_data=callback
    )


def chunk(buttons: list, size: int = 2) -> list[list]:
    """Split buttons into rows of `size` buttons (a compact grid instead of one long column)."""
    return [buttons[i:i + size] for i in range(0, len(buttons), size)]


def nav_row() -> list:
    """The usual pair of buttons at the bottom of a screen."""
    return [btn("⬅️ Museum Menu", "museum"), btn("🏠 Main Menu", "home")]


# ---------------------------------------------------------------- menus
def main_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [btn("🏛 Enter the Museum", "museum")],
        [btn("⭐ Favorites", "favorites"), btn("📊 Statistics", "stats")],
        [btn("📅 This Day", "history:today"), btn("🗺 Map", "map")],
        [btn("🔎 Search", "search"), btn("🧠 Quiz", "quiz:start")],
        [btn("💬 Feedback", "feedback"), btn("👥 Team", "team")],
    ])


def museum_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [btn("🏛 Explore the Halls", "halls")],
        [btn("📚 Catalogue", "catalog"), btn("🔎 Search", "search")],
        [btn("⭐ Favorites", "favorites"), btn("🗺 Map", "map")],
        [btn("📊 Statistics", "stats"), btn("⬅️ Main Menu", "home")],
    ])


def halls_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [btn("Hall 1 · 17th–18th centuries", "hall:1")],
        [btn("Hall 2 · 19th century", "hall:2")],
        [btn("Hall 3 · 1900–1950", "hall:3")],
        [btn("Hall 4 · 1950–present", "hall:4")],
        nav_row(),
    ])


# ---------------------------------------------------------------- lists of exhibits (paged)
def page_count(total: int, per_page: int = ITEMS_PER_PAGE) -> int:
    return max(1, ceil(total / per_page))


def paged_items_keyboard(
    items,
    key: str,
    page: int = 0,
    footer: list | None = None,
    per_page: int = ITEMS_PER_PAGE,
    prefix: str = "",
) -> InlineKeyboardMarkup:
    """A page of exhibits (one per row so full names stay readable), a pager row
    ◀️ 2/5 ▶️ when there is more than one page, and the footer rows."""
    pages = page_count(len(items), per_page)
    page = page % pages
    rows = [
        [btn(f"{prefix}{item['name']}", f"item:{item['id']}")]
        for item in items[page * per_page:(page + 1) * per_page]
    ]
    if pages > 1:
        rows.append([
            btn("◀️", f"pg:{(page - 1) % pages}:{key}"),
            btn(f"{page + 1}/{pages}", "noop"),
            btn("▶️", f"pg:{(page + 1) % pages}:{key}"),
        ])
    rows.extend(footer if footer is not None else [nav_row()])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def items_keyboard(items, prefix="item:", key=None, page=0, footer=None) -> InlineKeyboardMarkup:
    """Exhibit list. With a `key` it is paged; without one it is a plain list (old behaviour)."""
    if key is not None:
        return paged_items_keyboard(items, key, page, footer)
    rows = [[btn(item["name"], f"{prefix}{item['id']}")] for item in items]
    rows.extend(footer if footer is not None else [nav_row()])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def hall_items_keyboard(items, hall_id: str, page: int = 0) -> InlineKeyboardMarkup:
    return paged_items_keyboard(
        items, f"hall:{hall_id}", page,
        footer=[[btn("⬅️ All Halls", "halls"), btn("🏠 Main Menu", "home")]],
    )


def favorites_keyboard(items, page: int = 0) -> InlineKeyboardMarkup:
    return paged_items_keyboard(items, "fav", page, prefix="⭐ ")


def results_keyboard(items, page: int = 0) -> InlineKeyboardMarkup:
    return paged_items_keyboard(
        items, "res", page,
        footer=[[btn("🔎 Change Filters", "search")], nav_row()],
    )


def map_items_keyboard(items, country: str, page: int = 0) -> InlineKeyboardMarkup:
    """Exhibits of one country on the invention map."""
    return paged_items_keyboard(
        items, f"country:{country}", page,
        footer=[[btn("🗺 Back to Map", "map"), btn("🏠 Main Menu", "home")]],
    )


# ---------------------------------------------------------------- exhibit card
def navigation_keyboard(
    item,
    is_favorite=False,
    prev_id: str | None = None,
    next_id: str | None = None,
    position: tuple | None = None,
    back: tuple | None = None,
) -> InlineKeyboardMarkup:
    """Exhibit card buttons.
    prev_id / next_id / position add the ◀️ 3/25 ▶️ pager; `back` is (label, callback)."""
    favorite_text = FAVORITE_REMOVE_TEXT if is_favorite else FAVORITE_ADD_TEXT
    back_label, back_callback = back or ("⬅️ Hall", f"hall:{item['hall']}")

    rows = []
    if prev_id and next_id and position:
        rows.append([
            btn("◀️ Prev", f"item:{prev_id}"),
            btn(f"{position[0]}/{position[1]}", "noop"),
            btn("Next ▶️", f"item:{next_id}"),
        ])
    rows.append([
        btn(favorite_text, f"favorite:toggle:{item['id']}"),
        btn("⚙️ How It Works", f"how:{item['id']}"),
    ])
    rows.append([btn(back_label, back_callback), btn("🏠 Main Menu", "home")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def how_keyboard(item, is_favorite: bool = False, back: tuple | None = None) -> InlineKeyboardMarkup:
    favorite_text = FAVORITE_REMOVE_TEXT if is_favorite else FAVORITE_ADD_TEXT
    back_label, back_callback = back or ("⬅️ Hall", f"hall:{item['hall']}")
    return InlineKeyboardMarkup(inline_keyboard=[
        [
            btn(favorite_text, f"favorite:toggle:{item['id']}"),
            btn("⬅️ Back to Exhibit", f"item:{item['id']}"),
        ],
        [btn(back_label, back_callback), btn("🏠 Main Menu", "home")],
    ])


def relabel_favorite(markup, item_id: str, saved: bool):
    """Copy of `markup` where only the favorite button's label is updated.
    Works for both the exhibit card and its How It Works view, and keeps the pager."""
    if markup is None:
        return None
    target = f"favorite:toggle:{item_id}"
    text = FAVORITE_REMOVE_TEXT if saved else FAVORITE_ADD_TEXT
    rows = [
        [btn(text if b.callback_data == target else b.text, b.callback_data) for b in row]
        for row in markup.inline_keyboard
    ]
    return InlineKeyboardMarkup(inline_keyboard=rows)


def back_keyboard(destination="home") -> InlineKeyboardMarkup:
    label = (
        "⬅️ Back"
        if destination != "home"
        else "🏠 Main Menu"
    )
    return InlineKeyboardMarkup(inline_keyboard=[
        [btn(label, destination)]
    ])


def info_keyboard() -> InlineKeyboardMarkup:
    """Simple keyboard for screens such as statistics or an empty favorites list."""
    return InlineKeyboardMarkup(inline_keyboard=[nav_row()])


def history_keyboard(items) -> InlineKeyboardMarkup:
    """Links to the museum exhibits related to the events of the day."""
    rows = [
        [btn(f"🏺 Open exhibit: {item['name']}", f"item:{item['id']}")]
        for item in items
    ]
    rows.append([btn("🏠 Main Menu", "home")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


# ---------------------------------------------------------------- quiz
def quiz_answer_keyboard(
    question_index: int,
    options: list[str]
) -> InlineKeyboardMarkup:
    rows = [
        [
            btn(
                f"{chr(65 + i)}. {option}",
                f"quiz:answer:{question_index}:{i}"
            )
        ]
        for i, option in enumerate(options)
    ]
    rows.append([btn("🏠 Quit Quiz", "home")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def quiz_result_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [btn("🔁 Play Again", "quiz:start"), btn("🏠 Main Menu", "home")],
    ])


def quiz_result_keyboard_continue(next_index: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [btn("➡️ Next Question", f"quiz:next:{next_index}"), btn("🏠 Quit Quiz", "home")],
    ])


# ---------------------------------------------------------------- map and filters
def countries_keyboard(
    countries: list[str],
    labels: dict | None = None,
) -> InlineKeyboardMarkup:
    labels = labels or {}
    buttons = [
        btn(labels.get(country, country), f"map:country:{country}")
        for country in countries
    ]
    rows = chunk(buttons, 2)
    rows.append(nav_row())
    return InlineKeyboardMarkup(inline_keyboard=rows)


def filters_keyboard(
    countries: list[str],
    halls: dict,
    result_count: int | None = None,
    labels: dict | None = None,
    active: dict | None = None,
) -> InlineKeyboardMarkup:
    """Filter screen: results button, countries in a two-column grid, hall / period
    menus side by side. `active` ({'country','hall','period'}) marks chosen filters with ✅."""
    labels = labels or {}
    active = active or {}
    rows = []

    if result_count is not None:
        rows.append([btn(f"📋 Show Results ({result_count})", "filter:results")])

    all_label = "🌍 All Countries" if active.get("country") else "✅ 🌍 All Countries"
    rows.append([btn(all_label, "filter:country:all")])

    country_buttons = []
    for country in countries:
        label = labels.get(country, f"🌍 {country}")
        if active.get("country") == country:
            label = f"✅ {label}"
        country_buttons.append(btn(label, f"filter:country:{country}"))
    rows.extend(chunk(country_buttons, 2))

    hall_label = "✅ 🏛 Hall" if active.get("hall") else "🏛 Hall"
    period_label = "✅ 📅 Period" if active.get("period") else "📅 Period"
    rows.append([btn(hall_label, "filter:hall:menu"), btn(period_label, "filter:period:menu")])
    rows.append([btn("🔄 Reset", "filter:reset"), btn("⬅️ Museum Menu", "museum")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def hall_filter_keyboard(halls: dict, active: str | None = None) -> InlineKeyboardMarkup:
    rows = [[btn("✅ 🏛 All Halls" if not active else "🏛 All Halls", "filter:hall:all")]]
    for hall_id, hall in halls.items():
        label = f"Hall {hall_id} · {hall['title']}"
        if active == hall_id:
            label = f"✅ {label}"
        rows.append([btn(label, f"filter:hall:{hall_id}")])
    rows.append([btn("⬅️ Back to Filters", "search")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def period_filter_keyboard(periods: list[str], active: str | None = None) -> InlineKeyboardMarkup:
    rows = [[btn("✅ 📅 All Periods" if not active else "📅 All Periods", "filter:period:all")]]
    period_buttons = [
        btn(f"✅ {period}" if active == period else period, f"filter:period:{period}")
        for period in periods
    ]
    rows.extend(chunk(period_buttons, 2))
    rows.append([btn("⬅️ Back to Filters", "search")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def favorite_toggle_keyboard(item, saved: bool = False) -> InlineKeyboardMarkup:
    label = FAVORITE_REMOVE_TEXT if saved else FAVORITE_ADD_TEXT

    return InlineKeyboardMarkup(inline_keyboard=[
        [btn(label, f"favorite:toggle:{item['id']}")],
        [btn("⬅️ Hall", f"hall:{item['hall']}"), btn("🏠 Main Menu", "home")],
    ])
