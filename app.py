from flask import Flask, jsonify, render_template, request, Response

import json
import queue as queue_module
import threading

from song_database import SongDatabase
from usdx_controller import (
    BridgeTimeoutError,
    PlayError,
    play_song,
)

app = Flask(__name__)

app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0

song_database = SongDatabase()
song_database.load()

queue: list[str] = []

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

@app.route("/")
def index():
    return render_template("index.html")


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

    return jsonify([
        {
            "id": song.id,
            "title": song.title,
            "artist": song.artist,
            "is_duet": song.is_duet,
            "is_new": song.is_new,
            "score": round(score, 1),
        }
        for song, score in results
    ])


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
        }), 409

    except Exception as exc:
        return jsonify({
            "success": False,
            "error": str(exc),
        }), 500

@app.route("/api/queue")
def get_queue():
    songs = []

    for song_id in queue:
        song = next(
            (
                song
                for song in song_database.songs
                if song.id == song_id
            ),
            None,
        )

        if song is None:
            continue

        songs.append({
            "id": song.id,
            "title": song.title,
            "artist": song.artist,
        })

    return jsonify(songs)


@app.route("/api/queue", methods=["POST"])
def add_to_queue():
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

    queue.append(song.id)

    notify_queue_changed()

    return jsonify({
        "success": True,
    })

@app.route("/api/queue/<path:song_id>", methods=["DELETE"])
def remove_from_queue(song_id):
    try:
        queue.remove(song_id)
    except ValueError:
        return jsonify({
            "success": False,
            "error": "Song is not in the queue.",
        }), 404

    notify_queue_changed()

    return jsonify({
        "success": True,
    })


@app.route("/api/queue", methods=["DELETE"])
def clear_queue():
    queue.clear()

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