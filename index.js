const crypto = require("crypto");
const { promisify } = require("util");
const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const { authMiddleware } = require("./middleware");
const {
    boardModel,
    connectDatabase,
    isDatabaseConnected,
    issueStates,
    issueModel,
    organizationModel,
    userModel
} = require("./models");

const scrypt = promisify(crypto.scrypt);
const app = express();

app.use(express.json({ limit: "100kb" }));

function isNonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0;
}

function isObjectId(value) {
    return typeof value === "string" && mongoose.isValidObjectId(value);
}

function isOrganizationMember(organization, userId) {
    return organization.admin.equals(userId) ||
        organization.members.some(memberId => memberId.equals(userId));
}

function isOrganizationAdmin(organization, userId) {
    return organization.admin.equals(userId);
}

function getJwtSecret() {
    if (!process.env.JWT_SECRET) {
        throw new Error("JWT_SECRET must be set before using authentication");
    }
    return process.env.JWT_SECRET;
}

async function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString("hex");
    const derivedKey = await scrypt(password, salt, 64);
    return `${salt}:${derivedKey.toString("hex")}`;
}

async function verifyPassword(password, passwordHash) {
    const [salt, storedKey] = passwordHash.split(":");
    if (!salt || !storedKey) {
        return false;
    }

    const derivedKey = await scrypt(password, salt, 64);
    const storedBuffer = Buffer.from(storedKey, "hex");
    return storedBuffer.length === derivedKey.length &&
        crypto.timingSafeEqual(storedBuffer, derivedKey);
}

function compareLegacyPassword(password, legacyPassword) {
    const supplied = Buffer.from(password);
    const stored = Buffer.from(legacyPassword);
    return supplied.length === stored.length && crypto.timingSafeEqual(supplied, stored);
}

function handleDuplicateKey(error, res) {
    if (error && error.code === 11000) {
        res.status(409).json({ message: "a record with these details already exists" });
        return true;
    }
    return false;
}

app.get("/health", (req, res) => {
    const connected = isDatabaseConnected();
    res.status(connected ? 200 : 503).json({
        status: connected ? "ok" : "unavailable",
        database: connected ? "ready" : "unavailable"
    });
});

app.post("/signup", async (req, res) => {
    const { username, password } = req.body || {};
    if (!isNonEmptyString(username) || !isNonEmptyString(password) || password.length < 8) {
        return res.status(400).json({
            message: "username and a password of at least 8 characters are required"
        });
    }

    const usernameExists = await userModel.findOne({
        username: username.trim().toLowerCase()
    }).collation({ locale: "en", strength: 2 });
    if (usernameExists) {
        return res.status(409).json({ message: "user with this username already exists" });
    }

    try {
        const user = await userModel.create({
            username: username.trim(),
            passwordHash: await hashPassword(password)
        });
        return res.status(201).json({
            id: user.id,
            message: "you have signed up successfully"
        });
    } catch (error) {
        if (handleDuplicateKey(error, res)) {
            return;
        }
        throw error;
    }
});

app.post("/signin", async (req, res) => {
    const { username, password } = req.body || {};
    if (!isNonEmptyString(username) || !isNonEmptyString(password)) {
        return res.status(400).json({ message: "username and password are required" });
    }

    const user = await userModel.findOne({
        username: username.trim().toLowerCase()
    }).select("+passwordHash +password").collation({ locale: "en", strength: 2 });

    if (!user) {
        return res.status(401).json({ message: "incorrect credentials" });
    }
    const passwordMatches = user.passwordHash
        ? await verifyPassword(password, user.passwordHash)
        : typeof user.password === "string" && compareLegacyPassword(password, user.password);
    if (!passwordMatches) {
        return res.status(401).json({ message: "incorrect credentials" });
    }

    if (!user.passwordHash || user.password) {
        user.passwordHash = await hashPassword(password);
        user.password = undefined;
        await user.save();
    }

    const token = jwt.sign(
        { userId: user.id },
        getJwtSecret(),
        { expiresIn: "1d" }
    );
    return res.json({ token });
});

app.post("/organization", authMiddleware, async (req, res) => {
    const { title, description = "" } = req.body || {};
    if (!isNonEmptyString(title) || typeof description !== "string") {
        return res.status(400).json({ message: "a title and string description are required" });
    }

    const duplicate = await organizationModel.findOne({
        title: title.trim()
    }).collation({ locale: "en", strength: 2 });
    if (duplicate) {
        return res.status(409).json({ message: "organization already exists" });
    }

    try {
        const organization = await organizationModel.create({
            title: title.trim(),
            description: description.trim(),
            admin: req.userId,
            members: []
        });
        return res.status(201).json({
            message: "organization created",
            id: organization.id,
            organization
        });
    } catch (error) {
        if (handleDuplicateKey(error, res)) {
            return;
        }
        throw error;
    }
});

app.post("/add-member-to-organization", authMiddleware, async (req, res) => {
    const { organizationId, username } = req.body || {};
    if (!isObjectId(organizationId) || !isNonEmptyString(username)) {
        return res.status(400).json({ message: "valid organizationId and username are required" });
    }

    const organization = await organizationModel.findById(organizationId);
    if (!organization) {
        return res.status(404).json({ message: "organization does not exist" });
    }
    if (!isOrganizationAdmin(organization, req.userId)) {
        return res.status(403).json({ message: "only the organization admin can manage members" });
    }

    const member = await userModel.findOne({ username: username.trim().toLowerCase() });
    if (!member) {
        return res.status(404).json({ message: "user does not exist" });
    }
    if (isOrganizationMember(organization, member.id)) {
        return res.status(409).json({ message: "user is already a member of this organization" });
    }

    organization.members.addToSet(member._id);
    await organization.save();
    return res.json({ message: "member added successfully" });
});

app.post("/board", authMiddleware, async (req, res) => {
    const { organizationId, title } = req.body || {};
    if (!isObjectId(organizationId) || !isNonEmptyString(title)) {
        return res.status(400).json({ message: "valid organizationId and title are required" });
    }

    const organization = await organizationModel.findById(organizationId);
    if (!organization) {
        return res.status(404).json({ message: "organization does not exist" });
    }
    if (!isOrganizationAdmin(organization, req.userId)) {
        return res.status(403).json({ message: "only the organization admin can create boards" });
    }

    const board = await boardModel.create({
        title: title.trim(),
        organization: organization._id
    });
    return res.status(201).json({
        message: "board created successfully",
        board
    });
});

app.post("/issue", authMiddleware, async (req, res) => {
    const { boardId, title, state = "TODO" } = req.body || {};
    if (!isObjectId(boardId) || !isNonEmptyString(title) || !issueStates.includes(state)) {
        return res.status(400).json({
            message: "valid boardId, title, and issue state (TODO, IN_PROGRESS, or DONE) are required"
        });
    }

    const board = await boardModel.findById(boardId);
    if (!board) {
        return res.status(404).json({ message: "board does not exist" });
    }
    const organization = await organizationModel.findById(board.organization);
    if (!organization) {
        return res.status(404).json({ message: "organization does not exist" });
    }
    if (!isOrganizationMember(organization, req.userId)) {
        return res.status(403).json({ message: "you are not a member of this organization" });
    }

    const issue = await issueModel.create({
        title: title.trim(),
        board: board._id,
        state,
        createdBy: req.userId
    });
    return res.status(201).json({
        message: "issue created successfully",
        issue
    });
});

app.get("/organization", authMiddleware, async (req, res) => {
    const organizationId = req.query.organizationId || (req.body && req.body.organizationId);
    if (!isObjectId(organizationId)) {
        return res.status(400).json({ message: "valid organizationId is required" });
    }

    const organization = await organizationModel.findById(organizationId);
    if (!organization) {
        return res.status(404).json({ message: "organization does not exist" });
    }
    if (!isOrganizationMember(organization, req.userId)) {
        return res.status(403).json({ message: "you are not a member of this organization" });
    }
    return res.json({ organization });
});

app.get("/boards", authMiddleware, async (req, res) => {
    const { organizationId } = req.query;
    if (!isObjectId(organizationId)) {
        return res.status(400).json({ message: "valid organizationId is required" });
    }

    const organization = await organizationModel.findById(organizationId);
    if (!organization) {
        return res.status(404).json({ message: "organization does not exist" });
    }
    if (!isOrganizationMember(organization, req.userId)) {
        return res.status(403).json({ message: "you are not a member of this organization" });
    }
    const boards = await boardModel.find({ organization: organization._id }).sort({ createdAt: 1 });
    return res.json({ boards });
});

app.get("/issues", authMiddleware, async (req, res) => {
    const { boardId } = req.query;
    if (!isObjectId(boardId)) {
        return res.status(400).json({ message: "valid boardId is required" });
    }

    const board = await boardModel.findById(boardId);
    if (!board) {
        return res.status(404).json({ message: "board does not exist" });
    }
    const organization = await organizationModel.findById(board.organization);
    if (!organization) {
        return res.status(404).json({ message: "organization does not exist" });
    }
    if (!isOrganizationMember(organization, req.userId)) {
        return res.status(403).json({ message: "you are not a member of this organization" });
    }

    const issues = await issueModel.find({ board: board._id }).sort({ createdAt: 1 });
    return res.json({ issues });
});

app.get("/members", authMiddleware, async (req, res) => {
    const { organizationId } = req.query;
    if (!isObjectId(organizationId)) {
        return res.status(400).json({ message: "valid organizationId is required" });
    }

    const organization = await organizationModel.findById(organizationId)
        .populate("admin", "username")
        .populate("members", "username");
    if (!organization) {
        return res.status(404).json({ message: "organization does not exist" });
    }
    if (!isOrganizationMember(organization, req.userId)) {
        return res.status(403).json({ message: "you are not a member of this organization" });
    }

    return res.json({
        admin: {
            id: organization.admin.id,
            username: organization.admin.username
        },
        members: organization.members.map(member => ({
            id: member.id,
            username: member.username
        }))
    });
});

app.put("/issues", authMiddleware, async (req, res) => {
    const { issueId, state } = req.body || {};
    if (!isObjectId(issueId) || !issueStates.includes(state)) {
        return res.status(400).json({ message: "valid issueId and issue state are required" });
    }

    const issue = await issueModel.findById(issueId);
    if (!issue) {
        return res.status(404).json({ message: "issue does not exist" });
    }
    const board = await boardModel.findById(issue.board);
    if (!board) {
        return res.status(404).json({ message: "board does not exist" });
    }
    const organization = await organizationModel.findById(board.organization);
    if (!organization) {
        return res.status(404).json({ message: "organization does not exist" });
    }
    if (!isOrganizationMember(organization, req.userId)) {
        return res.status(403).json({ message: "you are not a member of this organization" });
    }

    issue.state = state;
    await issue.save();
    return res.json({
        message: "issue updated successfully",
        issue
    });
});

app.delete("/members", authMiddleware, async (req, res) => {
    const { organizationId, username } = req.body || {};
    if (!isObjectId(organizationId) || !isNonEmptyString(username)) {
        return res.status(400).json({ message: "valid organizationId and username are required" });
    }

    const organization = await organizationModel.findById(organizationId);
    if (!organization) {
        return res.status(404).json({ message: "organization does not exist" });
    }
    if (!isOrganizationAdmin(organization, req.userId)) {
        return res.status(403).json({ message: "only the organization admin can manage members" });
    }

    const member = await userModel.findOne({ username: username.trim().toLowerCase() });
    if (!member || !organization.members.some(memberId => memberId.equals(member._id))) {
        return res.status(404).json({ message: "organization member does not exist" });
    }

    organization.members.pull(member._id);
    await organization.save();
    return res.json({ message: "member removed successfully" });
});

app.use((error, req, res, next) => {
    if (res.headersSent) {
        return next(error);
    }

    if (error.type === "entity.too.large") {
        return res.status(413).json({ message: "request body is too large" });
    }

    if (error instanceof mongoose.Error.ValidationError ||
        error instanceof mongoose.Error.CastError ||
        error instanceof SyntaxError && error.status === 400) {
        return res.status(400).json({ message: "invalid request" });
    }

    console.error(error);
    return res.status(500).json({ message: "internal server error" });
});

async function startServer() {
    getJwtSecret();
    await connectDatabase();
    const port = Number(process.env.PORT || 3000);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error("PORT must be a valid TCP port");
    }

    return app.listen(port, () => {
        console.log(`server is listening on port ${port}`);
    });
}

if (require.main === module) {
    startServer().catch(error => {
        console.error("Unable to start server:", error.message);
        process.exitCode = 1;
    });
}

module.exports = { app, startServer };
