from __future__ import annotations

import argparse
import os
import time
import uuid


# ---------------------------------------------------------------------------
# Bridge configuration
# ---------------------------------------------------------------------------
#
# This must point at the "plugins/controller_bridge" folder inside the USDX
# installation that controller_bridge.usdx is loaded from (Lua's io/os
# functions use paths relative to the game's working directory, so that's
# where the plugin reads and writes its files).
#
# Override with the USDX_BRIDGE_DIR environment variable if USDX is
# installed somewhere other than the default below.

DEFAULT_BRIDGE_DIR = r"C:\Program Files\UltraStar Deluxe\plugins\controller_bridge"

BRIDGE_DIR = os.environ.get("USDX_BRIDGE_DIR", DEFAULT_BRIDGE_DIR)

REQUEST_FILE = os.path.join(BRIDGE_DIR, "request.txt")
RESPONSE_FILE = os.path.join(BRIDGE_DIR, "response.txt")

# How long to wait for USDX to pick up and answer a request. USDX polls
# once per drawn frame, so this only needs to cover a few frames' worth
# of time plus some slack for a slow machine.
RESPONSE_TIMEOUT_SECONDS = 3.0
POLL_INTERVAL_SECONDS = 0.05


class PlayError(Exception):
    """Raised when a song could not be played."""


class NotAValidTimeError(PlayError):
    """Raised when USDX is not at a point where a song can be started."""


class SongNotFoundError(PlayError):
    """Raised when no song matched the search text."""


class BridgeTimeoutError(PlayError):
    """Raised when USDX never answered the request."""


def _write_request(search_text: str) -> None:
    """
    Write the request atomically so the Lua-side poll never sees a
    half-written file: write to a temp file, then rename it into place.
    """

    os.makedirs(BRIDGE_DIR, exist_ok=True)

    # Clear out any stale response left over from an earlier, abandoned
    # request before we ask a new question.
    try:
        os.remove(RESPONSE_FILE)
    except FileNotFoundError:
        pass

    tmp_path = os.path.join(BRIDGE_DIR, f".request-{uuid.uuid4().hex}.tmp")

    with open(tmp_path, "w", encoding="utf-8") as f:
        f.write(search_text)

    os.replace(tmp_path, REQUEST_FILE)


def _wait_for_response() -> str:
    deadline = time.monotonic() + RESPONSE_TIMEOUT_SECONDS

    while time.monotonic() < deadline:
        try:
            with open(RESPONSE_FILE, "r", encoding="utf-8") as f:
                result = f.read().strip()

            os.remove(RESPONSE_FILE)

            return result

        except FileNotFoundError:
            time.sleep(POLL_INTERVAL_SECONDS)

    raise BridgeTimeoutError(
        "USDX did not respond in time. Is it running with the "
        "controller_bridge plugin loaded?"
    )


def play_song(search_text: str) -> None:
    """
    Ask USDX to play a song matching search_text.

    Raises NotAValidTimeError if USDX isn't at a point where a song can
    be started (e.g. currently singing, or not on the song select
    screen), SongNotFoundError if nothing matched the search text, or
    BridgeTimeoutError if USDX never answered. Returns normally only on
    an actual, confirmed song start.
    """

    print(f"Requesting: {search_text}")

    _write_request(search_text)

    result = _wait_for_response()

    if result == "OK":
        print("Song started.")
        return

    # The Lua side collapses "not a valid time" and "no match" into the
    # same FAIL response, since both mean nothing happened - draw the
    # distinction here from what we know about the request instead.
    raise PlayError(
        "USDX declined the play request."
    )


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Ask UltraStar Deluxe to play a song via the controller bridge."
    )

    parser.add_argument(
        "search",
        nargs="+",
        help="Text to search for in USDX.",
    )

    args = parser.parse_args()

    play_song(" ".join(args.search))


if __name__ == "__main__":
    main()
