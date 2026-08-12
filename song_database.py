from __future__ import annotations

import configparser
import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from datetime import datetime

from rapidfuzz import fuzz


USDX_CONFIG = Path(r"C:\Program Files (x86)\UltraStar Deluxe\config.ini")


@dataclass
class Song:
    id: str
    title: str
    artist: str
    txt_path: Path
    is_duet: bool
    created: datetime
    modified: datetime
    is_new: bool = False

    @property
    def search_text(self) -> str:
        return f"{self.title} {self.artist}"


class SongDatabase:
    def __init__(self, config_path: Path = USDX_CONFIG):
        self.config_path = config_path
        self.songs: list[Song] = []

    def load(self) -> None:
        song_dirs = self._get_song_dirs()

        songs: list[Song] = []

        for song_dir in song_dirs:
            if not song_dir.exists():
                print(f"Song directory does not exist: {song_dir}")
                continue

            print(f"Scanning: {song_dir}")

            for txt_path in song_dir.rglob("*.txt"):
                song = self._parse_song_file(txt_path)

                if song is not None:
                    songs.append(song)

        songs = sorted(
            songs,
            key=lambda song: song.created,
            reverse=True
        )

        for song in songs[:20]:
            song.is_new = True

        self.songs = songs

        print(f"Loaded {len(self.songs)} songs.")

    def _get_song_dirs(self) -> list[Path]:
        config = configparser.ConfigParser(
            interpolation=None
        )

        config.read(
            self.config_path,
            encoding="utf-8-sig",
        )

        if not config.has_section("Directories"):
            raise RuntimeError(
                f"USDX config has no [Directories] section: "
                f"{self.config_path}"
            )

        song_dirs: list[Path] = []

        for key, value in config.items("Directories"):
            if not re.fullmatch(r"songdir\d+", key, re.IGNORECASE):
                continue

            path = value.strip()

            if not path:
                continue

            song_dirs.append(Path(path))

        return song_dirs

    @staticmethod
    def _parse_song_file(path: Path) -> Song | None:
        title = None
        artist = None
        is_duet = False

        stat = path.stat()
        created = datetime.fromtimestamp(stat.st_ctime)
        modified = datetime.fromtimestamp(stat.st_mtime)

        is_new = path.parts[1] == "New"

        try:
            try:
                text = path.read_text(encoding="utf-8-sig")
            except UnicodeDecodeError:
                text = path.read_text(encoding="cp1252")

            for line in text.splitlines():
                line = line.strip()

                if line.upper().startswith("#TITLE:"):
                    title = line[7:].strip()

                elif line.upper().startswith("#ARTIST:"):
                    artist = line[8:].strip()

                elif line.upper() == "P2":
                    is_duet = True

        except OSError as exc:
            print(f"Could not read {path}: {exc}")
            return None

        if not title or not artist:
            return None

        return Song(
            id=str(path.resolve()),
            title=title,
            artist=artist,
            txt_path=path,
            is_duet=is_duet,
            created=created,
            modified=modified,
            is_new=is_new,
        )

    @staticmethod
    def _normalize(text: str) -> str:
        text = unicodedata.normalize("NFKD", text)
        text = "".join(
            char
            for char in text
            if not unicodedata.combining(char)
        )

        text = text.casefold()

        # Treat punctuation as whitespace.
        text = re.sub(r"[^\w]+", " ", text)

        return " ".join(text.split())

    def search(
        self,
        query: str,
        field: str = "all",
        limit: int = 100,
    ) -> list[tuple[Song, float]]:
        query = self._normalize(query)

        if not query:
            songs = sorted(
                self.songs,
                key=lambda song: (song.is_new, song.created),
                reverse=True,
            )
            return [(song, 0) for song in songs]

        results: list[tuple[Song, float]] = []

        for song in self.songs:
            title = self._normalize(song.title)
            artist = self._normalize(song.artist)
            combined = f"{title} {artist}"

            if field == "title":
                score = self._score(query, title)

            elif field == "artist":
                score = self._score(query, artist)

            else:
                score = self._score(query, combined)

            if score > 0:
                results.append((song, score))

        results.sort(
            key=lambda result: result[1],
            reverse=True,
        )

        return results[:limit]

    @classmethod
    def _score(cls, query: str, text: str) -> float:
        query_words = query.split()
        text_words = text.split()

        if not query_words or not text_words:
            return 0

        total = 0

        for query_word in query_words:
            best = 0

            for text_word in text_words:
                if text_word == query_word:
                    score = 100

                elif text_word.startswith(query_word):
                    score = 95

                else:
                    score = 0

                best = max(best, score)

            if best == 0:
                return 0

            total += best

        return total / len(query_words)

    @staticmethod
    def _token_score(query: str, target: str) -> float:
        # Exact match.
        if query == target:
            return 100.0

        # Query can be a prefix of a longer song word.
        #
        # "ever" -> "everyone"
        # "horr" -> "horrible"
        # "hero" -> "heroes"
        #
        # But NOT:
        # "stars" -> "star"
        if len(query) < len(target) and target.startswith(query):
            return 95.0

        # Very short tokens aren't useful for fuzzy matching.
        if len(query) < 4 or len(target) < 4:
            return 0.0

        # Don't allow fuzzy matching when the target is shorter
        # than the query. This prevents:
        #
        # "stars" -> "star"
        if len(target) < len(query):
            return 0.0

        # Fuzzy matching is only for actual misspellings.
        ratio = fuzz.ratio(query, target)

        if ratio >= 90:
            return ratio

        return 0.0