# World of Inventions

An educational Telegram bot built with Python and aiogram 3.

## Features
- Four museum halls, catalogue, and exhibit cards: each exhibit is a single message with its photo and text, replaced as you navigate
- **Favorites** – save exhibits with ⭐ and open them again from "My Favorites"
- **Personal Statistics** – exhibits studied, halls opened, favorites, correct quiz answers and completed quizzes
- **This Day in History** – inventions and discoveries linked to today's date (the nearest dates are shown when the calendar has none)
- **How It Works** – a simple explanation of the principle behind every invention
- **Invention Map** – browse exhibits by country of origin
- **Search & Filters** – filter by country, hall and period, and search by keyword inside the chosen filters
- Suggestions and feedback forwarded to the configured admin
- Project team information
- Invention quiz with a larger question bank: each round randomly selects 10 questions and shuffles the answer options

## Data files
- `data/inventions.json` – the exhibits. Every exhibit needs the fields checked in `handlers.py`, including `how_it_works` (short explanation) and `map_countries` (a list of countries from `COUNTRY_INFO` in `handlers.py`).
- `data/history.json` – events for "This Day in History" (`month`, `day`, `year`, `kind`, `title`, `text`, optional `related_id` of an exhibit).
- `data/museum.db` – SQLite database with favorites and statistics. It is created automatically on the first start and should not be committed (add it to `.gitignore`).

## Setup (Windows PowerShell)

1. Install Python 3.11 or newer.
2. Open PowerShell in this project folder.
3. Create a virtual environment:

   ```powershell
   py -m venv .venv
   ```

4. Install dependencies without needing to activate the environment:

   ```powershell
   .\.venv\Scripts\python.exe -m pip install -r requirements.txt
   ```

5. Copy `.env.example` to `.env` and fill in `BOT_TOKEN` and `ADMIN_ID`.
6. Start the bot:

   ```powershell
   .\.venv\Scripts\python.exe bot.py
   ```

Never share your bot token or commit `.env` to a public repository.
