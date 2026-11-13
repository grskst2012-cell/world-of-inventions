import os
from dotenv import load_dotenv

load_dotenv()

BOT_TOKEN = os.getenv("BOT_TOKEN", "").strip()
ADMIN_ID_RAW = os.getenv("ADMIN_ID", "").strip()
ADMIN_ID = int(ADMIN_ID_RAW) if ADMIN_ID_RAW.isdigit() else None
MUSEUM_NAME = "World of Inventions"

if not BOT_TOKEN:
    raise RuntimeError("BOT_TOKEN is missing. Add your bot token to the .env file.")
