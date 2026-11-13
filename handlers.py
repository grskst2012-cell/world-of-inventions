import asyncio
import json
import random
import re
from collections import Counter
from datetime import date, datetime
from pathlib import Path

import aiohttp
from aiogram import Router, F, Bot
from aiogram.exceptions import TelegramBadRequest
from aiogram.filters import Command, CommandObject, StateFilter
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import Message, CallbackQuery, BufferedInputFile, FSInputFile, InputMediaPhoto

from config import MUSEUM_NAME, ADMIN_ID
from database import (
    toggle_favorite, get_favorites, is_favorite, mark_exhibit_studied,
    mark_hall_opened, record_answer, record_quiz_completed, get_stats,
)
from keyboards import (
    main_keyboard, museum_keyboard, halls_keyboard, items_keyboard,
    navigation_keyboard, back_keyboard, quiz_answer_keyboard,
    quiz_result_keyboard, quiz_result_keyboard_continue, favorites_keyboard,
    how_keyboard, info_keyboard, results_keyboard, map_items_keyboard,
    history_keyboard, countries_keyboard, filters_keyboard, hall_filter_keyboard,
    period_filter_keyboard, hall_items_keyboard, relabel_favorite, ITEMS_PER_PAGE,
)

router = Router()
DATA_FILE = Path(__file__).resolve().parent / "data" / "inventions.json"
HISTORY_FILE = Path(__file__).resolve().parent / "data" / "history.json"
# Exhibit photos are stored with the project (the site serves the same files),
# so the bot never depends on a remote image link being alive.
IMAGE_DIR = Path(__file__).resolve().parent / "site" / "public" / "exhibits"

HALLS = {
    "1": {"title": "17th–18th centuries", "name": "Foundations of Modern Science",
          "description": "Scientific breakthroughs and early machines that helped launch the age of invention."},
    "2": {"title": "19th century", "name": "The Industrial Age",
          "description": "Steam power, communication, household devices and new ways to travel."},
    "3": {"title": "1900–1950", "name": "The Age of Modern Technology",
          "description": "Early aviation, modern medicine, radio and the first electronic-era inventions."},
    "4": {"title": "1950–present", "name": "The Digital and Connected Age",
          "description": "Computing, 3D printing, digital media and artificial intelligence."},
}

# A larger question bank. Each round randomly selects 10 questions and shuffles answers.
QUIZ_ROUND_SIZE = 10
QUIZ = [
    {"question": "Who is commonly credited with inventing the telephone?", "options": ["Alexander Graham Bell", "Thomas Edison", "James Watt", "Tim Berners-Lee"], "answer": 0, "fact": "Bell was awarded a key telephone patent in 1876, although several inventors contributed to telephone technology."},
    {"question": "Which inventor is famous for major improvements to the steam engine?", "options": ["James Watt", "Charles Babbage", "John Logie Baird", "Alexander Fleming"], "answer": 0, "fact": "Watt's separate condenser made steam engines significantly more efficient."},
    {"question": "Who created basketball in 1891?", "options": ["James Naismith", "Alexander Fleming", "Tim Berners-Lee", "John Dunlop"], "answer": 0, "fact": "Canadian-born James Naismith invented basketball while working in Springfield, Massachusetts."},
    {"question": "Who invented the World Wide Web?", "options": ["Tim Berners-Lee", "Steve Jobs", "Alan Turing", "Bill Gates"], "answer": 0, "fact": "Berners-Lee proposed the World Wide Web in 1989 while working at CERN."},
    {"question": "What does WWW stand for?", "options": ["World Wide Web", "Wide World Window", "Web World Wire", "World Wireless Work"], "answer": 0, "fact": "The World Wide Web links pages and resources using web technologies."},
    {"question": "Which invention is associated with John Logie Baird?", "options": ["Early television", "The steam engine", "The safety elevator", "The World Wide Web"], "answer": 0, "fact": "Baird demonstrated an early working television system in the 1920s."},
    {"question": "Who is associated with the invention of the pneumatic tyre in the 1880s?", "options": ["John Boyd Dunlop", "James Watt", "Charles Darwin", "Isaac Newton"], "answer": 0, "fact": "Dunlop developed a practical pneumatic tyre for bicycles in the 1880s."},
    {"question": "Who designed an early general-purpose mechanical computer called the Analytical Engine?", "options": ["Charles Babbage", "Alan Turing", "Tim Berners-Lee", "Michael Faraday"], "answer": 0, "fact": "Babbage designed the Analytical Engine in the 19th century, though it was not completed in his lifetime."},
    {"question": "Who wrote notes for the Analytical Engine that are often described as an early computer program?", "options": ["Ada Lovelace", "Mary Anning", "Rosalind Franklin", "Florence Nightingale"], "answer": 0, "fact": "Ada Lovelace's notes included an algorithm intended for Babbage's machine."},
    {"question": "Which scientist discovered penicillin in 1928?", "options": ["Alexander Fleming", "Isaac Newton", "Michael Faraday", "Joseph Lister"], "answer": 0, "fact": "Fleming noticed that a mould inhibited bacterial growth; later work developed penicillin into a medicine."},
    {"question": "Which two Canadian scientists are especially associated with the discovery of insulin's medical potential?", "options": ["Frederick Banting and Charles Best", "James Naismith and John McCrae", "Alexander Graham Bell and Sanford Fleming", "David Suzuki and William Osler"], "answer": 0, "fact": "Banting and Best worked with colleagues at the University of Toronto in 1921."},
    {"question": "Who invented the first successful commercial typewriter?", "options": ["Christopher Latham Sholes and collaborators", "The Wright brothers", "Banting and Best", "Watson and Crick"], "answer": 0, "fact": "Sholes and collaborators developed a typewriter that entered commercial production in the 1870s."},
    {"question": "Which brothers made the first widely recognised powered, controlled airplane flight in 1903?", "options": ["Orville and Wilbur Wright", "The Lumière brothers", "The Warner brothers", "The Montgolfier brothers"], "answer": 0, "fact": "The Wright brothers flew their powered aircraft at Kitty Hawk, North Carolina."},
    {"question": "Which invention is closely associated with Samuel Morse?", "options": ["The electric telegraph and Morse code", "The telephone", "The steam locomotive", "The microwave oven"], "answer": 0, "fact": "Morse code uses sequences of dots and dashes to represent letters and numbers."},
    {"question": "What was the Penny Black?", "options": ["The world's first adhesive postage stamp used for public mail", "An early camera", "A steam locomotive", "A type of battery"], "answer": 0, "fact": "The Penny Black was issued in the United Kingdom in 1840."},
    {"question": "Who developed the first practical incandescent light bulb system for widespread use?", "options": ["Thomas Edison and his team", "James Naismith", "Tim Berners-Lee", "Alexander Fleming"], "answer": 0, "fact": "Many inventors worked on electric lighting; Edison and his team helped make a practical commercial system."},
    {"question": "Which scientist is known for foundational work on electromagnetism and the electric motor?", "options": ["Michael Faraday", "Charles Dickens", "James Cook", "John Dunlop"], "answer": 0, "fact": "Faraday's experiments with electromagnetic induction helped shape modern electrical technology."},
    {"question": "Who is commonly credited with inventing the first practical refrigerator for artificial cooling in the 19th century?", "options": ["James Harrison", "Alexander Fleming", "James Naismith", "John Logie Baird"], "answer": 0, "fact": "James Harrison, a Scottish-born Australian, developed practical mechanical refrigeration systems in Australia."},
    {"question": "Which invention allows sound to be recorded and played back?", "options": ["The phonograph", "The telescope", "The compass", "The barometer"], "answer": 0, "fact": "Thomas Edison demonstrated his phonograph in 1877."},
    {"question": "Who is associated with the invention of the first commercially successful sewing machine in the United States?", "options": ["Isaac Singer", "Alexander Graham Bell", "James Watt", "John Harrison"], "answer": 0, "fact": "Singer helped popularise sewing machines, building on earlier designs by several inventors."},
    {"question": "What did the Jacquard loom use to control patterns in weaving?", "options": ["Punched cards", "Radio waves", "Steam turbines", "Magnetic tape"], "answer": 0, "fact": "The punched-card control of the Jacquard loom later inspired ideas in computing."},
    {"question": "Who invented the first successful practical electric battery, known as the voltaic pile?", "options": ["Alessandro Volta", "Michael Faraday", "Thomas Edison", "Nikola Tesla"], "answer": 0, "fact": "Volta, an Italian physicist, presented the voltaic pile in 1800."},
    {"question": "Which technology is used to transmit information through pulses of light in thin strands?", "options": ["Fibre-optic communication", "Steam power", "Movable type", "Pneumatic tyres"], "answer": 0, "fact": "Fibre-optic cables carry data as light and are central to modern high-speed networks."},
    {"question": "Which British mathematician helped establish theoretical foundations of modern computing during World War II?", "options": ["Alan Turing", "Charles Darwin", "James Watt", "Isaac Newton"], "answer": 0, "fact": "Turing made major contributions to computation theory and wartime codebreaking."},
    {"question": "What was the main purpose of the early telegraph?", "options": ["To send messages over long distances using electrical signals", "To print photographs in colour", "To cool food", "To measure earthquakes"], "answer": 0, "fact": "Electric telegraphs greatly sped up long-distance communication in the 19th century."},
    {"question": "Which device measures atmospheric pressure and can help forecast weather?", "options": ["A barometer", "A microscope", "A phonograph", "A typewriter"], "answer": 0, "fact": "Changes in air pressure are useful clues for weather forecasting."},
    {"question": "Which invention made it easier to reproduce books and documents in large numbers before modern digital printing?", "options": ["The printing press", "The telephone", "The electric fan", "The bicycle tyre"], "answer": 0, "fact": "Movable-type printing spread through Europe after Johannes Gutenberg's 15th-century press."},
    {"question": "Which technology made it possible for computers to exchange information across interconnected networks?", "options": ["Internet networking protocols", "The steam engine", "The sewing machine", "The pneumatic tyre"], "answer": 0, "fact": "The internet grew through decades of research and the development of shared networking protocols."},
    {"question": "Which Australian inventor is associated with the black box flight recorder's early development?", "options": ["David Warren", "James Harrison", "John Dunlop", "Howard Florey"], "answer": 0, "fact": "Australian scientist David Warren proposed a flight recorder that could preserve cockpit information."},
    {"question": "What is the main purpose of a safety elevator brake?", "options": ["To help stop an elevator if its suspension system fails", "To make a telephone louder", "To cool an engine", "To print a document"], "answer": 0, "fact": "Elisha Otis demonstrated an elevator safety device in 1854, helping improve public confidence in lifts."},
    {"question": "Which scientist is associated with the discovery of the structure of DNA using X-ray diffraction images that contributed to the breakthrough?", "options": ["Rosalind Franklin", "Ada Lovelace", "Mary Anning", "Florence Nightingale"], "answer": 0, "fact": "Franklin's X-ray diffraction work provided important evidence about DNA's structure."},
    {"question": "Which device converts mechanical energy into electrical energy?", "options": ["An electric generator", "A loudspeaker only", "A typewriter", "A microscope"], "answer": 0, "fact": "Generators use electromagnetic induction to produce electrical energy."},
    {"question": "What is an invention?", "options": ["A newly created device, method or process", "Only a famous painting", "A type of weather", "A historical date"], "answer": 0, "fact": "Inventions can be objects, processes or new ways of solving problems."},
    {"question": "Which invention helped people speak to one another over long distances in real time?", "options": ["The telephone", "The telescope", "The printing press", "The barometer"], "answer": 0, "fact": "The telephone transmitted speech electrically, changing personal and business communication."},
    {"question": "Which machine is designed to turn heat energy from steam into mechanical work?", "options": ["A steam engine", "A barometer", "A microscope", "A phonograph"], "answer": 0, "fact": "Steam engines powered pumps, factories, ships and locomotives during industrialisation."},
    {"question": "What is the key role of a computer algorithm?", "options": ["To give a sequence of steps for solving a problem", "To generate electricity directly", "To cool a room", "To measure air pressure"], "answer": 0, "fact": "Algorithms are step-by-step procedures used in computing and many other fields."},
    {"question": "Which invention made personal transport practical for many people using two wheels and pedals?", "options": ["The bicycle", "The telegraph", "The printing press", "The microscope"], "answer": 0, "fact": "The bicycle evolved through many designs during the 19th century."},
    {"question": "Why are standardised shipping containers important?", "options": ["They make cargo easier to transfer between ships, trains and trucks", "They produce electricity", "They send radio signals", "They replace computer memory"], "answer": 0, "fact": "Containerisation transformed global trade by standardising cargo handling."},
]


# Countries shown on the invention map: (flag, continent).
COUNTRY_INFO = {
    "England": ("🇬🇧", "Europe"),
    "Scotland": ("🇬🇧", "Europe"),
    "Ireland": ("🇮🇪", "Europe"),
    "France": ("🇫🇷", "Europe"),
    "United States": ("🇺🇸", "North America"),
    "Canada": ("🇨🇦", "North America"),
    "Australia": ("🇦🇺", "Oceania"),
    "International": ("🌐", "International"),
}
CONTINENTS = [("Europe", "🌍"), ("North America", "🌎"), ("Oceania", "🌏")]
PERIOD_ORDER = ["17th century", "18th century", "19th century", "20th century", "21st century"]
MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July",
               "August", "September", "October", "November", "December"]
HISTORY_KIND_ICONS = {"invention": "💡", "discovery": "🔬", "milestone": "🚀"}


class SearchState(StatesGroup):
    waiting_for_query = State()


class FeedbackState(StatesGroup):
    waiting_for_message = State()


def load_inventions():
    with DATA_FILE.open("r", encoding="utf-8") as file:
        items = json.load(file)

    required = {"id", "name", "hall", "period", "year", "inventor", "country",
                "origin", "features", "significance", "further_facts", "sources",
                "how_it_works", "map_countries"}
    ids = []
    for item in items:
        missing = required - item.keys()
        if missing:
            raise ValueError(f"Invention {item.get('id', '?')} is missing fields: {sorted(missing)}")
        if str(item["hall"]) not in HALLS:
            raise ValueError(f"Invention {item['id']} has an invalid hall: {item['hall']}")
        unknown = [c for c in item["map_countries"] if c not in COUNTRY_INFO]
        if unknown or not item["map_countries"]:
            raise ValueError(f"Invention {item['id']} has invalid map_countries: {item['map_countries']}")
        ids.append(item["id"])
    if len(ids) != len(set(ids)):
        raise ValueError("Duplicate invention IDs found in data/inventions.json")
    return items


INVENTIONS = load_inventions()
BY_ID = {item["id"]: item for item in INVENTIONS}


IMAGE_REQUEST_HEADERS = {"User-Agent": "WorldOfInventionsBot/1.0 (educational project)"}
MAX_IMAGE_BYTES = 5 * 1024 * 1024  # Telegram limit for photos


CAPTION_LIMIT = 1024  # Telegram limit for photo captions

# Telegram file_id of every photo already uploaded once: later cards reuse it instantly.
PHOTO_FILE_IDS: dict[str, str] = {}


def local_photo(item):
    path = IMAGE_DIR / f"{item['id']}.jpg"
    return FSInputFile(path, filename=path.name) if path.is_file() else None


def remember_photo(item, sent):
    photo = getattr(sent, "photo", None)
    if photo:
        PHOTO_FILE_IDS[item["id"]] = photo[-1].file_id


def load_history():
    with HISTORY_FILE.open("r", encoding="utf-8") as file:
        events = json.load(file)
    required = {"month", "day", "year", "kind", "title", "text"}
    for event in events:
        missing = required - event.keys()
        if missing:
            raise ValueError(f"History event {event.get('title', '?')} is missing fields: {sorted(missing)}")
        date(2001, event["month"], event["day"])  # raises ValueError for impossible dates
        related = event.get("related_id")
        if related is not None and related not in BY_ID:
            raise ValueError(f"History event {event['title']} refers to an unknown exhibit: {related}")
    return events


HISTORY = load_history()

# Countries of the map, most inventions first.
_country_counts = Counter(c for item in INVENTIONS for c in item["map_countries"])
COUNTRIES = [c for c, _ in sorted(_country_counts.items(), key=lambda pair: (-pair[1], pair[0]))]
COUNTRY_LABELS = {c: f"{COUNTRY_INFO[c][0]} {c}" for c in COUNTRIES}
PERIODS = sorted(
    {item["period"] for item in INVENTIONS},
    key=lambda p: PERIOD_ORDER.index(p) if p in PERIOD_ORDER else len(PERIOD_ORDER),
)


# --------------------------------------------------------------------------- helpers
def utf16_length(text: str) -> int:
    """Telegram counts caption length in UTF-16 code units (emoji count as 2)."""
    return len(text.encode("utf-16-le")) // 2


async def db_call(func, *args, default=None):
    """Run a (blocking) database function without freezing the bot.
    A database problem is logged and never breaks the museum itself."""
    try:
        return await asyncio.to_thread(func, *args)
    except Exception as exc:
        print(f"Database error in {func.__name__}: {exc}")
        return default


def is_not_modified(exc: Exception) -> bool:
    return "message is not modified" in str(exc)


def message_has_button(message: Message, callback_data: str) -> bool:
    markup = message.reply_markup
    if not markup:
        return False
    return any(b.callback_data == callback_data for row in markup.inline_keyboard for b in row)


def message_has_button_prefix(message: Message, prefix: str) -> bool:
    markup = message.reply_markup
    if not markup:
        return False
    return any(
        (b.callback_data or "").startswith(prefix)
        for row in markup.inline_keyboard for b in row
    )


async def safe_delete(message: Message):
    try:
        await message.delete()
    except Exception as exc:
        print(f"Could not delete the previous message: {exc}")


async def download_image(item):
    """Download the exhibit image ourselves (with a proper User-Agent) so it can be uploaded to Telegram."""
    url = item.get("image_url")
    if not url:
        return None
    try:
        timeout = aiohttp.ClientTimeout(total=20)
        async with aiohttp.ClientSession(headers=IMAGE_REQUEST_HEADERS, timeout=timeout) as session:
            async with session.get(url) as response:
                response.raise_for_status()
                if not response.headers.get("Content-Type", "").startswith("image/"):
                    raise ValueError("the URL did not return an image")
                data = await response.content.read(MAX_IMAGE_BYTES + 1)
        if len(data) > MAX_IMAGE_BYTES:
            raise ValueError("the image is larger than 5 MB")
        return BufferedInputFile(data, filename=f"{item['id']}.jpg")
    except Exception as exc:
        print(f"Could not download the exhibit image for {item['id']}: {exc}")
        return None


async def show_text(message: Message, text: str, reply_markup=None, **kwargs):
    """Show a text screen in place of whatever the bot message currently is.
    A text message is edited; a photo message cannot become text, so the new text
    message is sent and the old photo message (with its caption) is deleted."""
    if message.photo:
        await message.answer(text, reply_markup=reply_markup, **kwargs)
        await safe_delete(message)
        return
    try:
        await message.edit_text(text, reply_markup=reply_markup, **kwargs)
    except TelegramBadRequest as exc:
        if not is_not_modified(exc):
            raise


async def show_card_text(message: Message, text: str, reply_markup):
    """Replace the text of an exhibit card (for example with the 'How It Works' text).
    The photo stays in place; without a photo this is an ordinary text screen."""
    if message.photo:
        if utf16_length(text) <= CAPTION_LIMIT:
            try:
                await message.edit_caption(caption=text, reply_markup=reply_markup)
                return
            except TelegramBadRequest as exc:
                if is_not_modified(exc):
                    return
                print(f"Could not edit the caption: {exc}")
            except Exception as exc:
                print(f"Could not edit the caption: {exc}")
    await show_text(message, text, reply_markup=reply_markup, disable_web_page_preview=True)


async def show_item_card(message: Message, item, text: str, reply_markup, reuse_photo: bool = False):
    """Show an exhibit as ONE message: photo + the exhibit text as its caption.
    The card is edited in place when the current message is already a photo,
    otherwise it replaces the current message. If the image is unavailable
    (or the text does not fit into a caption) the exhibit is shown as plain text."""
    has_photo = bool(PHOTO_FILE_IDS.get(item["id"]) or local_photo(item) or item.get("image_url"))
    url = has_photo or None
    caption_length = utf16_length(text)
    if url and caption_length > CAPTION_LIMIT:
        print(f"Exhibit {item['id']}: text is {caption_length} characters; a caption allows {CAPTION_LIMIT}. Showing text only.")
        url = None
    if url and reuse_photo and message.photo:
        # Coming back from the "How It Works" view: the photo is already the right one.
        try:
            await message.edit_caption(caption=text, reply_markup=reply_markup)
            return
        except TelegramBadRequest as exc:
            if is_not_modified(exc):
                return
            print(f"Could not restore the caption for {item['id']}: {exc}")
        except Exception as exc:
            print(f"Could not restore the caption for {item['id']}: {exc}")
    if url:
        # Order: the cached Telegram file_id, the photo stored with the project,
        # then the remote image_url (fetched by Telegram, then downloaded by the bot).
        for attempt in ("file_id", "local", "url", "download"):
            if attempt == "file_id":
                media = PHOTO_FILE_IDS.get(item["id"])
            elif attempt == "local":
                media = local_photo(item)
            elif attempt == "url":
                media = item.get("image_url")
            else:
                media = await download_image(item) if item.get("image_url") else None
            if media is None:
                continue
            try:
                if message.photo:
                    sent = await message.edit_media(
                        InputMediaPhoto(media=media, caption=text), reply_markup=reply_markup
                    )
                else:
                    sent = await message.answer_photo(photo=media, caption=text, reply_markup=reply_markup)
                    await safe_delete(message)
                remember_photo(item, sent)
                return
            except TelegramBadRequest as exc:
                if is_not_modified(exc):
                    return
                print(f"Could not show the image for {item['id']} ({attempt}): {exc}")
            except Exception as exc:
                print(f"Could not show the image for {item['id']} ({attempt}): {exc}")
    await show_text(message, text, reply_markup=reply_markup, disable_web_page_preview=True)


SPELLING_VARIANTS = {
    "tire": "tyre", "tires": "tyre",
    "color": "colour", "colors": "colour",
    "colorization": "colourisation", "colourization": "colourisation", "colorisation": "colourisation",
}


def normalize_text(text: str) -> str:
    """Lower-case text and map common American spellings to the British ones used in the museum."""
    return re.sub(r"[a-z]+", lambda m: SPELLING_VARIANTS.get(m.group(0), m.group(0)), text.casefold())


def format_invention(item):
    text = (
        f"🏺 {item['name']}\n\n"
        f"📅 Period: {item['period']}\n"
        f"Year: {item['year']}\n"
        f"👤 Inventor: {item['inventor']}\n"
        f"🌍 Country / context: {item['country']}\n\n"
        f"📜 Origin\n{item['origin']}\n\n"
        f"⚙️ Features\n{item['features']}\n\n"
        f"🌐 Significance\n{item['significance']}\n\n"
        f"💡 Further Facts\n{item['further_facts']}"
    )
    sources = item.get("sources", [])
    if sources:
        text += "\n\n📚 Sources"
        for source in sources:
            text += f"\n• {source['title']}: {source['url']}"
    return text


def main_menu_text():
    return (
        f"Welcome to {MUSEUM_NAME}! 🏛\n\n"
        "Explore remarkable inventions, discover the people behind them, "
        "and test your knowledge of the ideas that changed the world.\n\n"
        "Choose an option below to begin."
    )


# ------------------------------------------------------------------ Deep links from the site
# https://t.me/<bot>?start=<payload> opens the bot and sends "/start <payload>".
# Each payload opens the same screen as the matching menu button.
DEEP_LINKS = {
    "museum": "museum", "halls": "halls", "catalog": "catalog",
    "favorites": "favorites", "stats": "stats", "today": "history:today",
    "map": "map", "search": "search", "quiz": "quiz:start",
    "feedback": "feedback", "team": "team",
    **{f"hall{n}": f"hall:{n}" for n in HALLS},
}


class DeepLinkCallback:
    """Stands in for a button press, so a deep link reuses the button's handler as is."""

    def __init__(self, message: Message, user, data: str):
        self.message = message
        self.from_user = user
        self.data = data

    async def answer(self, text: str | None = None, show_alert: bool = False, **kwargs):
        if text:
            await self.message.answer(text)


def deep_link_target(payload: str) -> str | None:
    payload = (payload or "").strip()
    if payload.startswith("item_") and payload[5:] in BY_ID:
        return f"item:{payload[5:]}"
    return DEEP_LINKS.get(payload)


async def open_deep_link(message: Message, state: FSMContext, data: str):
    screen = await message.answer("⏳ Opening…")
    callback = DeepLinkCallback(screen, message.from_user, data)
    handlers = {
        "museum": enter_museum, "halls": show_halls, "catalog": show_catalog,
        "favorites": show_favorites, "stats": show_stats, "history:today": this_day_in_history,
        "map": show_map, "search": begin_search, "quiz:start": start_quiz,
        "feedback": begin_feedback, "team": project_team,
    }
    if data.startswith("hall:"):
        await show_hall(callback, state)
    elif data.startswith("item:"):
        await show_item(callback, state)
    else:
        handler = handlers[data]
        takes_state = handler.__code__.co_argcount > 1
        await (handler(callback, state) if takes_state else handler(callback))


@router.message(Command("start"))
async def start(message: Message, state: FSMContext, command: CommandObject | None = None):
    await state.clear()
    target = deep_link_target(command.args if command else None)
    if target:
        try:
            await open_deep_link(message, state, target)
            return
        except Exception as exc:
            print(f"Could not open the deep link {target!r}: {exc}")
    await message.answer(main_menu_text(), reply_markup=main_keyboard())


@router.message(Command("help"))
async def help_command(message: Message):
    await message.answer(
        "Use the buttons to explore the museum, save favourite exhibits, follow your "
        "statistics, discover what happened on this day in history, browse the invention "
        "map, search with filters, send feedback or play the quiz.\n\n"
        "/start — open the main menu\n/help — show this message",
        reply_markup=main_keyboard(),
    )


@router.callback_query(F.data == "home")
async def home(callback: CallbackQuery, state: FSMContext):
    await state.clear()
    await show_text(callback.message, main_menu_text(), reply_markup=main_keyboard())
    await callback.answer()


@router.callback_query(F.data == "museum")
async def enter_museum(callback: CallbackQuery, state: FSMContext):
    await state.clear()
    await show_text(callback.message, 
        "🏛 Welcome to the Museum\n\nChoose how you would like to explore the exhibits:",
        reply_markup=museum_keyboard(),
    )
    await callback.answer()


@router.callback_query(F.data == "team")
async def project_team(callback: CallbackQuery):
    await show_text(callback.message, 
        "👥 Project Team\n\n"
        "This museum is an educational project created by:\n\n"
        "• Grigoriy Kostenko\n"
        "• Matvey Mosienko\n"
        "• Sergey Isakov\n"
        "• Alexander Konopelko\n\n"
        "Thank you for visiting our project!",
        reply_markup=back_keyboard(),
    )
    await callback.answer()


@router.callback_query(F.data == "feedback")
async def begin_feedback(callback: CallbackQuery, state: FSMContext):
    await state.set_state(FeedbackState.waiting_for_message)
    await show_text(callback.message, 
        "💬 Suggestions & Feedback\n\n"
        "Have an idea, spotted a mistake, or want to suggest an invention? "
        "Send your message here and it will be forwarded to the project team.\n\n"
        "Please send one text message. Send /start to cancel.",
    )
    await callback.answer()


@router.message(FeedbackState.waiting_for_message, F.text)
async def receive_feedback(message: Message, state: FSMContext, bot: Bot):
    feedback = message.text.strip()
    if not feedback:
        await message.answer("Your message seems to be empty. Please try again.")
        return

    if not ADMIN_ID:
        await state.clear()
        await message.answer(
            "Thanks for your feedback! The feedback inbox has not been configured yet, "
            "so your message could not be forwarded. Please try again later.",
            reply_markup=main_keyboard(),
        )
        # Keep a visible server log so the developer can notice a missing configuration.
        print(f"Feedback received but ADMIN_ID is not configured. User ID: {message.from_user.id}; message: {feedback}")
        return

    sender = message.from_user
    username = f"@{sender.username}" if sender.username else "No username"
    report = (
        "📩 New museum feedback\n\n"
        f"From: {sender.full_name}\n"
        f"Username: {username}\n"
        f"Telegram ID: {sender.id}\n\n"
        f"Message:\n{feedback}"
    )
    try:
        await bot.send_message(ADMIN_ID, report)
    except Exception:
        await state.clear()
        await message.answer(
            "Sorry, I could not deliver your message right now. Please try again later.",
            reply_markup=main_keyboard(),
        )
        return

    await state.clear()
    await message.answer(
        "Thank you! Your message has been sent to the project team. 💙",
        reply_markup=main_keyboard(),
    )


@router.message(FeedbackState.waiting_for_message)
async def feedback_non_text(message: Message):
    await message.answer("Please send your suggestion as a text message, or send /start to cancel.")


@router.callback_query(F.data == "halls")
async def show_halls(callback: CallbackQuery):
    await show_text(callback.message, "🏛 Museum Halls\n\nChoose a historical period:", reply_markup=halls_keyboard())
    await callback.answer()


# ------------------------------------------------------------------ Exhibit lists (paged)
LIST_BACK_LABELS = {
    "hall": "⬅️ Hall", "catalog": "⬅️ Catalogue", "fav": "⬅️ Favorites",
    "country": "⬅️ Country", "res": "⬅️ Results",
}


def hall_items(hall_id: str):
    return [item for item in INVENTIONS if str(item["hall"]) == str(hall_id)]


async def build_list(key: str, state: FSMContext, user_id: int, page: int = 0):
    """Return (text, keyboard) for one page of an exhibit list, or None for an unknown key.
    The whole list is remembered as the browsing context: on an exhibit card, ◀️ Prev and
    Next ▶️ move through this list and the back button returns to the same page."""
    kind, _, value = key.partition(":")
    if kind == "catalog":
        items = INVENTIONS
        text = f"📚 Full Catalogue\n\n{len(items)} inventions. Choose one:"
        markup = items_keyboard(items, key="catalog", page=page)
    elif kind == "hall" and value in HALLS:
        hall = HALLS[value]
        items = hall_items(value)
        text = f"🏛 {hall['name']}\n{hall['title']}\n\n{hall['description']}\n\n"
        text += "Choose an exhibit below." if items else "This hall is being prepared. Check back later."
        markup = hall_items_keyboard(items, value, page)
    elif kind == "fav":
        ids = await db_call(get_favorites, user_id, default=[])
        items = [BY_ID[i] for i in ids if i in BY_ID]
        if not items:
            await state.update_data(nav_key=None, nav_ids=[])
            return (
                "⭐ My Favorites\n\nYou have not saved any exhibits yet.\n"
                "Open an exhibit and tap “Add Favorite” to keep it here.",
                info_keyboard(),
            )
        text = f"⭐ My Favorites\n\nYou have saved {len(items)} exhibit(s). Tap one to open it:"
        markup = favorites_keyboard(items, page)
    elif kind == "country" and value in COUNTRY_INFO:
        items = sorted((i for i in INVENTIONS if value in i["map_countries"]), key=lambda i: i["name"])
        text = f"{COUNTRY_INFO[value][0]} {value}\n\n{len(items)} exhibit(s) connected with this place. Choose one:"
        markup = map_items_keyboard(items, value, page)
    elif kind == "res":
        data = await state.get_data()
        filters, query = read_filters(data), data.get("f_query")
        items = search_matches(filters, query)
        text = results_text(items, filters, query)
        markup = results_keyboard(items, page)
    else:
        return None
    await state.update_data(nav_key=key, nav_ids=[i["id"] for i in items])
    return text, markup


async def open_list(callback: CallbackQuery, state: FSMContext, key: str, page: int = 0):
    built = await build_list(key, state, callback.from_user.id, page)
    if built is None:
        await callback.answer("This list is no longer available.", show_alert=True)
        return
    text, markup = built
    await show_text(callback.message, text, reply_markup=markup)
    await callback.answer()


@router.callback_query(F.data.startswith("hall:"))
async def show_hall(callback: CallbackQuery, state: FSMContext):
    hall_id = callback.data.split(":", 1)[1]
    if hall_id not in HALLS:
        await callback.answer("Hall not found.", show_alert=True)
        return
    await db_call(mark_hall_opened, callback.from_user.id, hall_id)
    await open_list(callback, state, f"hall:{hall_id}")


@router.callback_query(F.data == "catalog")
async def show_catalog(callback: CallbackQuery, state: FSMContext):
    await open_list(callback, state, "catalog")


@router.callback_query(F.data.startswith("pg:"))
async def change_page(callback: CallbackQuery, state: FSMContext):
    parts = callback.data.split(":", 2)
    try:
        page, key = int(parts[1]), parts[2]
    except (IndexError, ValueError):
        await callback.answer("Invalid page.", show_alert=True)
        return
    await open_list(callback, state, key, page)


@router.callback_query(F.data == "noop")
async def do_nothing(callback: CallbackQuery):
    await callback.answer()


# ------------------------------------------------------------------ Exhibit card
async def exhibit_context(state: FSMContext, item) -> dict:
    """Pager and back-button data for an exhibit card, based on the list the user came from.
    Without a list (for example after a restart) the exhibit's own hall is used."""
    data = await state.get_data()
    key = data.get("nav_key")
    ids = [i for i in (data.get("nav_ids") or []) if i in BY_ID]
    if not key or item["id"] not in ids:
        key = f"hall:{item['hall']}"
        ids = [i["id"] for i in hall_items(item["hall"])]
        await state.update_data(nav_key=key, nav_ids=ids)
    index = ids.index(item["id"])
    count = len(ids)
    kind = key.partition(":")[0]
    context = {
        "back": (LIST_BACK_LABELS.get(kind, "⬅️ Back"), f"pg:{index // ITEMS_PER_PAGE}:{key}"),
    }
    if count > 1:
        context.update(
            prev_id=ids[(index - 1) % count],
            next_id=ids[(index + 1) % count],
            position=(index + 1, count),
        )
    return context


@router.callback_query(F.data.startswith("item:"))
async def show_item(callback: CallbackQuery, state: FSMContext):
    item_id = callback.data.split(":", 1)[1]
    item = BY_ID.get(item_id)
    if item is None:
        await callback.answer("Exhibit not found.", show_alert=True)
        return
    user_id = callback.from_user.id
    await db_call(mark_exhibit_studied, user_id, item_id)
    saved = bool(await db_call(is_favorite, user_id, item_id, default=False))
    context = await exhibit_context(state, item)
    # Coming back from this exhibit's own "How It Works" view: that view is a photo
    # message without a "how:" button but with an "item:<id>" button, so its photo is kept.
    reuse_photo = (
        bool(callback.message.photo)
        and not message_has_button_prefix(callback.message, "how:")
        and message_has_button(callback.message, callback.data)
    )
    await show_item_card(
        callback.message, item, format_invention(item),
        navigation_keyboard(item, saved, **context), reuse_photo=reuse_photo,
    )
    await callback.answer()


# ------------------------------------------------------------------ How It Works
@router.callback_query(F.data.startswith("how:"))
async def show_how_it_works(callback: CallbackQuery, state: FSMContext):
    item = BY_ID.get(callback.data.split(":", 1)[1])
    if item is None:
        await callback.answer("Exhibit not found.", show_alert=True)
        return
    saved = bool(await db_call(is_favorite, callback.from_user.id, item["id"], default=False))
    context = await exhibit_context(state, item)
    text = f"⚙️ How It Works · {item['name']}\n\n{item['how_it_works']}"
    await show_card_text(callback.message, text, how_keyboard(item, saved, back=context["back"]))
    await callback.answer()


# ------------------------------------------------------------------ Favorites
@router.callback_query(F.data.startswith("favorite:toggle:"))
async def toggle_favorite_handler(callback: CallbackQuery):
    item = BY_ID.get(callback.data.split(":", 2)[2])
    if item is None:
        await callback.answer("Exhibit not found.", show_alert=True)
        return
    saved = await db_call(toggle_favorite, callback.from_user.id, item["id"])
    if saved is None:
        await callback.answer("Sorry, your favorites could not be updated. Please try again.", show_alert=True)
        return
    # Only the label of the favorite button changes; the pager and other buttons stay as they are.
    new_markup = relabel_favorite(callback.message.reply_markup, item["id"], saved)
    if new_markup is not None:
        try:
            await callback.message.edit_reply_markup(reply_markup=new_markup)
        except TelegramBadRequest as exc:
            if not is_not_modified(exc):
                raise
    await callback.answer("⭐ Added to your favorites" if saved else "Removed from your favorites")


@router.callback_query(F.data == "favorites")
async def show_favorites(callback: CallbackQuery, state: FSMContext):
    await open_list(callback, state, "fav")


# ------------------------------------------------------------------ Personal statistics
@router.callback_query(F.data == "stats")
async def show_stats(callback: CallbackQuery):
    stats = await db_call(get_stats, callback.from_user.id)
    if stats is None:
        await callback.answer("Statistics are not available right now.", show_alert=True)
        return
    studied = min(stats["studied_exhibits"], len(INVENTIONS))
    halls = min(stats["opened_halls"], len(HALLS))
    total_answers = stats["total_answers"]
    if total_answers:
        accuracy = round(100 * stats["correct_answers"] / total_answers)
        answers_line = f"{stats['correct_answers']} of {total_answers} ({accuracy}%)"
    else:
        answers_line = "no quiz answers yet"
    await show_text(
        callback.message,
        "📊 Personal Statistics\n\n"
        f"📚 Exhibits studied: {studied} of {len(INVENTIONS)}\n"
        f"🏛 Halls opened: {halls} of {len(HALLS)}\n"
        f"⭐ Favorites saved: {stats['favorites']}\n"
        f"🧠 Correct quiz answers: {answers_line}\n"
        f"🏁 Quizzes completed: {stats['quizzes_completed']}\n\n"
        "An exhibit counts as studied when you open it.",
        reply_markup=info_keyboard(),
    )
    await callback.answer()


# ------------------------------------------------------------------ This Day in History
def today_date() -> date:
    return datetime.now().date()


def next_occurrence(event, today: date) -> date:
    """The next date on which the event's day and month come round (events are never on 29 February)."""
    this_year = date(today.year, event["month"], event["day"])
    return this_year if this_year >= today else date(today.year + 1, event["month"], event["day"])


def previous_occurrence(event, today: date) -> date:
    this_year = date(today.year, event["month"], event["day"])
    return this_year if this_year <= today else date(today.year - 1, event["month"], event["day"])


def history_line(event) -> str:
    icon = HISTORY_KIND_ICONS.get(event["kind"], "📅")
    return f"{icon} {event['year']} — {event['title']}\n{event['text']}"


def build_history(today: date):
    """Return (text, related exhibit ids). Exact matches for today's date are shown;
    if the calendar has none, the nearest earlier and later events are shown instead."""
    heading = f"📅 This Day in History · {today.day} {MONTH_NAMES[today.month - 1]}"
    exact = sorted(
        (e for e in HISTORY if (e["month"], e["day"]) == (today.month, today.day)),
        key=lambda e: e["year"],
    )
    if exact:
        events = exact[:3]
        text = heading + "\n\n" + "\n\n".join(history_line(e) for e in events)
    else:
        upcoming = min(HISTORY, key=lambda e: next_occurrence(e, today))
        past = max(HISTORY, key=lambda e: previous_occurrence(e, today))
        ahead = (next_occurrence(upcoming, today) - today).days
        behind = (today - previous_occurrence(past, today)).days
        events = [past, upcoming] if behind <= ahead else [upcoming, past]
        lines = []
        for e in events:
            day_label = f"{e['day']} {MONTH_NAMES[e['month'] - 1]}"
            if e is upcoming:
                when = "tomorrow" if ahead == 1 else f"in {ahead} days"
            else:
                when = "yesterday" if behind == 1 else f"{behind} days ago"
            lines.append(f"({when}, on {day_label})\n{history_line(e)}")
        text = (
            heading + "\n\nNo invention or discovery in our calendar is dated exactly "
            "today. The closest ones are:\n\n" + "\n\n".join(lines)
        )
    related = []
    for e in events:
        if e.get("related_id") and e["related_id"] not in related:
            related.append(e["related_id"])
    return text, related


@router.callback_query(F.data == "history:today")
async def this_day_in_history(callback: CallbackQuery, state: FSMContext):
    await state.update_data(nav_key=None, nav_ids=[])  # exhibits opened from here have no list to page through
    text, related = build_history(today_date())
    await show_text(
        callback.message, text, reply_markup=history_keyboard([BY_ID[i] for i in related])
    )
    await callback.answer()


# ------------------------------------------------------------------ Invention map
def build_map_text() -> str:
    counts = Counter(c for item in INVENTIONS for c in item["map_countries"])
    lines = ["🗺 Invention Map", "", "Where did our inventions come from? Tap a country to see its exhibits.", ""]
    for continent, icon in CONTINENTS:
        members = [c for c in COUNTRIES if COUNTRY_INFO[c][1] == continent]
        if members:
            lines.append(f"{icon} {continent}")
            lines.extend(f"{COUNTRY_INFO[c][0]} {c} — {counts[c]}" for c in members)
            lines.append("")
    if "International" in counts:
        lines.append(f"🌐 International / several countries — {counts['International']}")
        lines.append("")
    lines.append("Inventions that involve several countries are counted for each of them.")
    return "\n".join(lines)


@router.callback_query(F.data == "map")
async def show_map(callback: CallbackQuery):
    await show_text(
        callback.message, build_map_text(), reply_markup=countries_keyboard(COUNTRIES, COUNTRY_LABELS)
    )
    await callback.answer()


@router.callback_query(F.data.startswith("map:country:"))
async def show_map_country(callback: CallbackQuery, state: FSMContext):
    country = callback.data.split(":", 2)[2]
    if country not in COUNTRY_INFO:
        await callback.answer("Country not found.", show_alert=True)
        return
    await open_list(callback, state, f"country:{country}")


# ------------------------------------------------------------------ Search & filters
def read_filters(data: dict) -> dict:
    return {"country": data.get("f_country"), "hall": data.get("f_hall"), "period": data.get("f_period")}


def apply_filters(items, filters: dict):
    return [
        item for item in items
        if (not filters["country"] or filters["country"] in item["map_countries"])
        and (not filters["hall"] or str(item["hall"]) == filters["hall"])
        and (not filters["period"] or item["period"] == filters["period"])
    ]


def search_matches(filters: dict, query: str | None):
    """Exhibits that pass the filters and (if given) contain the keyword."""
    items = apply_filters(INVENTIONS, filters)
    if not query or not query.strip():
        return items
    needle = normalize_text(query.strip())
    return [
        item for item in items
        if needle in normalize_text(" ".join(str(item.get(key, "")) for key in (
            "name", "period", "year", "inventor", "country", "origin", "features",
            "significance", "further_facts"
        )))
    ]


def describe_filters(filters: dict) -> str:
    country = COUNTRY_LABELS.get(filters["country"], "All")
    hall = f"Hall {filters['hall']} · {HALLS[filters['hall']]['title']}" if filters["hall"] else "All"
    period = filters["period"] or "All"
    return f"Country: {country}\nHall: {hall}\nPeriod: {period}"


def filters_active(filters: dict) -> bool:
    return any(filters.values())


def results_text(items, filters: dict, query: str | None) -> str:
    head = f"🔎 Results for “{query}”" if query else "📋 Results"
    if items:
        head += f" · {len(items)} exhibit(s)"
    parts = [head]
    if filters_active(filters):
        parts.append(f"Active filters:\n{describe_filters(filters)}")
    if not items:
        parts.append("No exhibits found. Try another keyword or change the filters.")
    return "\n\n".join(parts)


async def render_filters(message: Message, state: FSMContext):
    # While the filter screen is open, typed text is searched inside the chosen filters.
    await state.set_state(SearchState.waiting_for_query)
    filters = read_filters(await state.get_data())
    matches = apply_filters(INVENTIONS, filters)
    await show_text(
        message,
        "🔎 Search & Filters\n\n"
        f"{describe_filters(filters)}\n\n"
        f"Matching exhibits: {len(matches)}\n\n"
        "Choose filters below and tap “Show Results”, or type a keyword "
        "(invention, inventor, country, year…) to search within the chosen filters.",
        reply_markup=filters_keyboard(COUNTRIES, HALLS, len(matches), COUNTRY_LABELS, active=filters),
    )


@router.callback_query(F.data == "search")
async def begin_search(callback: CallbackQuery, state: FSMContext):
    await state.update_data(f_query=None)
    await render_filters(callback.message, state)
    await callback.answer()


@router.callback_query(F.data == "filter:reset")
async def reset_filters(callback: CallbackQuery, state: FSMContext):
    await state.update_data(f_country=None, f_hall=None, f_period=None, f_query=None)
    await render_filters(callback.message, state)
    await callback.answer("Filters reset")


@router.callback_query(F.data == "filter:results")
async def show_filter_results(callback: CallbackQuery, state: FSMContext):
    await state.set_state(SearchState.waiting_for_query)
    await state.update_data(f_query=None)
    await open_list(callback, state, "res")


@router.callback_query(F.data.startswith("filter:"))
async def choose_filter(callback: CallbackQuery, state: FSMContext):
    parts = callback.data.split(":", 2)
    if len(parts) != 3:
        await callback.answer("Invalid filter.", show_alert=True)
        return
    _, kind, value = parts
    filters = read_filters(await state.get_data())

    if kind == "hall" and value == "menu":
        await show_text(
            callback.message, "🏛 Filter by Hall\n\nChoose a hall:",
            reply_markup=hall_filter_keyboard(HALLS, active=filters["hall"]),
        )
        await callback.answer()
        return
    if kind == "period" and value == "menu":
        await show_text(
            callback.message, "📅 Filter by Period\n\nChoose a period:",
            reply_markup=period_filter_keyboard(PERIODS, active=filters["period"]),
        )
        await callback.answer()
        return

    if kind == "country" and (value == "all" or value in COUNTRY_INFO):
        await state.update_data(f_country=None if value == "all" else value)
    elif kind == "hall" and (value == "all" or value in HALLS):
        await state.update_data(f_hall=None if value == "all" else value)
    elif kind == "period" and (value == "all" or value in PERIODS):
        await state.update_data(f_period=None if value == "all" else value)
    else:
        await callback.answer("Invalid filter.", show_alert=True)
        return
    await render_filters(callback.message, state)
    await callback.answer()


@router.message(SearchState.waiting_for_query, F.text)
async def search(message: Message, state: FSMContext):
    query = message.text.strip()
    if not normalize_text(query):
        await message.answer("Please enter a search term.")
        return
    await state.update_data(f_query=query[:60])
    text, markup = await build_list("res", state, message.from_user.id)
    await message.answer(text, reply_markup=markup)


@router.message(SearchState.waiting_for_query)
async def search_non_text(message: Message):
    await message.answer("Please type your search as a text message, or send /start to cancel.")


@router.callback_query(F.data == "quiz:start")
async def start_quiz(callback: CallbackQuery, state: FSMContext):
    await state.clear()
    round_size = min(QUIZ_ROUND_SIZE, len(QUIZ))
    question_order = random.sample(range(len(QUIZ)), k=round_size)
    # Each question gets its own shuffled option order. We store original option
    # indexes so the bot can still identify the correct answer after shuffling.
    option_orders = []
    for question_index in question_order:
        order = list(range(len(QUIZ[question_index]["options"])))
        random.shuffle(order)
        option_orders.append(order)

    await state.update_data(
        quiz_order=question_order,
        quiz_option_orders=option_orders,
        quiz_index=0,
        quiz_score=0,
    )
    await send_quiz_question(callback.message, state, edit=True)
    await callback.answer()


async def send_quiz_question(message: Message, state: FSMContext, edit: bool = False):
    data = await state.get_data()
    round_index = data.get("quiz_index", 0)
    question_order = data.get("quiz_order", [])
    option_orders = data.get("quiz_option_orders", [])

    if round_index >= len(question_order):
        return

    question = QUIZ[question_order[round_index]]
    shuffled_options = [question["options"][i] for i in option_orders[round_index]]
    text = (
        f"🧠 Invention Quiz · Question {round_index + 1}/{len(question_order)}\n\n"
        f"{question['question']}"
    )
    markup = quiz_answer_keyboard(round_index, shuffled_options)
    if edit:
        await show_text(message, text, reply_markup=markup)
    else:
        await message.answer(text, reply_markup=markup)


@router.callback_query(F.data.startswith("quiz:answer:"))
async def answer_quiz(callback: CallbackQuery, state: FSMContext):
    try:
        _, _, round_index_text, selected_text = callback.data.split(":")
        round_index, selected_display_index = int(round_index_text), int(selected_text)
    except (ValueError, TypeError):
        await callback.answer("Invalid answer.", show_alert=True)
        return

    data = await state.get_data()
    question_order = data.get("quiz_order", [])
    option_orders = data.get("quiz_option_orders", [])
    current_index = data.get("quiz_index")

    if current_index is None or round_index != current_index or round_index >= len(question_order):
        await callback.answer("This question has already been answered. Start a new quiz if you like.", show_alert=True)
        return

    question = QUIZ[question_order[round_index]]
    displayed_option_order = option_orders[round_index]
    if not 0 <= selected_display_index < len(displayed_option_order):
        await callback.answer("Invalid answer.", show_alert=True)
        return

    original_option_index = displayed_option_order[selected_display_index]
    correct = original_option_index == question["answer"]
    user_id = callback.from_user.id
    await db_call(record_answer, user_id, correct)
    score = data.get("quiz_score", 0) + int(correct)
    next_index = round_index + 1
    await state.update_data(quiz_score=score, quiz_index=next_index)

    result_line = (
        "✅ Correct!" if correct else
        f"❌ Not quite. The correct answer is: {question['options'][question['answer']]}"
    )
    feedback_text = f"{result_line}\n\n💡 {question['fact']}"
    total_questions = len(question_order)

    if next_index >= total_questions:
        await state.clear()
        await db_call(record_quiz_completed, user_id)
        feedback_text += f"\n\n🏁 Quiz complete!\nYour score: {score}/{total_questions}"
        if score == total_questions:
            feedback_text += "\nPerfect score — brilliant work! 🌟"
        elif score >= total_questions * 0.6:
            feedback_text += "\nWell done! You know your inventions. 👏"
        else:
            feedback_text += "\nGood try! Explore the museum and give it another go. 📚"
        await show_text(callback.message, feedback_text, reply_markup=quiz_result_keyboard())
    else:
        await show_text(callback.message, 
            feedback_text + f"\n\nScore: {score}/{next_index}",
            reply_markup=quiz_result_keyboard_continue(next_index),
        )
    await callback.answer()


@router.callback_query(F.data.startswith("quiz:next:"))
async def next_quiz_question(callback: CallbackQuery, state: FSMContext):
    data = await state.get_data()
    try:
        requested_index = int(callback.data.rsplit(":", 1)[1])
    except ValueError:
        await callback.answer("Invalid question.", show_alert=True)
        return

    question_order = data.get("quiz_order", [])
    if data.get("quiz_index") != requested_index or requested_index >= len(question_order):
        await callback.answer("This quiz session has expired.", show_alert=True)
        return
    await send_quiz_question(callback.message, state, edit=True)
    await callback.answer()


@router.message(StateFilter(None), F.text)
async def unknown_message(message: Message):
    await message.answer("Please use the menu buttons to explore the museum.", reply_markup=main_keyboard())
