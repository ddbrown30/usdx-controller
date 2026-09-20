
const searchInput = document.getElementById("search");
const searchField = document.getElementById("searchField");
const searchStatus = document.getElementById("searchStatus");
const clearSearchBtn = document.getElementById("clearSearch");
const results = document.getElementById("results");
const favouritesContainer = document.getElementById("favourites");

const filterBtn = document.getElementById("filterBtn");
const filterCount = document.getElementById("filterCount");
const filterOverlay = document.getElementById("filter-overlay");
const closeFiltersBtn = document.getElementById("close-filters-btn");
const clearFiltersBtn = document.getElementById("clear-filters-btn");
const chipDuets = document.getElementById("chip-duets");
const chipNew = document.getElementById("chip-new");
const decadeChips = document.getElementById("decade-chips");
const tagChips = document.getElementById("tag-chips");

let searchTimer = null;
let currentUsername = null;

searchInput.addEventListener("input", () => {
    updateClearButtonVisibility();

    clearTimeout(searchTimer);

    searchTimer = setTimeout(searchSongs, 200);
});

// Closes the on-screen keyboard when the search/go key is pressed.
searchInput.addEventListener("search", () => {
    searchInput.blur();
});

searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        searchInput.blur();
    }
});

searchField.addEventListener("change", () => {
    searchSongs();
});

filterBtn.addEventListener("click", () => {
    filterOverlay.hidden = false;
});

closeFiltersBtn.addEventListener("click", () => {
    filterOverlay.hidden = true;
});

filterOverlay.addEventListener("click", (event) => {
    if (event.target === filterOverlay) {
        filterOverlay.hidden = true;
    }
});

clearFiltersBtn.addEventListener("click", () => {
    document.querySelectorAll(".chip.active").forEach(chip => {
        chip.classList.remove("active");
    });

    updateFilterCount();
    searchSongs();
});

chipDuets.addEventListener("click", () => {
    chipDuets.classList.toggle("active");
    updateFilterCount();
    searchSongs();
});

chipNew.addEventListener("click", () => {
    chipNew.classList.toggle("active");
    updateFilterCount();
    searchSongs();
});

function updateFilterCount() {
    const count = document.querySelectorAll(".chip.active").length;

    filterCount.textContent = count;
    filterCount.hidden = count === 0;
}

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
            duets_filter: chipDuets.classList.contains("active") ? "1" : "0",
            new_filter: chipNew.classList.contains("active") ? "1" : "0",
        });

        decadeChips.querySelectorAll(".chip.active").forEach(chip => {
            params.append("decades", chip.dataset.decade);
        });

        tagChips.querySelectorAll(".chip.active").forEach(chip => {
            params.append("tags", chip.dataset.tag);
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

        const fragment = document.createDocumentFragment();

        for (const song of songs) {
            fragment.appendChild(buildSongRow(song));
        }

        results.appendChild(fragment);
    } catch (error) {
        console.error(error);
        searchStatus.textContent = "Search failed.";
    }
}

async function loadDecades() {
    try {
        const response = await fetch("/api/decades");

        if (!response.ok) {
            throw new Error(`Failed to load decades (${response.status})`);
        }

        const decades = await response.json();

        for (const decade of decades) {
            const chip = document.createElement("button");
            chip.type = "button";
            chip.className = "chip";
            chip.dataset.decade = decade;
            chip.textContent = `${decade}s`;

            chip.addEventListener("click", () => {
                chip.classList.toggle("active");
                updateFilterCount();
                searchSongs();
            });

            decadeChips.appendChild(chip);
        }
    } catch (error) {
        console.error(error);
    }
}

async function loadTags() {
    try {
        const response = await fetch("/api/tags");

        if (!response.ok) {
            throw new Error(`Failed to load tags (${response.status})`);
        }

        const tags = await response.json();

        for (const tag of tags) {
            const chip = document.createElement("button");
            chip.type = "button";
            chip.className = "chip";
            chip.dataset.tag = tag;
            chip.textContent = tag;

            chip.addEventListener("click", () => {
                chip.classList.toggle("active");
                updateFilterCount();
                searchSongs();
            });

            tagChips.appendChild(chip);
        }
    } catch (error) {
        console.error(error);
    }
}

function setFavouriteButtonState(button, isFavourite) {
    button.classList.toggle("active", isFavourite);
    button.innerHTML = isFavourite
        ? '<i class="fa-solid fa-heart"></i>'
        : '<i class="fa-regular fa-heart"></i>';
}

// Updates every rendered row for this song - search and favourites
// each render their own separate copy of a song's row, so toggling a
// favourite in one place has to be reflected in both, not just the
// row that was actually clicked.
function syncFavouriteState(songId, isFavourite) {
    const buttons = [
        ...results.querySelectorAll(".song-favourite"),
        ...favouritesContainer.querySelectorAll(".song-favourite"),
    ];

    for (const button of buttons) {
        if (button.dataset.songId !== songId) {
            continue;
        }

        setFavouriteButtonState(button, isFavourite);

        if (!isFavourite) {
            const row = button.closest(".song");

            if (row && row.parentElement === favouritesContainer) {
                row.remove();
            }
        }
    }

    if (!isFavourite && favouritesContainer.children.length === 0) {
        favouritesContainer.innerHTML = '<div class="no-results">No favourites yet.</div>';
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
    favouriteButton.className = "song-button song-favourite";
    favouriteButton.dataset.songId = song.id;
    setFavouriteButtonState(favouriteButton, song.is_favourite);

    favouriteButton.addEventListener("click", async () => {
        // Read current state from the DOM rather than the closed-over
        // song object: search and favourites render separate song
        // objects for the same underlying song, and syncFavouriteState
        // below keeps every rendered row's DOM in sync, not each
        // row's own JS object.
        const newState = !favouriteButton.classList.contains("active");

        favouriteButton.disabled = true;

        const success = await setFavourite(song.id, newState);

        if (success) {
            syncFavouriteState(song.id, newState);
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

const browseUsersBtn = document.getElementById("browse-users-btn");
const loginStepBrowse = document.getElementById("login-step-browse");
const browseUsersSearch = document.getElementById("browse-users-search");
const browseUsersError = document.getElementById("browse-users-error");
const browseUsersList = document.getElementById("browse-users-list");
const browseUsersBackBtn = document.getElementById("browse-users-back-btn");

const renameOverlay = document.getElementById("rename-overlay");
const renameUsernameInput = document.getElementById("rename-username-input");
const renameError = document.getElementById("rename-error");
const renameSaveBtn = document.getElementById("rename-save-btn");
const renameCancelBtn = document.getElementById("rename-cancel-btn");
const switchUserBtn = document.getElementById("switch-user-btn");

let pendingLoginUsername = null;

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

// Resets local session state and reopens the login flow. The server
// side of "logging out" happens implicitly: once the account behind
// the cookie no longer exists (or a different one is chosen), the
// next /api/user check already reports needs_login on its own - this
// just makes that switch happen immediately client-side instead of
// waiting for the next check.
function logOutCurrentUser() {
    currentUsername = null;
    usernameDisplay.textContent = "";
    renameOverlay.hidden = true;
    showLoginModal();
}

function showLoginModal() {
    loginStepEnter.hidden = false;
    loginStepConfirm.hidden = true;
    loginStepBrowse.hidden = true;
    loginError.textContent = "";
    loginUsernameInput.value = "";
    loginOverlay.hidden = false;
    loginUsernameInput.focus();
}

function hideLoginModal() {
    loginOverlay.hidden = true;
}

let allUsernames = null;

browseUsersBtn.addEventListener("click", () => {
    loginStepEnter.hidden = true;
    loginStepBrowse.hidden = false;
    browseUsersError.textContent = "";
    browseUsersSearch.value = "";
    openBrowseUsers();
    browseUsersSearch.focus();
});

browseUsersBackBtn.addEventListener("click", () => {
    loginStepBrowse.hidden = true;
    loginStepEnter.hidden = false;
    loginUsernameInput.focus();
});

browseUsersSearch.addEventListener("input", () => {
    renderBrowseUsersList(browseUsersSearch.value);
});

async function openBrowseUsers() {
    browseUsersList.innerHTML = '<div class="browse-users-empty">Loading...</div>';

    try {
        const response = await fetch("/api/users");

        if (!response.ok) {
            throw new Error("Failed to load users.");
        }

        allUsernames = await response.json();
        renderBrowseUsersList(browseUsersSearch.value);
    } catch (error) {
        console.error(error);
        allUsernames = null;
        browseUsersList.innerHTML = '<div class="browse-users-empty">Failed to load users.</div>';
    }
}

function renderBrowseUsersList(filterText) {
    if (allUsernames === null) {
        return;
    }

    const filter = filterText.trim().toLowerCase();
    const filtered = filter
        ? allUsernames.filter((name) => name.toLowerCase().includes(filter))
        : allUsernames;

    browseUsersList.innerHTML = "";

    if (filtered.length === 0) {
        browseUsersList.innerHTML = allUsernames.length === 0
            ? '<div class="browse-users-empty">No users yet.</div>'
            : '<div class="browse-users-empty">No matches.</div>';
        return;
    }

    for (const name of filtered) {
        const row = document.createElement("button");
        row.type = "button";
        row.className = "browse-user-row";
        row.textContent = name;

        row.addEventListener("click", () => {
            selectExistingUser(name);
        });

        browseUsersList.appendChild(row);
    }
}

async function selectExistingUser(username) {
    browseUsersError.textContent = "";

    const rows = browseUsersList.querySelectorAll(".browse-user-row");
    rows.forEach((row) => {
        row.disabled = true;
    });

    // Picking a name from the list is already an explicit, unambiguous
    // choice, so skip the "Are you X?" confirmation step and log
    // straight in.
    const data = await performLogin(username, true);

    if (data && data.success) {
        onLoginSuccess(data.username);
    } else {
        rows.forEach((row) => {
            row.disabled = false;
        });
        browseUsersError.textContent = (data && data.error) || "Something went wrong.";
    }
}

function onLoginSuccess(username) {
    hideLoginModal();
    setCurrentUsername(username);
    searchSongs();
    loadQueue();

    // Switching accounts mid-session (via Switch User, or being logged
    // out from under yourself) can leave the favourites tab showing
    // the previous account's list if it was already open.
    if (document.getElementById("favourites-tab").classList.contains("active")) {
        loadFavourites();
    }
}

async function performLogin(username, confirm) {
    try {
        const response = await fetch("/api/user/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ username, confirm }),
        });

        return await response.json();
    } catch (error) {
        console.error(error);
        return null;
    }
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

    const data = await performLogin(username, false);

    if (data && data.success) {
        onLoginSuccess(data.username);
    } else if (data && data.exists) {
        pendingLoginUsername = username;
        confirmUsernameSpan.textContent = username;
        loginStepEnter.hidden = true;
        loginStepConfirm.hidden = false;
    } else {
        loginError.textContent = (data && data.error) || "Something went wrong.";
    }

    loginContinueBtn.disabled = false;
}

confirmYesBtn.addEventListener("click", async () => {
    confirmYesBtn.disabled = true;

    const data = await performLogin(pendingLoginUsername, true);

    if (data && data.success) {
        onLoginSuccess(data.username);
    }

    confirmYesBtn.disabled = false;
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

switchUserBtn.addEventListener("click", () => {
    logOutCurrentUser();
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

// --- Admin -------------------------------------------------------------

const adminTabButton = document.getElementById("admin-tab-button");
const userManagementBtn = document.getElementById("user-management-btn");
const adminUserManagement = document.getElementById("admin-user-management");
const adminUserError = document.getElementById("admin-user-error");
const adminUserList = document.getElementById("admin-user-list");

const isAdminMode = new URLSearchParams(window.location.search).has("admin");

if (isAdminMode) {
    adminTabButton.hidden = false;
}

userManagementBtn.addEventListener("click", () => {
    adminUserManagement.hidden = false;
    loadAdminUsers();
});

async function loadAdminUsers() {
    adminUserError.textContent = "";
    adminUserList.innerHTML = '<div class="no-results">Loading...</div>';

    try {
        const response = await fetch("/api/users");

        if (!response.ok) {
            throw new Error("Failed to load users.");
        }

        const usernames = await response.json();

        adminUserList.innerHTML = "";

        if (usernames.length === 0) {
            adminUserList.innerHTML = '<div class="no-results">No users yet.</div>';
            return;
        }

        for (const name of usernames) {
            adminUserList.appendChild(buildAdminUserRow(name));
        }
    } catch (error) {
        console.error(error);
        adminUserList.innerHTML = "";
        adminUserError.textContent = "Failed to load users.";
    }
}

function buildAdminUserRow(username) {
    const row = document.createElement("div");
    row.className = "admin-user-row";

    const name = document.createElement("span");
    name.className = "admin-user-name";
    name.textContent = username;

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "song-button";
    deleteBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';

    deleteBtn.addEventListener("click", () => {
        if (!confirm(`Delete user "${username}"? This cannot be undone.`)) {
            return;
        }

        deleteAdminUser(username, row, deleteBtn);
    });

    row.appendChild(name);
    row.appendChild(deleteBtn);

    return row;
}

async function deleteAdminUser(username, row, button) {
    adminUserError.textContent = "";
    button.disabled = true;

    try {
        const response = await fetch(`/api/users/${encodeURIComponent(username)}`, {
            method: "DELETE",
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.error || "Failed to delete user.");
        }

        row.remove();

        if (adminUserList.children.length === 0) {
            adminUserList.innerHTML = '<div class="no-results">No users yet.</div>';
        }

        if (currentUsername && username.toLowerCase() === currentUsername.toLowerCase()) {
            logOutCurrentUser();
        }
    } catch (error) {
        console.error(error);
        adminUserError.textContent = error.message || "Failed to delete user.";
        button.disabled = false;
    }
}

// --- Now playing ---------------------------------------------------------

const nowPlayingDisplay = document.getElementById("now-playing");

async function loadNowPlaying() {
    try {
        const response = await fetch("/api/now_playing");

        if (!response.ok) {
            throw new Error("Failed to load now playing.");
        }

        const data = await response.json();

        nowPlayingDisplay.textContent = data.title
            ? `Now Playing: ${data.title} - ${data.artist}`
            : "Now Playing: -";
    } catch (error) {
        console.error(error);
    }
}

updateClearButtonVisibility();
initUser();
loadDecades();
loadTags();
searchSongs();
loadNowPlaying();
setInterval(loadNowPlaying, 3000);

const queueEvents = new EventSource("/api/queue/events");
queueEvents.addEventListener("message", () => {
    loadQueue();
});
