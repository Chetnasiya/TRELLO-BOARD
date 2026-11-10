const state = {
    token: localStorage.getItem("tandemToken"),
    username: localStorage.getItem("tandemUsername"),
    organizationId: localStorage.getItem("tandemOrganizationId"),
    organization: null,
    members: null,
    boards: [],
    selectedBoardId: null,
    issues: [],
    userId: null,
    authMode: "signin"
};

const elements = Object.fromEntries([
    "auth-view", "workspace-view", "auth-form", "auth-username", "auth-password",
    "auth-title", "auth-eyebrow", "auth-subtitle", "auth-submit", "auth-switch",
    "auth-switch-copy", "auth-message", "current-user", "logout-button",
    "organization-summary", "join-form", "organization-form", "member-list",
    "member-count", "member-form", "member-username", "member-hint", "workspace-empty",
    "board-workspace", "workspace-title", "workspace-description", "copy-org-id",
    "refresh-button", "board-tabs", "board-form", "board-title", "board-empty",
    "issue-board", "selected-board-title", "issue-form", "issue-title", "issue-state",
    "issue-columns", "toast", "welcome-create", "join-id", "organization-title",
    "organization-description"
].map(id => [id, document.getElementById(id)]));

function decodeUserId(token) {
    try {
        const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
        return payload.userId || null;
    } catch (error) {
        return null;
    }
}

function setAuthMessage(message, isError = true) {
    elements["auth-message"].textContent = message;
    elements["auth-message"].classList.toggle("success-message", !isError);
}

let toastTimer;
function showToast(message, isError = false) {
    elements.toast.textContent = message;
    elements.toast.classList.toggle("error", isError);
    elements.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { elements.toast.hidden = true; }, 4200);
}

function showAuthentication(message = "") {
    elements["auth-view"].hidden = false;
    elements["workspace-view"].hidden = true;
    elements["current-user"].hidden = true;
    elements["logout-button"].hidden = true;
    setAuthMode("signin");
    if (message) setAuthMessage(message);
}

function showWorkspace() {
    elements["auth-view"].hidden = true;
    elements["workspace-view"].hidden = false;
    elements["current-user"].hidden = false;
    elements["logout-button"].hidden = false;
    elements["current-user"].textContent = state.username || "Team member";
}

async function request(url, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (state.token) headers.authorization = `Bearer ${state.token}`;
    if (options.body !== undefined) headers["content-type"] = "application/json";

    const response = await fetch(url, {
        ...options,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });
    const result = await response.json();
    if (response.status === 401 && state.token) {
        localStorage.removeItem("tandemToken");
        localStorage.removeItem("tandemUsername");
        state.token = null;
        state.username = null;
        state.userId = null;
        showAuthentication("Your session expired. Please sign in again.");
    }
    if (!response.ok) throw new Error(result.message || "The request could not be completed.");
    return result;
}

function reportError(error, location = "toast") {
    const message = error instanceof Error ? error.message : "Something went wrong.";
    if (location === "auth") setAuthMessage(message);
    else showToast(message, true);
}

function makeElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
}

function setAuthMode(mode) {
    state.authMode = mode;
    const signingUp = mode === "signup";
    elements["auth-eyebrow"].textContent = signingUp ? "GET YOUR TEAM STARTED" : "WELCOME BACK";
    elements["auth-title"].textContent = signingUp ? "Create your account" : "Sign in to your space";
    elements["auth-subtitle"].textContent = signingUp
        ? "One account, and your team is ready to go."
        : "Pick up right where your team left off.";
    elements["auth-submit"].textContent = signingUp ? "Create account" : "Sign in";
    elements["auth-switch-copy"].textContent = signingUp ? "Already have an account?" : "New to Tandem?";
    elements["auth-switch"].textContent = signingUp ? "Sign in" : "Create an account";
    elements["auth-password"].autocomplete = signingUp ? "new-password" : "current-password";
    elements["auth-password"].minLength = signingUp ? 8 : 1;
    setAuthMessage("");
}

async function signIn(username, password) {
    const result = await request("/signin", { method: "POST", body: { username, password } });
    state.token = result.token;
    state.userId = decodeUserId(result.token);
    state.username = username;
    localStorage.setItem("tandemToken", result.token);
    localStorage.setItem("tandemUsername", username);
    elements["current-user"].textContent = username;
}

function clearBoardSelection() {
    state.selectedBoardId = null;
    state.issues = [];
    elements["issue-board"].hidden = true;
    elements["board-empty"].hidden = state.boards.length > 0;
}

async function openOrganization(organizationId) {
    const result = await request(`/organization?organizationId=${encodeURIComponent(organizationId)}`);
    state.organization = result.organization;
    state.organizationId = organizationId;
    localStorage.setItem("tandemOrganizationId", organizationId);
    elements["join-id"].value = organizationId;

    const [membersResult, boardsResult] = await Promise.all([
        request(`/members?organizationId=${encodeURIComponent(organizationId)}`),
        request(`/boards?organizationId=${encodeURIComponent(organizationId)}`)
    ]);
    state.members = membersResult;
    state.boards = boardsResult.boards;
    const retainedBoard = state.boards.find(board => board.id === state.selectedBoardId);
    state.selectedBoardId = retainedBoard ? retainedBoard.id : state.boards[0]?.id || null;
    renderOrganization();

    if (state.selectedBoardId) await selectBoard(state.selectedBoardId);
    else clearBoardSelection();
}

function renderOrganization() {
    const organization = state.organization;
    const adminId = state.members.admin.id;
    const isAdmin = Boolean(state.userId && adminId === state.userId);
    elements["workspace-empty"].hidden = true;
    elements["board-workspace"].hidden = false;
    elements["workspace-title"].textContent = organization.title;
    elements["workspace-description"].textContent = organization.description || "A shared place for your team's work.";
    elements["organization-summary"].classList.remove("empty-summary");
    elements["organization-summary"].replaceChildren(
        makeElement("span", "org-avatar", organization.title.charAt(0).toUpperCase()),
        makeElement("div")
    );
    const summaryText = elements["organization-summary"].lastElementChild;
    summaryText.append(makeElement("strong", "", organization.title));
    summaryText.append(makeElement("small", "", isAdmin ? "You are the admin" : "Team organization"));
    elements["board-form"].hidden = !isAdmin;
    elements["member-form"].hidden = !isAdmin;
    elements["member-hint"].hidden = isAdmin;
    renderMembers(isAdmin);
    renderBoards();
}

function renderMembers(isAdmin) {
    const list = elements["member-list"];
    list.replaceChildren();
    const people = [{ ...state.members.admin, role: "Admin" }, ...state.members.members.map(member => ({ ...member, role: "" }))];
    elements["member-count"].textContent = String(people.length);
    for (const person of people) {
        const row = makeElement("li");
        const initial = makeElement("span", "member-avatar", person.username.charAt(0).toUpperCase());
        const name = makeElement("span", "", person.username);
        const role = makeElement("span", "member-role", person.role);
        row.append(initial, name, role);
        if (isAdmin && !person.role) {
            const remove = makeElement("button", "remove-member", "Remove");
            remove.type = "button";
            remove.setAttribute("aria-label", `Remove ${person.username}`);
            remove.addEventListener("click", async () => {
                remove.disabled = true;
                try {
                    await request("/members", {
                        method: "DELETE",
                        body: {
                            organizationId: state.organizationId,
                            username: person.username
                        }
                    });
                    await openOrganization(state.organizationId);
                    showToast(`${person.username} was removed from the organization.`);
                } catch (error) {
                    remove.disabled = false;
                    reportError(error);
                }
            });
            row.append(remove);
        }
        list.append(row);
    }
    if (!people.length) list.append(makeElement("li", "muted-list-item", "No members yet."));
    elements["member-hint"].textContent = isAdmin
        ? "Members can create issues and update their status."
        : "Only the organization admin can invite members.";
}

function renderBoards() {
    const tabs = elements["board-tabs"];
    tabs.replaceChildren();
    for (const board of state.boards) {
        const tab = makeElement("button", `board-tab${board.id === state.selectedBoardId ? " active" : ""}`, board.title);
        tab.type = "button";
        tab.setAttribute("role", "tab");
        tab.setAttribute("aria-selected", String(board.id === state.selectedBoardId));
        tab.addEventListener("click", () => selectBoard(board.id).catch(reportError));
        tabs.append(tab);
    }
    if (!state.boards.length) {
        elements["board-empty"].hidden = false;
        elements["issue-board"].hidden = true;
    } else {
        elements["board-empty"].hidden = true;
        if (!state.selectedBoardId) elements["issue-board"].hidden = true;
    }
}

async function selectBoard(boardId) {
    state.selectedBoardId = boardId;
    renderBoards();
    const board = state.boards.find(item => item.id === boardId);
    if (!board) return;
    const result = await request(`/issues?boardId=${encodeURIComponent(boardId)}`);
    state.issues = result.issues;
    elements["selected-board-title"].textContent = board.title;
    elements["issue-board"].hidden = false;
    renderIssues();
}

function renderIssues() {
    const columns = elements["issue-columns"];
    columns.replaceChildren();
    const definitions = [
        ["TODO", "To do"],
        ["IN_PROGRESS", "In progress"],
        ["DONE", "Done"]
    ];
    for (const [status, label] of definitions) {
        const column = makeElement("section", "issue-column");
        const heading = makeElement("div", "column-heading");
        heading.append(makeElement("span", "", label));
        heading.append(makeElement("span", "column-count", String(state.issues.filter(issue => issue.state === status).length)));
        column.append(heading);
        const matching = state.issues.filter(issue => issue.state === status);
        if (!matching.length) column.append(makeElement("p", "column-empty", "Nothing here yet"));
        for (const issue of matching) column.append(createIssueCard(issue));
        columns.append(column);
    }
}

function createIssueCard(issue) {
    const card = makeElement("article", "issue-card");
    card.append(makeElement("h3", "", issue.title));
    const footer = makeElement("div", "issue-card-footer");
    const date = makeElement("time", "", new Date(issue.createdAt).toLocaleDateString(undefined, {
        month: "short", day: "numeric"
    }));
    const status = document.createElement("select");
    status.setAttribute("aria-label", `Change status for ${issue.title}`);
    for (const [value, label] of [["TODO", "To do"], ["IN_PROGRESS", "In progress"], ["DONE", "Done"]]) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        option.selected = issue.state === value;
        status.append(option);
    }
    status.addEventListener("change", async () => {
        status.disabled = true;
        try {
            const result = await request("/issues", {
                method: "PUT",
                body: { issueId: issue.id, state: status.value }
            });
            state.issues = state.issues.map(item => item.id === result.issue.id ? result.issue : item);
            renderIssues();
            showToast("Issue status updated.");
        } catch (error) {
            status.disabled = false;
            reportError(error);
        }
    });
    footer.append(date, status);
    card.append(footer);
    return card;
}

elements["auth-switch"].addEventListener("click", () => {
    setAuthMode(state.authMode === "signin" ? "signup" : "signin");
});

elements["auth-form"].addEventListener("submit", async event => {
    event.preventDefault();
    const username = elements["auth-username"].value.trim();
    const password = elements["auth-password"].value;
    elements["auth-submit"].disabled = true;
    setAuthMessage("");
    try {
        if (state.authMode === "signup") {
            await request("/signup", { method: "POST", body: { username, password } });
            await signIn(username, password);
            showToast("Your account is ready. Welcome to Tandem!");
        } else {
            await signIn(username, password);
        }
        showWorkspace();
        if (state.organizationId) {
            try {
                await openOrganization(state.organizationId);
            } catch (error) {
                localStorage.removeItem("tandemOrganizationId");
                state.organizationId = null;
                state.organization = null;
                state.members = null;
                state.boards = [];
                elements["workspace-empty"].hidden = false;
                elements["board-workspace"].hidden = true;
                showToast(`Couldn't reopen your last organization: ${error.message}`, true);
            }
        } else {
            elements["workspace-empty"].hidden = false;
            elements["board-workspace"].hidden = true;
        }
    } catch (error) {
        reportError(error, "auth");
    } finally {
        elements["auth-submit"].disabled = false;
    }
});

elements["logout-button"].addEventListener("click", () => {
    localStorage.removeItem("tandemToken");
    localStorage.removeItem("tandemUsername");
    state.token = null;
    state.username = null;
    state.userId = null;
    state.organization = null;
    state.members = null;
    state.boards = [];
    state.selectedBoardId = null;
    showAuthentication();
    elements["auth-form"].reset();
    setAuthMode("signin");
});

elements["organization-form"].addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    try {
        const result = await request("/organization", {
            method: "POST",
            body: {
                title: elements["organization-title"].value.trim(),
                description: elements["organization-description"].value.trim()
            }
        });
        form.reset();
        form.closest("details").open = false;
        await openOrganization(result.id);
        showToast("Organization created. Copy its ID to invite teammates.");
    } catch (error) {
        reportError(error);
    } finally {
        button.disabled = false;
    }
});

elements["join-form"].addEventListener("submit", async event => {
    event.preventDefault();
    const organizationId = elements["join-id"].value.trim();
    try {
        await openOrganization(organizationId);
        showToast("Organization opened.");
    } catch (error) {
        reportError(error);
    }
});

elements["welcome-create"].addEventListener("click", () => {
    const details = document.querySelector(".create-org");
    details.open = true;
    elements["organization-title"].focus();
});

elements["member-form"].addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    try {
        await request("/add-member-to-organization", {
            method: "POST",
            body: {
                organizationId: state.organizationId,
                username: elements["member-username"].value.trim()
            }
        });
        form.reset();
        await openOrganization(state.organizationId);
        showToast("Member added to the organization.");
    } catch (error) {
        reportError(error);
    } finally {
        button.disabled = false;
    }
});

elements["board-form"].addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    try {
        const result = await request("/board", {
            method: "POST",
            body: {
                organizationId: state.organizationId,
                title: elements["board-title"].value.trim()
            }
        });
        state.boards.push(result.board);
        form.reset();
        await selectBoard(result.board.id);
        showToast("Board created.");
    } catch (error) {
        reportError(error);
    } finally {
        button.disabled = false;
    }
});

elements["issue-form"].addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    try {
        await request("/issue", {
            method: "POST",
            body: {
                boardId: state.selectedBoardId,
                title: elements["issue-title"].value.trim(),
                state: elements["issue-state"].value
            }
        });
        form.reset();
        await selectBoard(state.selectedBoardId);
        showToast("Issue added to the board.");
    } catch (error) {
        reportError(error);
    } finally {
        button.disabled = false;
    }
});

elements["copy-org-id"].addEventListener("click", async () => {
    try {
        await navigator.clipboard.writeText(state.organizationId);
        showToast("Organization ID copied to clipboard.");
    } catch {
        elements["join-id"].focus();
        elements["join-id"].select();
        showToast("Clipboard access is unavailable. The organization ID is selected in the field above; copy it manually.", true);
    }
});

elements["refresh-button"].addEventListener("click", async () => {
    if (!state.organizationId) return;
    try {
        await openOrganization(state.organizationId);
        showToast("Workspace refreshed.");
    } catch (error) {
        reportError(error);
    }
});

if (state.token) {
    state.userId = decodeUserId(state.token);
    showWorkspace();
    if (state.organizationId) {
        openOrganization(state.organizationId).catch(error => {
            reportError(error);
            if (!state.token) return;
            elements["workspace-empty"].hidden = false;
            elements["board-workspace"].hidden = true;
        });
    } else {
        elements["workspace-empty"].hidden = false;
        elements["board-workspace"].hidden = true;
    }
} else {
    setAuthMode("signin");
    showAuthentication();
}
