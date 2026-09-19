from flask import Flask, jsonify, render_template, request, Response

import json
import queue as queue_module
import threading
import uuid

from app_database import AppDatabase, UsernameTakenError
from song_database import SongDatabase
from usdx_controller import (
    BridgeTimeoutError,
    PlayError,
    get_now_playing,
    play_song,
)

app = Flask(__name__)

app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0

USERNAME_COOKIE = "usdx_username"
# Effectively "no expiry" - a login that just keeps the user signed in.
USERNAME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365 * 10
USERNAME_MAX_LENGTH = 40

song_database = SongDatabase()
song_database.load()

app_database = AppDatabase()

queue: list[dict] = app_database.load_queue()

queue_subscribers: set[queue_module.Queue] = set()
queue_subscribers_lock = threading.Lock()


def notify_queue_changed() -> None:
    with queue_subscribers_lock:
        subscribers = list(queue_subscribers)

    for subscriber in subscribers:
        try:
            subscriber.put_nowait("queue_changed")
        except queue_module.Full:
            pass


def get_current_username() -> str | None:
    username = request.cookies.get(USERNAME_COOKIE)

    if not username:
        return None

    # Resolve to the account's current display casing rather than
    # trusting the cookie's, so a rename elsewhere (or just a stale
    # cookie) doesn't leave this session showing an outdated casing.
    return app_database.get_display_username(username)


def set_username_cookie(response, username: str):
    response.set_cookie(
        USERNAME_COOKIE,
        username,
        max_age=USERNAME_COOKIE_MAX_AGE,
        httponly=True,
        samesite="Lax",
    )
    return response


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/user")
def get_user():
    username = get_current_username()

    return jsonify({
        "username": username,
        "needs_login": username is None,
    })


@app.route("/api/users")
def get_users():
    return jsonify(app_database.get_all_usernames())


@app.route("/api/users/<path:username>", methods=["DELETE"])
def delete_user(username):
    if not app_database.user_exists(username):
        return jsonify({
            "success": False,
            "error": "User not found.",
        }), 404

    app_database.delete_user(username)

    return jsonify({
        "success": True,
    })


@app.route("/api/user/login", methods=["POST"])
def login_user():
    data = request.get_json(silent=True) or {}
    username = AppDatabase.normalize_username(data.get("username") or "")
    confirm = bool(data.get("confirm"))

    if not username:
        return jsonify({
            "success": False,
            "error": "Please enter a username.",
        }), 400

    if len(username) > USERNAME_MAX_LENGTH:
        return jsonify({
            "success": False,
            "error": "Username is too long.",
        }), 400

    exists = app_database.user_exists(username)

    if exists and not confirm:
        return jsonify({
            "success": False,
            "exists": True,
        })

    if not exists:
        app_database.create_user(username)

    # Log in as the account's existing display casing (e.g. typing
    # "DAN" should sign into "Dan", not silently re-case the account -
    # that's what rename is for).
    display_username = app_database.get_display_username(username)

    response = jsonify({
        "success": True,
        "username": display_username,
    })

    return set_username_cookie(response, display_username)


@app.route("/api/user/rename", methods=["POST"])
def rename_user():
    current_username = get_current_username()

    if current_username is None:
        return jsonify({
            "success": False,
            "error": "Not logged in.",
        }), 401

    data = request.get_json(silent=True) or {}
    new_username = AppDatabase.normalize_username(data.get("new_username") or "")

    if not new_username:
        return jsonify({
            "success": False,
            "error": "Please enter a username.",
        }), 400

    if len(new_username) > USERNAME_MAX_LENGTH:
        return jsonify({
            "success": False,
            "error": "Username is too long.",
        }), 400

    try:
        # Handles a pure case change (e.g. "dan" -> "Dan") too: that's
        # the same account, so it's never blocked as "taken".
        app_database.rename_user(current_username, new_username)
    except UsernameTakenError:
        return jsonify({
            "success": False,
            "error": "That username is already taken.",
        }), 409

    response = jsonify({
        "success": True,
        "username": new_username,
    })

    return set_username_cookie(response, new_username)


@app.route("/api/search")
def search():
    query = request.args.get("q", "").strip()
    field = request.args.get("field", "all").lower()
    duets_filter = request.args.get("duets_filter") == "1"
    new_filter = request.args.get("new_filter") == "1"

    if field not in {"all", "title", "artist"}:
        return jsonify({
            "error": "Invalid search field."
        }), 400

    results = song_database.search(
        query=query,
        duets_filter=duets_filter,
        new_filter=new_filter,
        field=field,
    )

    if duets_filter or new_filter:
        results = [
            (song, score)
            for song, score in results
            if (not duets_filter or song.is_duet)
            and (not new_filter or song.is_new)
        ]

    username = get_current_username()
    favourite_ids = app_database.get_favourite_ids(username) if username else set()

    return jsonify([
        {
            "id": song.id,
            "title": song.title,
            "artist": song.artist,
            "is_duet": song.is_duet,
            "is_new": song.is_new,
            "is_favourite": song.id in favourite_ids,
            "score": round(score, 1),
        }
        for song, score in results
    ])


@app.route("/api/favourites")
def get_favourites():
    username = get_current_username()

    if username is None:
        return jsonify([])

    favourite_ids = app_database.get_favourite_ids(username)

    songs = sorted(
        (song for song in song_database.songs if song.id in favourite_ids),
        key=lambda song: (song.artist.casefold(), song.title.casefold()),
    )

    return jsonify([
        {
            "id": song.id,
            "title": song.title,
            "artist": song.artist,
            "is_duet": song.is_duet,
            "is_new": song.is_new,
            "is_favourite": True,
        }
        for song in songs
    ])


@app.route("/api/favourites", methods=["POST"])
def add_favourite():
    username = get_current_username()

    if username is None:
        return jsonify({
            "success": False,
            "error": "Not logged in.",
        }), 401

    data = request.get_json(silent=True) or {}
    song_id = data.get("id")

    if not song_id:
        return jsonify({
            "success": False,
            "error": "No song ID provided.",
        }), 400

    song = next(
        (song for song in song_database.songs if song.id == song_id),
        None,
    )

    if song is None:
        return jsonify({
            "success": False,
            "error": "Song not found.",
        }), 404

    app_database.add_favourite(username, song_id)

    return jsonify({
        "success": True,
    })


@app.route("/api/favourites/<path:song_id>", methods=["DELETE"])
def remove_favourite(song_id):
    username = get_current_username()

    if username is None:
        return jsonify({
            "success": False,
            "error": "Not logged in.",
        }), 401

    app_database.remove_favourite(username, song_id)

    return jsonify({
        "success": True,
    })


@app.route("/api/now_playing")
def now_playing():
    current = get_now_playing()

    if current is None:
        return jsonify({
            "title": None,
            "artist": None,
        })

    return jsonify({
        "title": current.title,
        "artist": current.artist,
    })


@app.route("/api/play", methods=["POST"])
def play():
    data = request.get_json(silent=True) or {}
    search = data.get("search", "").strip()

    if not search:
        return jsonify({
            "success": False,
            "error": "No search text provided.",
        }), 400

    try:
        play_song(search)

        return jsonify({
            "success": True,
            "search": search,
        })

    except BridgeTimeoutError as exc:
        # USDX never answered - can't tell if it played or not, so treat
        # it like any other failure and leave the song queued.
        return jsonify({
            "success": False,
            "error": str(exc),
        }), 504

    except PlayError as exc:
        # USDX explicitly declined: wrong screen, already singing, or no
        # match. Nothing happened on the USDX side.
        return jsonify({
            "success": False,
            "error": str(exc),
        }), 200

    except Exception as exc:
        return jsonify({
            "success": False,
            "error": str(exc),
        }), 500

@app.route("/api/queue")
def get_queue():
    songs = []

    for item in queue:
        song = next(
            (
                song
                for song in song_database.songs
                if song.id == item["song_id"]
            ),
            None,
        )

        if song is None:
            continue

        songs.append({
            "queue_id": item["queue_id"],
            "id": song.id,
            "title": song.title,
            "artist": song.artist,
            "added_by": item["added_by"],
        })

    return jsonify(songs)


@app.route("/api/queue", methods=["POST"])
def add_to_queue():
    username = get_current_username()

    if username is None:
        return jsonify({
            "success": False,
            "error": "Not logged in.",
        }), 401

    data = request.get_json(silent=True) or {}
    song_id = data.get("id")

    if not song_id:
        return jsonify({
            "success": False,
            "error": "No song ID provided.",
        }), 400

    song = next(
        (
            song
            for song in song_database.songs
            if song.id == song_id
        ),
        None,
    )

    if song is None:
        return jsonify({
            "success": False,
            "error": "Song not found.",
        }), 404

    queue_id = uuid.uuid4().hex

    queue.append({
        "queue_id": queue_id,
        "song_id": song.id,
        "added_by": username,
    })

    app_database.append_queue_item(queue_id, song.id, username)

    notify_queue_changed()

    return jsonify({
        "success": True,
    })

@app.route("/api/queue/<path:queue_id>", methods=["DELETE"])
def remove_from_queue(queue_id):
    index = next(
        (i for i, item in enumerate(queue) if item["queue_id"] == queue_id),
        None,
    )

    if index is None:
        return jsonify({
            "success": False,
            "error": "Song is not in the queue.",
        }), 404

    queue.pop(index)
    app_database.remove_queue_item(queue_id)

    notify_queue_changed()

    return jsonify({
        "success": True,
    })


@app.route("/api/queue", methods=["DELETE"])
def clear_queue():
    queue.clear()
    app_database.clear_queue()

    notify_queue_changed()

    return jsonify({
        "success": True,
    })

@app.route("/api/queue/events")
def queue_events():
    subscriber = queue_module.Queue(maxsize=10)

    with queue_subscribers_lock:
        queue_subscribers.add(subscriber)

    def generate():
        try:
            # Tell the browser to refresh immediately when it connects.
            yield "data: queue_changed\n\n"

            while True:
                event = subscriber.get()

                yield f"data: {event}\n\n"

        finally:
            with queue_subscribers_lock:
                queue_subscribers.discard(subscriber)

    return Response(
        generate(),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )

if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=5000,
        debug=True,
        use_reloader=False,
    )