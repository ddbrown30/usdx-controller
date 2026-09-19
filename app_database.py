from __future__ import annotations

import sqlite3
import threading
from pathlib import Path


DEFAULT_DB_PATH = Path(__file__).parent / "data" / "app.db"


class UsernameTakenError(Exception):
    """Raised when trying to use a username that is already taken."""


class AppDatabase:
    """
    Stores user accounts, per-user favourites, and the persisted play
    queue. Backed by SQLite so it survives server restarts.

    Usernames are case-insensitive ("Dan" and "dan" are the same
    account) and have whitespace normalized (trimmed, internal runs
    collapsed to one space). Identity is tracked by a normalized
    "key" (users.username_key); the account's chosen display casing
    is kept separately (users.username) so renaming case (e.g. "dan"
    -> "Dan") doesn't collide with itself. Favourites and the queue
    reference accounts by that same key, so a rename never orphans
    them.
    """

    def __init__(self, db_path: Path = DEFAULT_DB_PATH):
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)

        self._lock = threading.Lock()
        self._conn = sqlite3.connect(str(self.db_path), check_same_thread=False)
        self._conn.row_factory = sqlite3.Row

        self._init_schema()

    @staticmethod
    def normalize_username(username: str) -> str:
        """Trim and collapse internal whitespace, preserving case."""
        return " ".join(username.split())

    @classmethod
    def _username_key(cls, username: str) -> str:
        return cls.normalize_username(username).casefold()

    def _create_tables(self) -> None:
        self._conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                username_key TEXT PRIMARY KEY,
                username TEXT NOT NULL
            )
            """
        )

        self._conn.execute(
            """
            CREATE TABLE IF NOT EXISTS favourites (
                username_key TEXT NOT NULL,
                song_id TEXT NOT NULL,
                PRIMARY KEY (username_key, song_id)
            )
            """
        )

        self._conn.execute(
            """
            CREATE TABLE IF NOT EXISTS queue (
                position INTEGER PRIMARY KEY AUTOINCREMENT,
                queue_id TEXT NOT NULL UNIQUE,
                song_id TEXT NOT NULL,
                added_by_key TEXT NOT NULL
            )
            """
        )

    def _init_schema(self) -> None:
        with self._lock, self._conn:
            self._drop_legacy_schema()
            self._create_tables()

    def _drop_legacy_schema(self) -> None:
        """
        The original schema keyed users directly by the raw,
        case-sensitive username (no username_key column). That's
        incompatible with the current one, so drop and rebuild rather
        than migrate - there's no real user data riding on this yet.
        """
        columns = {
            row["name"]
            for row in self._conn.execute("PRAGMA table_info(users)").fetchall()
        }

        if not columns or "username_key" in columns:
            # No legacy table, or it's already the current schema.
            return

        self._conn.execute("DROP TABLE users")
        self._conn.execute("DROP TABLE IF EXISTS favourites")
        self._conn.execute("DROP TABLE IF EXISTS queue")

    # --- Users -------------------------------------------------------

    def user_exists(self, username: str) -> bool:
        key = self._username_key(username)

        with self._lock:
            row = self._conn.execute(
                "SELECT 1 FROM users WHERE username_key = ?", (key,)
            ).fetchone()

        return row is not None

    def get_display_username(self, username: str) -> str | None:
        key = self._username_key(username)

        with self._lock:
            row = self._conn.execute(
                "SELECT username FROM users WHERE username_key = ?", (key,)
            ).fetchone()

        return row["username"] if row is not None else None

    def create_user(self, username: str) -> None:
        display = self.normalize_username(username)
        key = display.casefold()

        with self._lock, self._conn:
            self._conn.execute(
                "INSERT OR IGNORE INTO users (username_key, username) VALUES (?, ?)",
                (key, display),
            )

    def rename_user(self, old_username: str, new_username: str) -> None:
        old_key = self._username_key(old_username)
        new_display = self.normalize_username(new_username)
        new_key = new_display.casefold()

        with self._lock, self._conn:
            if new_key != old_key:
                existing = self._conn.execute(
                    "SELECT 1 FROM users WHERE username_key = ?", (new_key,)
                ).fetchone()

                if existing is not None:
                    raise UsernameTakenError(new_display)

            self._conn.execute(
                "UPDATE users SET username_key = ?, username = ? WHERE username_key = ?",
                (new_key, new_display, old_key),
            )

            if new_key != old_key:
                self._conn.execute(
                    "UPDATE favourites SET username_key = ? WHERE username_key = ?",
                    (new_key, old_key),
                )
                self._conn.execute(
                    "UPDATE queue SET added_by_key = ? WHERE added_by_key = ?",
                    (new_key, old_key),
                )

    # --- Favourites ----------------------------------------------------

    def get_favourite_ids(self, username: str) -> set[str]:
        key = self._username_key(username)

        with self._lock:
            rows = self._conn.execute(
                "SELECT song_id FROM favourites WHERE username_key = ?", (key,)
            ).fetchall()

        return {row["song_id"] for row in rows}

    def add_favourite(self, username: str, song_id: str) -> None:
        key = self._username_key(username)

        with self._lock, self._conn:
            self._conn.execute(
                "INSERT OR IGNORE INTO favourites (username_key, song_id) VALUES (?, ?)",
                (key, song_id),
            )

    def remove_favourite(self, username: str, song_id: str) -> None:
        key = self._username_key(username)

        with self._lock, self._conn:
            self._conn.execute(
                "DELETE FROM favourites WHERE username_key = ? AND song_id = ?",
                (key, song_id),
            )

    # --- Queue -----------------------------------------------------------

    def load_queue(self) -> list[dict]:
        with self._lock:
            rows = self._conn.execute(
                """
                SELECT
                    q.queue_id AS queue_id,
                    q.song_id AS song_id,
                    COALESCE(u.username, q.added_by_key) AS added_by
                FROM queue q
                LEFT JOIN users u ON u.username_key = q.added_by_key
                ORDER BY q.position
                """
            ).fetchall()

        return [dict(row) for row in rows]

    def append_queue_item(self, queue_id: str, song_id: str, added_by: str) -> None:
        key = self._username_key(added_by)

        with self._lock, self._conn:
            self._conn.execute(
                "INSERT INTO queue (queue_id, song_id, added_by_key) VALUES (?, ?, ?)",
                (queue_id, song_id, key),
            )

    def remove_queue_item(self, queue_id: str) -> None:
        with self._lock, self._conn:
            self._conn.execute(
                "DELETE FROM queue WHERE queue_id = ?", (queue_id,)
            )

    def clear_queue(self) -> None:
        with self._lock, self._conn:
            self._conn.execute("DELETE FROM queue")
