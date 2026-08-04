
const searchInput = document.getElementById("search");
const searchField = document.getElementById("searchField");
const searchStatus = document.getElementById("searchStatus");
const results = document.getElementById("results");
const duetsOnly = document.getElementById("duetsOnly");

let searchTimer = null;

searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);

    searchTimer = setTimeout(searchSongs, 200);
});

searchField.addEventListener("change", () => {
    searchSongs();
});

duetsOnly.addEventListener("change", () => {
    searchSongs();
});

document.querySelectorAll(".tab-button").forEach(button => {
    button.addEventListener("click", () => {
        document.querySelectorAll(".tab-button").forEach(tab => {
            tab.classList.remove("active");
        });

        document.querySelectorAll(".tab-panel").forEach(panel => {
            panel.classList.remove("active");
        });

        button.classList.add("active");

        document
            .getElementById(button.dataset.tab)
            .classList.add("active");
    });
});

async function searchSongs() {
    const query = searchInput.value.trim();
    const field = searchField.value;

    results.innerHTML = "";

    searchStatus.textContent = "Searching...";

    try {
        const params = new URLSearchParams({
            q: query,
            field: field,
            duets_only: duetsOnly.checked ? "1" : "0",
        });

        const response = await fetch(
            `/api/search?${params.toString()}`
        );

        if (!response.ok) {
            throw new Error(
                `Search failed (${response.status})`
            );
        }

        const songs = await response.json();

        if (songs.length === 0) {
            searchStatus.textContent = "No results.";
            return;
        }

        searchStatus.textContent = `${songs.length} result${songs.length === 1 ? "" : "s"}`;

        for (const song of songs) {
            addSongResult(song);
        }
    } catch (error) {
        console.error(error);
        searchStatus.textContent = "Search failed.";
    }
}

function addSongResult(song) {
    const element = document.createElement("div");
    element.className = "song";

    const info = document.createElement("div");
    info.className = "song-info";

    const title = document.createElement("div");
    title.className = "song-title";
    title.textContent = song.title;

    const artist = document.createElement("div");
    artist.className = "song-artist";
    artist.textContent = song.artist;

    if (song.is_duet) {
        const duetImage = document.createElement("img");

        duetImage.src = "/static/song_duet.png";
        duetImage.alt = "Duet";
        duetImage.className = "song-duet";

        title.prepend(duetImage);
    }

    info.appendChild(title);
    info.appendChild(artist);

    const controls = document.createElement("div");
    controls.className = "song-controls";

    const playButton = document.createElement("button");
    playButton.className = "song-button";
    playButton.innerHTML = '<i class="fa-solid fa-play"></i>';

    playButton.addEventListener("click", () => {
        playSong(song, playButton);
    });

    const queueButton = document.createElement("button");
    queueButton.className = "song-button";
    queueButton.innerHTML = '<i class="fa-solid fa-plus"></i>';

    queueButton.addEventListener("click", () => {
        addToQueue(song);
    });

    controls.appendChild(playButton);
    controls.appendChild(queueButton);

    element.appendChild(info);
    element.appendChild(controls);

    results.appendChild(element);
}

async function playSong(song, button) {
    button.disabled = true;
    button.textContent = "Playing...";

    try {
        const response = await fetch("/api/play", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                search: `${song.artist} ${song.title}`,
            }),
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(
                data.error || "Unable to play song."
            );
        }

        button.textContent = "Playing";
    } catch (error) {
        console.error(error);
        button.textContent = "Error";

        setTimeout(() => {
            button.disabled = false;
            button.textContent = "Play";
        }, 2000);
    }
}

async function loadQueue() {
    try {
        const response = await fetch("/api/queue");

        if (!response.ok) {
            throw new Error("Failed to load queue.");
        }

        const songs = await response.json();

        renderQueue(songs);
    } catch (error) {
        console.error(error);
    }
}

function renderQueue(songs) {
    const queueElement = document.getElementById("queue");

    queueElement.innerHTML = "";

    if (songs.length === 0) {
        queueElement.innerHTML =
            '<div class="no-results">Queue is empty.</div>';

        return;
    }

    songs.forEach((song, index) => {
        const element = document.createElement("div");
        element.className = "song";

        const info = document.createElement("div");
        info.className = "song-info";

        const title = document.createElement("div");
        title.className = "song-title";
        title.textContent = `${index + 1}. ${song.title}`;

        const artist = document.createElement("div");
        artist.className = "song-artist";
        artist.textContent = song.artist;

        info.appendChild(title);
        info.appendChild(artist);

        const removeButton = document.createElement("button");
        removeButton.className = "song-button";
        removeButton.innerHTML = '<i class="fa-solid fa-trash"></i>';

        removeButton.addEventListener("click", () => {
            removeFromQueue(song.id);
        });

        element.appendChild(info);
        element.appendChild(removeButton);

        queueElement.appendChild(element);
    });

    updateQueueCount(songs);
}

async function addToQueue(song) {
    try {
        const response = await fetch("/api/queue", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                id: song.id,
            }),
        });

        if (!response.ok) {
            throw new Error("Failed to add song to queue.");
        }

        await loadQueue();
    } catch (error) {
        console.error(error);
    }
}

async function removeFromQueue(songId) {
    try {
        const response = await fetch(
            `/api/queue/${encodeURIComponent(songId)}`,
            {
                method: "DELETE",
            }
        );

        if (!response.ok) {
            throw new Error("Failed to remove song.");
        }

        await loadQueue();
    } catch (error) {
        console.error(error);
    }
}

async function clearQueue() {
    if (!confirm("Are you sure you want to clear the queue?")) {
        return;
    }

    try {
        const response = await fetch("/api/queue", {
            method: "DELETE",
        });

        if (!response.ok) {
            throw new Error("Failed to clear queue.");
        }

        await loadQueue();
    } catch (error) {
        console.error(error);
    }
}

function updateQueueCount(queue) {
    const count = document.getElementById("queue-count");

    if (queue.length > 0) {
        count.textContent = `(${queue.length})`;
    } else {
        count.textContent = "";
    }
}

async function playNext() {
    if (!confirm("Start next song? Make sure you're on the song")) {
        return;
    }

    try {
        // Get the current queue.
        const queueResponse = await fetch("/api/queue");
        if (!queueResponse.ok) {
            throw new Error(`Failed to get queue: ${queueResponse.status}`);
        }

        const queue = await queueResponse.json();
        if (queue.length === 0) {
            alert("The queue is empty.");
            return;
        }

        const song = queue[0];
        console.log(queue);

        const response = await fetch("/api/play", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                search: `${song.artist} ${song.title}`,
            }),
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(
                data.error || "Unable to play song."
            );
        }

        // Only remove it after USDX successfully starts the song.
        await removeFromQueue(song.id);
    } catch (error) {
        console.error(error);
        alert(error.message || "Unable to play next song.");
    }
}

searchSongs();

const queueEvents = new EventSource("/api/queue/events");
queueEvents.addEventListener("message", () => {
    loadQueue();
});