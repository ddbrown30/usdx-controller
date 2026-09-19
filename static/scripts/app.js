
const searchInput = document.getElementById("search");
const searchField = document.getElementById("searchField");
const searchStatus = document.getElementById("searchStatus");
const clearSearchBtn = document.getElementById("clearSearch");
const results = document.getElementById("results");
const favouritesContainer = document.getElementById("favourites");
const duetsFilter = document.getElementById("duetsFilter");
const newFilter = document.getElementById("newFilter");

let searchTimer = null;
let currentUsername = null;

searchInput.addEventListener("input", () => {
    updateClearButtonVisibility();

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

clearSearchBtn.addEventListener("click", () => {
    searchInput.value = "";
    updateClearButtonVisibility();
    searchInput.focus();
    searchSongs();
});

function updateClearButtonVisibility() {
    clearSearchBtn.classList.toggle("visible", searchInput.value.length > 0);
}

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

        if (button.dataset.tab === "favourites-tab") {
            loadFavourites();
        }
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

function buildSongRow(song) {
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

    const favouriteButton = document.createElement("button");
    favouriteButton.className = "song-button song-favourite" + (song.is_favourite ? " active" : "");
    favouriteButton.innerHTML = song.is_favourite
        ? '<i class="fa-solid fa-star"></i>'
        : '<i class="fa-regular fa-star"></i>';

    favouriteButton.addEventListener("click", async () => {
        const newState = !song.is_favourite;

        favouriteButton.disabled = true;

        const success = await setFavourite(song.id, newState);

        if (success) {
            song.is_favourite = newState;
            favouriteButton.classList.toggle("active", newState);
            favouriteButton.innerHTML = newState
                ? '<i class="fa-solid fa-star"></i>'
                : '<i class="fa-regular fa-star"></i>';

            if (!newState && element.parentElement === favouritesContainer) {
                element.remove();

                if (favouritesContainer.children.length === 0) {
                    favouritesContainer.innerHTML = '<div class="no-results">No favourites yet.</div>';
                }
            }
        }

        favouriteButton.disabled = false;
    });

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

    controls.appendChild(favouriteButton);
    controls.appendChild(playButton);
    controls.appendChild(queueButton);

    element.appendChild(info);
    element.appendChild(controls);

    return element;
}

function addSongResult(song) {
    results.appendChild(buildSongRow(song));
}

function addFavouriteResult(song) {
    favouritesContainer.appendChild(buildSongRow(song));
}

async function setFavourite(songId, favourite) {
    try {
        const response = favourite
            ? await fetch("/api/favourites", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ id: songId }),
            })
            : await fetch(`/api/favourites/${encodeURIComponent(songId)}`, {
                method: "DELETE",
            });

        if (!response.ok) {
            throw new Error("Failed to update favourite.");
        }

        return true;
    } catch (error) {
        console.error(error);
        return false;
    }
}

async function loadFavourites() {
    try {
        const response = await fetch("/api/favourites");

        if (!response.ok) {
            throw new Error("Failed to load favourites.");
        }

        const songs = await response.json();

        favouritesContainer.innerHTML = "";

        if (songs.length === 0) {
            favouritesContainer.innerHTML = '<div class="no-results">No favourites yet.</div>';
            return;
        }

        for (const song of songs) {
            addFavouriteResult(song);
        }
    } catch (error) {
        console.error(error);
        favouritesContainer.innerHTML = '<div class="no-results">Failed to load favourites.</div>';
    }
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

        if (song.added_by) {
            const addedBy = document.createElement("div");
            addedBy.className = "song-added-by";
            addedBy.textContent = `Added by ${song.added_by}`;
            info.appendChild(addedBy);
        }

        const controls = document.createElement("div");
        controls.className = "song-controls";

        const playButton = document.createElement("button");
        playButton.className = "song-button";
        playButton.innerHTML = '<i class="fa-solid fa-play"></i>';

        playButton.addEventListener("click", async () => {
            const success = await playSong(song, playButton);
            if (success) {
                removeFromQueue(song.queue_id);
            }
        });

        const removeButton = document.createElement("button");
        removeButton.className = "song-button";
        removeButton.innerHTML = '<i class="fa-solid fa-trash"></i>';

        removeButton.addEventListener("click", () => {
            if (!confirm("Remove song from queue?")) {
                return;
            }
            removeFromQueue(song.queue_id);
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

async function removeFromQueue(queueId) {
    try {
        const response = await fetch(
            `/api/queue/${encodeURIComponent(queueId)}`,
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
        await removeFromQueue(song.queue_id);
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

// --- User login / rename -------------------------------------------

const usernameDisplay = document.getElementById("username-display");
const renameUserBtn = document.getElementById("rename-user-btn");

const loginOverlay = document.getElementById("login-overlay");
const loginStepEnter = document.getElementById("login-step-enter");
const loginStepConfirm = document.getElementById("login-step-confirm");
const loginUsernameInput = document.getElementById("login-username-input");
const loginError = document.getElementById("login-error");
const loginContinueBtn = document.getElementById("login-continue-btn");
const confirmUsernameSpan = document.getElementById("confirm-username");
const confirmYesBtn = document.getElementById("confirm-yes-btn");
const confirmNoBtn = document.getElementById("confirm-no-btn");

const renameOverlay = document.getElementById("rename-overlay");
const renameUsernameInput = document.getElementById("rename-username-input");
const renameError = document.getElementById("rename-error");
const renameSaveBtn = document.getElementById("rename-save-btn");
const renameCancelBtn = document.getElementById("rename-cancel-btn");

let pendingLoginUsername = null;

// Default typed usernames to an uppercase first letter, without
// touching the rest of what's typed (so e.g. "dan" becomes "Dan" as
// you type, but "danBrown" stays "DanBrown" past the first letter).
// Preserves cursor position so it doesn't disrupt mid-string editing.
function capitalizeFirstLetter(input) {
    const value = input.value;

    if (!value) {
        return;
    }

    const capitalized = value.charAt(0).toUpperCase() + value.slice(1);

    if (capitalized === value) {
        return;
    }

    const selectionStart = input.selectionStart;
    const selectionEnd = input.selectionEnd;

    input.value = capitalized;
    input.setSelectionRange(selectionStart, selectionEnd);
}

loginUsernameInput.addEventListener("input", () => {
    capitalizeFirstLetter(loginUsernameInput);
});

renameUsernameInput.addEventListener("input", () => {
    capitalizeFirstLetter(renameUsernameInput);
});

async function initUser() {
    try {
        const response = await fetch("/api/user");
        const data = await response.json();

        if (data.needs_login) {
            showLoginModal();
        } else {
            setCurrentUsername(data.username);
        }
    } catch (error) {
        console.error(error);
    }
}

function setCurrentUsername(username) {
    currentUsername = username;
    usernameDisplay.textContent = username;
}

function showLoginModal() {
    loginStepEnter.hidden = false;
    loginStepConfirm.hidden = true;
    loginError.textContent = "";
    loginUsernameInput.value = "";
    loginOverlay.hidden = false;
    loginUsernameInput.focus();
}

function hideLoginModal() {
    loginOverlay.hidden = true;
}

loginContinueBtn.addEventListener("click", submitLogin);

loginUsernameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        submitLogin();
    }
});

async function submitLogin() {
    const username = loginUsernameInput.value.trim();

    if (!username) {
        loginError.textContent = "Please enter a username.";
        return;
    }

    loginError.textContent = "";
    loginContinueBtn.disabled = true;

    try {
        const response = await fetch("/api/user/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ username }),
        });

        const data = await response.json();

        if (data.success) {
            hideLoginModal();
            setCurrentUsername(data.username);
            searchSongs();
            loadQueue();
        } else if (data.exists) {
            pendingLoginUsername = username;
            confirmUsernameSpan.textContent = username;
            loginStepEnter.hidden = true;
            loginStepConfirm.hidden = false;
        } else {
            loginError.textContent = data.error || "Something went wrong.";
        }
    } catch (error) {
        console.error(error);
        loginError.textContent = "Something went wrong.";
    } finally {
        loginContinueBtn.disabled = false;
    }
}

confirmYesBtn.addEventListener("click", async () => {
    confirmYesBtn.disabled = true;

    try {
        const response = await fetch("/api/user/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ username: pendingLoginUsername, confirm: true }),
        });

        const data = await response.json();

        if (data.success) {
            hideLoginModal();
            setCurrentUsername(data.username);
            searchSongs();
            loadQueue();
        }
    } catch (error) {
        console.error(error);
    } finally {
        confirmYesBtn.disabled = false;
    }
});

confirmNoBtn.addEventListener("click", () => {
    pendingLoginUsername = null;
    showLoginModal();
});

renameUserBtn.addEventListener("click", () => {
    renameUsernameInput.value = currentUsername || "";
    renameError.textContent = "";
    renameOverlay.hidden = false;
    renameUsernameInput.focus();
    renameUsernameInput.select();
});

renameCancelBtn.addEventListener("click", () => {
    renameOverlay.hidden = true;
});

renameUsernameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        submitRename();
    }
});

renameSaveBtn.addEventListener("click", submitRename);

async function submitRename() {
    const newUsername = renameUsernameInput.value.trim();

    if (!newUsername) {
        renameError.textContent = "Please enter a username.";
        return;
    }

    renameError.textContent = "";
    renameSaveBtn.disabled = true;

    try {
        const response = await fetch("/api/user/rename", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ new_username: newUsername }),
        });

        const data = await response.json();

        if (data.success) {
            setCurrentUsername(data.username);
            renameOverlay.hidden = true;
        } else {
            renameError.textContent = data.error || "Something went wrong.";
        }
    } catch (error) {
        console.error(error);
        renameError.textContent = "Something went wrong.";
    } finally {
        renameSaveBtn.disabled = false;
    }
}

updateClearButtonVisibility();
initUser();
searchSongs();

const queueEvents = new EventSource("/api/queue/events");
queueEvents.addEventListener("message", () => {
    loadQueue();
});
