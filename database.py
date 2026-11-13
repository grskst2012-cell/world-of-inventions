
import sqlite3
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
DB_FILE = DATA_DIR / "museum.db"


def get_connection():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_FILE)
    connection.row_factory = sqlite3.Row
    return connection


def init_db():
    with get_connection() as db:
        db.execute("""
            CREATE TABLE IF NOT EXISTS favorites (
                user_id INTEGER NOT NULL,
                invention_id TEXT NOT NULL,
                added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, invention_id)
            )
        """)

        db.execute("""
            CREATE TABLE IF NOT EXISTS user_stats (
                user_id INTEGER PRIMARY KEY,
                studied_exhibits INTEGER NOT NULL DEFAULT 0,
                correct_answers INTEGER NOT NULL DEFAULT 0,
                total_answers INTEGER NOT NULL DEFAULT 0,
                quizzes_completed INTEGER NOT NULL DEFAULT 0
            )
        """)

        db.execute("""
            CREATE TABLE IF NOT EXISTS studied_exhibits (
                user_id INTEGER NOT NULL,
                invention_id TEXT NOT NULL,
                studied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, invention_id)
            )
        """)

        db.execute("""
            CREATE TABLE IF NOT EXISTS opened_halls (
                user_id INTEGER NOT NULL,
                hall_id TEXT NOT NULL,
                opened_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, hall_id)
            )
        """)


def toggle_favorite(user_id: int, invention_id: str) -> bool:
    with get_connection() as db:
        row = db.execute(
            "SELECT 1 FROM favorites WHERE user_id=? AND invention_id=?",
            (user_id, invention_id),
        ).fetchone()

        if row:
            db.execute(
                "DELETE FROM favorites WHERE user_id=? AND invention_id=?",
                (user_id, invention_id),
            )
            return False

        db.execute(
            "INSERT INTO favorites (user_id, invention_id) VALUES (?, ?)",
            (user_id, invention_id),
        )
        return True


def get_favorites(user_id: int) -> list[str]:
    with get_connection() as db:
        rows = db.execute(
            "SELECT invention_id FROM favorites WHERE user_id=? ORDER BY added_at DESC",
            (user_id,),
        ).fetchall()
        return [row["invention_id"] for row in rows]


def is_favorite(user_id: int, invention_id: str) -> bool:
    with get_connection() as db:
        row = db.execute(
            "SELECT 1 FROM favorites WHERE user_id=? AND invention_id=?",
            (user_id, invention_id),
        ).fetchone()
        return row is not None


def mark_exhibit_studied(user_id: int, invention_id: str):
    with get_connection() as db:
        cursor = db.execute(
            "INSERT OR IGNORE INTO studied_exhibits (user_id, invention_id) VALUES (?, ?)",
            (user_id, invention_id),
        )
        if cursor.rowcount:
            db.execute("""
                INSERT INTO user_stats (user_id, studied_exhibits)
                VALUES (?, 1)
                ON CONFLICT(user_id) DO UPDATE SET
                    studied_exhibits = studied_exhibits + 1
            """, (user_id,))


def mark_hall_opened(user_id: int, hall_id: str):
    with get_connection() as db:
        db.execute(
            "INSERT OR IGNORE INTO opened_halls (user_id, hall_id) VALUES (?, ?)",
            (user_id, hall_id),
        )


def record_answer(user_id: int, correct: bool):
    with get_connection() as db:
        db.execute("""
            INSERT INTO user_stats (user_id, correct_answers, total_answers)
            VALUES (?, ?, 1)
            ON CONFLICT(user_id) DO UPDATE SET
                correct_answers = correct_answers + excluded.correct_answers,
                total_answers = total_answers + 1
        """, (user_id, int(correct)))


def record_quiz_completed(user_id: int):
    with get_connection() as db:
        db.execute("""
            INSERT INTO user_stats (user_id, quizzes_completed)
            VALUES (?, 1)
            ON CONFLICT(user_id) DO UPDATE SET
                quizzes_completed = quizzes_completed + 1
        """, (user_id,))


def get_stats(user_id: int) -> dict:
    with get_connection() as db:
        row = db.execute(
            "SELECT * FROM user_stats WHERE user_id=?",
            (user_id,),
        ).fetchone()

        halls = db.execute(
            "SELECT COUNT(*) AS total FROM opened_halls WHERE user_id=?",
            (user_id,),
        ).fetchone()["total"]

        favorites = db.execute(
            "SELECT COUNT(*) AS total FROM favorites WHERE user_id=?",
            (user_id,),
        ).fetchone()["total"]

        stats = dict(row) if row else {
            "studied_exhibits": 0,
            "correct_answers": 0,
            "total_answers": 0,
            "quizzes_completed": 0,
        }

        stats["opened_halls"] = halls
        stats["favorites"] = favorites
        return stats

