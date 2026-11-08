const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");
const jwt = require("jsonwebtoken");
const { app } = require("../index");
const { userModel } = require("../models");

let server;
let baseUrl;

before(async () => {
    process.env.JWT_SECRET = "test-secret";
    server = app.listen(0);
    await new Promise(resolve => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
    await new Promise((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
    });
});

test("health reports when the local datastore is ready", async () => {
    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
        status: "ok",
        database: "ready"
    });
});

test("the browser app and its assets are served by the backend", async () => {
    const page = await fetch(`${baseUrl}/`);
    assert.equal(page.status, 200);
    assert.match(page.headers.get("content-type"), /text\/html/);
    assert.match(await page.text(), /Tandem/);

    const script = await fetch(`${baseUrl}/app.js`);
    assert.equal(script.status, 200);
    assert.match(script.headers.get("content-type"), /javascript/);
});

test("oversized JSON requests receive a payload-too-large response", async () => {
    const response = await fetch(`${baseUrl}/signup`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: "user", password: "x".repeat(100 * 1024) })
    });

    assert.equal(response.status, 413);
    assert.deepEqual(await response.json(), {
        message: "request body is too large"
    });
});

test("signup rejects missing fields and weak passwords", async () => {
    for (const body of [
        {},
        { username: "user", password: "short" },
        { username: "   ", password: "long-enough-password" }
    ]) {
        const response = await fetch(`${baseUrl}/signup`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body)
        });
        assert.equal(response.status, 400);
    }
});

test("signin rejects incomplete credentials without querying the datastore", async () => {
    const response = await fetch(`${baseUrl}/signin`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: "user" })
    });
    assert.equal(response.status, 400);
});

test("protected routes reject missing and invalid tokens", async () => {
    const missing = await fetch(`${baseUrl}/organization`, { method: "POST" });
    assert.equal(missing.status, 401);

    const invalid = await fetch(`${baseUrl}/organization`, {
        method: "POST",
        headers: { token: jwt.sign({ userId: "some-user" }, "wrong-secret") }
    });
    assert.equal(invalid.status, 401);
});

test("protected routes accept bearer authentication", async () => {
    const token = jwt.sign({ userId: "507f1f77bcf86cd799439011" }, process.env.JWT_SECRET);
    const response = await fetch(`${baseUrl}/organization`, {
        method: "POST",
        headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json"
        },
        body: JSON.stringify({})
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
        message: "a title and string description are required"
    });
});

test("legacy plaintext credentials are upgraded after successful signin", async () => {
    const originalFindOne = userModel.findOne;
    const user = {
        id: "507f1f77bcf86cd799439011",
        password: "legacy-password",
        async save() {}
    };
    userModel.findOne = () => ({
        select() {
            return this;
        },
        async collation() {
            return user;
        }
    });

    try {
        const response = await fetch(`${baseUrl}/signin`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ username: "legacy-user", password: user.password })
        });
        assert.equal(response.status, 200);
        assert.equal(typeof (await response.json()).token, "string");
        assert.match(user.passwordHash, /^[a-f\d]{32}:[a-f\d]{128}$/i);
        assert.equal(user.password, undefined);
    } finally {
        userModel.findOne = originalFindOne;
    }
});

test("users can create an organization, board, and issue using only the local datastore", async () => {
    const signup = await fetch(`${baseUrl}/signup`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: "workflow-user", password: "secure-password" })
    });
    assert.equal(signup.status, 201);

    const signin = await fetch(`${baseUrl}/signin`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: "workflow-user", password: "secure-password" })
    });
    assert.equal(signin.status, 200);
    const { token } = await signin.json();
    const headers = {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
    };

    const secondSignup = await fetch(`${baseUrl}/signup`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: "workflow-member", password: "member-password" })
    });
    assert.equal(secondSignup.status, 201);

    const organizationResponse = await fetch(`${baseUrl}/organization`, {
        method: "POST",
        headers,
        body: JSON.stringify({ title: "Workflow organization" })
    });
    assert.equal(organizationResponse.status, 201);
    const { id: organizationId } = await organizationResponse.json();

    const organizationDetails = await fetch(
        `${baseUrl}/organization?organizationId=${organizationId}`,
        { headers }
    );
    assert.equal(organizationDetails.status, 200);

    const addMemberResponse = await fetch(`${baseUrl}/add-member-to-organization`, {
        method: "POST",
        headers,
        body: JSON.stringify({ organizationId, username: "workflow-member" })
    });
    assert.equal(addMemberResponse.status, 200);

    const membersResponse = await fetch(
        `${baseUrl}/members?organizationId=${organizationId}`,
        { headers }
    );
    assert.equal(membersResponse.status, 200);
    assert.equal((await membersResponse.json()).members[0].username, "workflow-member");

    const boardResponse = await fetch(`${baseUrl}/board`, {
        method: "POST",
        headers,
        body: JSON.stringify({ organizationId, title: "Workflow board" })
    });
    assert.equal(boardResponse.status, 201);
    const { board } = await boardResponse.json();

    const issueResponse = await fetch(`${baseUrl}/issue`, {
        method: "POST",
        headers,
        body: JSON.stringify({ boardId: board.id, title: "Workflow issue" })
    });
    assert.equal(issueResponse.status, 201);
    const { issue } = await issueResponse.json();
    assert.equal(issue.state, "TODO");

    const inProgressResponse = await fetch(`${baseUrl}/issues`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ issueId: issue.id, state: "IN_PROGRESS" })
    });
    assert.equal(inProgressResponse.status, 200);
    assert.equal((await inProgressResponse.json()).issue.state, "IN_PROGRESS");

    const boardsResponse = await fetch(
        `${baseUrl}/boards?organizationId=${organizationId}`,
        { headers }
    );
    assert.equal(boardsResponse.status, 200);
    assert.equal((await boardsResponse.json()).boards.length, 1);

    const issuesResponse = await fetch(`${baseUrl}/issues?boardId=${board.id}`, { headers });
    assert.equal(issuesResponse.status, 200);
    assert.equal((await issuesResponse.json()).issues.length, 1);

    const updateResponse = await fetch(`${baseUrl}/issues`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ issueId: issue.id, state: "DONE" })
    });
    assert.equal(updateResponse.status, 200);
    assert.equal((await updateResponse.json()).issue.state, "DONE");

    const memberSignin = await fetch(`${baseUrl}/signin`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: "workflow-member", password: "member-password" })
    });
    const { token: memberToken } = await memberSignin.json();
    const memberHeaders = {
        authorization: `Bearer ${memberToken}`,
        "content-type": "application/json"
    };
    const memberIssueResponse = await fetch(`${baseUrl}/issue`, {
        method: "POST",
        headers: memberHeaders,
        body: JSON.stringify({ boardId: board.id, title: "Member issue" })
    });
    assert.equal(memberIssueResponse.status, 201);

    const removeMemberResponse = await fetch(`${baseUrl}/members`, {
        method: "DELETE",
        headers,
        body: JSON.stringify({ organizationId, username: "workflow-member" })
    });
    assert.equal(removeMemberResponse.status, 200);

    const memberAccessResponse = await fetch(
        `${baseUrl}/boards?organizationId=${organizationId}`,
        { headers: memberHeaders }
    );
    assert.equal(memberAccessResponse.status, 403);
});
