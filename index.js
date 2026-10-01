const express = require('express');
const jwt = require("jsonwebtoken");
const { authMiddleware } = require("./middleware");

let USERS_ID = 1;
let ORGANIZATION_ID = 1;
let BOARD_ID = 1;
let ISSUES_ID = 1;

const USERS = [];

const ORGANIZATIONS = [];

const BOARDS = [{
    id: 1,
    title: "100xschool website (frontend)",
    organizationId: 1
}];

const ISSUES = [{
    id: 1,
    title: "Add dark mode",
    boardID: 1,
    state: "IN_PROGRESS"
}];

const app = express();

app.use(express.json());


// ==================== CREATE ====================

// SIGN UP
app.post("/signup", (req, res) => {
    const username = req.body.username;
    const password = req.body.password;

    const userExists = USERS.find(u => u.username === username);

    if (userExists) {
        res.status(411).json({
            message: "user with this username already exists"
        });
        return;
    }

    USERS.push({
        username,
        password,
        id: USERS_ID++
    });

    res.json({
        message: "you have signed up successfully"
    });
});


// SIGN IN
app.post("/signin", (req, res) => {
    const username = req.body.username;
    const password = req.body.password;

    const userExists = USERS.find(u => u.username === username && u.password === password);

    if (!userExists) {
        res.status(403).json({
            message: "Incorrect credentials"
        });
        return;
    }

    const token = jwt.sign({
        userId: userExists.id
    }, "atlassiansupersecretpassword123123");

    res.json({
        token
    });
});


// CREATE ORGANIZATION
app.post("/organization", authMiddleware, (req, res) => {
    const userId = req.userId;

    ORGANIZATIONS.push({
        id: ORGANIZATION_ID++,
        title: req.body.title,
        description: req.body.description,
        admin: userId,
        members: []
    });

    res.json({
        message: "org created",
        id: ORGANIZATION_ID - 1
    });
});


// ADD MEMBER TO ORGANIZATION
app.post("/add-member-to-organization", authMiddleware, (req, res) => {
    const userId = req.userId;

    const organizationId = req.body.organizationId;
    const memberUserUsername = req.body.username;

    const organization = ORGANIZATIONS.find(
        org => org.id === organizationId
    );

    if (!organization || organization.admin !== userId) {
        res.status(411).json({
            message: "either this org doesnt exist or you are not an admin of this org"
        });
        return;
    }

    const memberUser = USERS.find(u => u.username === memberUserUsername);

    if (!memberUser) {
        res.status(411).json({
            message: "no user with this username exists in our db"
        });
        return;
    }

    organization.members.push(memberUser.id);

    res.json({
        message: "new member added!"
    });
});


// CREATE BOARD
app.post("/board", (req, res) => {

});


// CREATE ISSUE
app.post("/issue", (req, res) => {

});


// ==================== READ ====================

// GET BOARDS
app.get("/boards", (req, res) => {

});


// GET ISSUES
app.get("/issues", (req, res) => {

});


// GET MEMBERS
app.get("/members", (req, res) => {

});


// ==================== PUT ====================

// UPDATE ISSUE
app.put("/issues", (req, res) => {

});


// ==================== DELETE ====================

// DELETE MEMBER
app.delete("/members", (req, res) => {
    const userId = req.userId;

    const organizationId = req.body.organizationId;
    const memberUserUsername = req.body.username;

    const organization = ORGANIZATIONS.find(
        org => org.id === organizationId
    );

    if (!organization || organization.admin !== userId) {
        res.status(411).json({
            message: "either this org doesnt exist or you are not an admin of this org"
        });
        return;
    }

    const memberUser = USERS.find(u => u.username === memberUserUsername);

    if (!memberUser) {
        res.status(411).json({
            message: "no user with this username exists in our db"
        });
        return;
    }

    organization.members.push(memberUser.id);

    res.json({
        message: "new member added!"
    });
});


app.listen(3000, () => {
    console.log("server is listening");
});