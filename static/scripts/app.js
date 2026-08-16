
const searchInput = document.getElementById("search");
const searchField = document.getElementById("searchField");
const searchStatus = document.getElementById("searchStatus");
const results = document.getElementById("results");
const duetsFilter = document.getElementById("duetsFilter");
const newFilter = document.getElementById("newFilter");

let searchTimer = null;

searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);

    searchTimer = setTimeout(searchSongs, 200);
});

searchField.addEventListener("change", () => {
    searchSongs();
});

duetsFilter.addEventListener("change", () => {
    searchSongs();
});

newFilter.addEventListener("change", () => {
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
            duets_filter: duetsFilter.checked ? "1" : "0",
            new_filter: newFilter.checked ? "1" : "0",
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

    const artist = document.createElement("div");
    artist.className = "song-artist";
    artist.textContent = song.artist;

    if (song.is_duet || song.is_new) {
        const titleEnd = document.createElement("span");
        titleEnd.className = "title-end";

        // Split the title at the last space.
        const lastSpace = song.title.lastIndexOf(" ");

        if (lastSpace === -1) {
            titleEnd.textContent = song.title + " ";
        } else {
            title.textContent = song.title.substring(0, lastSpace + 1);
            titleEnd.appendChild(document.createTextNode(song.title.substring(lastSpace + 1) + " "));
        }

        if (song.is_duet) {
            const duetImage = document.createElement("img");
            duetImage.src = "/static/song_duet.png";
            duetImage.alt = "Duet";
            duetImage.className = "song-duet";
            titleEnd.appendChild(duetImage);
        }

        if (song.is_new) {
            const newIndicator = document.createElement("i");
            newIndicator.className = "fa-solid fa-star song-new";
            titleEnd.appendChild(newIndicator);
        }

        title.appendChild(titleEnd);
    } else {
        title.textContent = song.title;
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
        addToQueue(song, queueButton);
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

    let success = false;
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
            const error = new Error(data.error || "Unable to play song.");
            error.status = response.status;
            throw error
        }

        button.textContent = "Playing";
        success = true;
    } catch (error) {
        if (error.status === 200) {
            console.log("USDX declined to play the song.");
        } else {
            console.error(error);
        }
        button.textContent = "Error";
    } finally {
        setTimeout(() => {
            button.disabled = false;
            button.innerHTML = '<i class="fa-solid fa-play"></i>';
        }, 2000);
    }

    return success;
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
        queueElement.innerHTML = '<div class="no-results">Queue is empty.</div>';
        updateQueueCount(songs);
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

        const controls = document.createElement("div");
        controls.className = "song-controls";

        const playButton = document.createElement("button");
        playButton.className = "song-button";
        playButton.innerHTML = '<i class="fa-solid fa-play"></i>';

        playButton.addEventListener("click", async () => {
            const success = await playSong(song, playButton);
            if (success) {
                removeFromQueue(song.id);
            }
        });

        const removeButton = document.createElement("button");
        removeButton.className = "song-button";
        removeButton.innerHTML = '<i class="fa-solid fa-trash"></i>';

        removeButton.addEventListener("click", () => {
            if (!confirm("Remove song from queue?")) {
                return;
            }
            removeFromQueue(song.id);
        });


        controls.appendChild(playButton);
        controls.appendChild(removeButton);

        element.appendChild(info);
        element.appendChild(controls);

        queueElement.appendChild(element);
    });

    updateQueueCount(songs);
}

async function addToQueue(song, button) {
    try {
        button.disabled = true;

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
        button.textContent = "Error";
    } finally {
        setTimeout(() => {
            button.disabled = false;
        }, 2000);
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

async function playNext(button) {
    try {
        button.disabled = true;
        button.textContent = "Playing...";

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
            const error = new Error(data.error || "Unable to play song.");
            error.status = response.status;
            throw error
        }

        button.textContent = "Playing";

        // Only remove it after USDX successfully starts the song.
        await removeFromQueue(song.id);
    } catch (error) {
        if (error.status === 200) {
            console.log("USDX declined to play the song.");
        } else {
            console.error(error);
        }
        button.textContent = "Error";
    } finally {
        setTimeout(() => {
            button.disabled = false;
            button.innerHTML = '<i class="fa-solid fa-play"></i>';
        }, 2000);
    }
}

searchSongs();

const queueEvents = new EventSource("/api/queue/events");
queueEvents.addEventListener("message", () => {
    loadQueue();
});