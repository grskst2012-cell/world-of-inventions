import asyncio
import hashlib
import logging
import os

from aiogram import Bot, Dispatcher
from aiogram.fsm.storage.memory import MemoryStorage

from config import BOT_TOKEN
from database import init_db
from handlers import router

# On a host such as Render the bot runs as a web service and Telegram delivers
# updates to it (webhook). Render sets RENDER_EXTERNAL_URL by itself; elsewhere
# set WEBHOOK_BASE_URL. Without either, the bot polls Telegram (local run).
WEBHOOK_BASE_URL = (os.getenv("WEBHOOK_BASE_URL") or os.getenv("RENDER_EXTERNAL_URL") or "").rstrip("/")
WEBHOOK_PATH = "/telegram-webhook"
# Telegram sends this secret with every update, so strangers cannot post fake ones.
# Telegram allows only A-Z, a-z, 0-9, _ and - here; by default it is derived from the token.
WEBHOOK_SECRET = os.getenv("WEBHOOK_SECRET", "").strip() or hashlib.sha256(BOT_TOKEN.encode()).hexdigest()[:48]
PORT = int(os.getenv("PORT", "10000"))


def build_dispatcher() -> Dispatcher:
    dispatcher = Dispatcher(storage=MemoryStorage())
    dispatcher.include_router(router)
    return dispatcher


async def run_polling():
    bot = Bot(token=BOT_TOKEN)
    dispatcher = build_dispatcher()
    try:
        await bot.delete_webhook(drop_pending_updates=True)
        print("World of Inventions is running (polling)!")
        await dispatcher.start_polling(bot)
    finally:
        await bot.session.close()


def run_webhook():
    from aiohttp import web
    from aiogram.webhook.aiohttp_server import SimpleRequestHandler, setup_application

    bot = Bot(token=BOT_TOKEN)
    dispatcher = build_dispatcher()

    async def on_startup(bot: Bot):
        # Updates that arrived while the service was asleep are kept and handled now.
        await bot.set_webhook(
            f"{WEBHOOK_BASE_URL}{WEBHOOK_PATH}",
            secret_token=WEBHOOK_SECRET,
            drop_pending_updates=False,
        )
        print(f"World of Inventions is running (webhook {WEBHOOK_BASE_URL}{WEBHOOK_PATH})!")

    dispatcher.startup.register(on_startup)

    app = web.Application()

    async def health(_request):
        return web.Response(text="World of Inventions bot is running.")

    app.router.add_get("/", health)
    SimpleRequestHandler(dispatcher=dispatcher, bot=bot, secret_token=WEBHOOK_SECRET).register(app, path=WEBHOOK_PATH)
    setup_application(app, dispatcher, bot=bot)
    web.run_app(app, host="0.0.0.0", port=PORT)


def main():
    logging.basicConfig(level=logging.INFO)
    init_db()
    if WEBHOOK_BASE_URL:
        run_webhook()
    else:
        asyncio.run(run_polling())


if __name__ == "__main__":
    main()
