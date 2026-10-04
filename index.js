
const express = require("express");
const jwt = require("jsonwebtoken");
const { authMiddleware } = require("./middleware");

let USERS_ID = 1;
let ORGANIZATION_ID = 1;
let BOARD_ID = 1;
let ISSUES_ID = 1;

const USERS = [];

const ORGANIZATIONS = [];

const BOARDS = [];

const ISSUES = [];

const app = express();

app.use(express.json());


// ======================================================
// CREATE
// ======================================================


// ==================== SIGN UP ====================

app.post("/signup", (req, res) => {

    const username = req.body.username;
    const password = req.body.password;

    const userExists = USERS.find(
        user => user.username === username
    );

    if (userExists) {
        res.status(411).json({
            message: "user with this username already exists"
        });
        return;
    }

    const newUser = {
        id: USERS_ID++,
        username: username,
        password: password
    };

    USERS.push(newUser);

    res.json({
        message: "you have signed up successfully"
    });
});


// ==================== SIGN IN ====================

app.post("/signin", (req, res) => {

    const username = req.body.username;
    const password = req.body.password;

    const userExists = USERS.find(
        user =>
            user.username === username &&
            user.password === password
    );

    if (!userExists) {
        res.status(403).json({
            message: "Incorrect credentials"
        });
        return;
    }

    const token = jwt.sign(
        {
            userId: userExists.id
        },
        "atlassiansupersecretpassword123123"
    );

    res.json({
        token: token
    });
});


// ==================== CREATE ORGANIZATION ====================

app.post("/organization", authMiddleware, (req, res) => {

    const userId = req.userId;
    const title = req.body.title;
    const description = req.body.description;


    // Check if organization already exists

    const organizationExists = ORGANIZATIONS.find(
        org =>
            org.title.trim().toLowerCase() ===
            title.trim().toLowerCase()
    );

    if (organizationExists) {
        res.status(411).json({
            message: "organization already exists"
        });
        return;
    }


    // Create organization

    const newOrganization = {
        id: ORGANIZATION_ID++,
        title: title.trim(),
        description: description,
        admin: userId,
        members: []
    };

    ORGANIZATIONS.push(newOrganization);

    res.json({
        message: "org created",
        id: newOrganization.id
    });
});


// ==================== ADD MEMBER TO ORGANIZATION ====================

app.post(
    "/add-member-to-organization",
    authMiddleware,
    (req, res) => {

        const userId = req.userId;

        const organizationId = parseInt(
            req.body.organizationId
        );

        const memberUserUsername = req.body.username;


        // Find organization

        const organization = ORGANIZATIONS.find(
            org => org.id === organizationId
        );

        if (!organization || organization.admin !== userId) {
            res.status(411).json({
                message:
                    "either this org doesnt exist or you are not an admin of this org"
            });
            return;
        }


        // Find user

        const memberUser = USERS.find(
            user => user.username === memberUserUsername
        );

        if (!memberUser) {
            res.status(411).json({
                message:
                    "no user with this username exists in our db"
            });
            return;
        }


        // Check if already a member

        if (organization.members.includes(memberUser.id)) {
            res.status(411).json({
                message: "user is already a member of this organization"
            });
            return;
        }


        // Add member

        organization.members.push(memberUser.id);

        res.json({
            message: "new member added!"
        });
    }
);


// ==================== CREATE BOARD ====================

app.post("/board", authMiddleware, (req, res) => {

    const userId = req.userId;

    const organizationId = parseInt(
        req.body.organizationId
    );

    const title = req.body.title;


    // Find organization

    const organization = ORGANIZATIONS.find(
        org => org.id === organizationId
    );

    if (!organization) {
        res.status(411).json({
            message: "organization does not exist"
        });
        return;
    }


    // Only admin can create board

    if (organization.admin !== userId) {
        res.status(403).json({
            message: "only organization admin can create a board"
        });
        return;
    }


    const newBoard = {
        id: BOARD_ID++,
        title: title,
        organizationId: organizationId
    };

    BOARDS.push(newBoard);

    res.json({
        message: "board created successfully",
        board: newBoard
    });
});


// ==================== CREATE ISSUE ====================

app.post("/issue", authMiddleware, (req, res) => {

    const userId = req.userId;

    const boardId = parseInt(
        req.body.boardId
    );

    const title = req.body.title;

    const state = req.body.state || "TODO";


    // Find board

    const board = BOARDS.find(
        board => board.id === boardId
    );

    if (!board) {
        res.status(411).json({
            message: "board does not exist"
        });
        return;
    }


    // Find organization

    const organization = ORGANIZATIONS.find(
        org => org.id === board.organizationId
    );

    if (!organization) {
        res.status(411).json({
            message: "organization does not exist"
        });
        return;
    }


    // Check if user is admin or member

    const isMember =
        organization.admin === userId ||
        organization.members.includes(userId);

    if (!isMember) {
        res.status(403).json({
            message: "you are not a member of this organization"
        });
        return;
    }


    // Create issue

    const newIssue = {
        id: ISSUES_ID++,
        title: title,
        boardId: boardId,
        state: state
    };

    ISSUES.push(newIssue);

    res.json({
        message: "issue created successfully",
        issue: newIssue
    });
});


// ======================================================
// READ
// ======================================================


// ==================== GET ORGANIZATION ====================

app.get("/organization", authMiddleware, (req, res) => {

    const userId = req.userId;

    const organizationId = parseInt(
        req.query.organizationId
    );


    // Find organization

    const organization = ORGANIZATIONS.find(
        org => org.id === organizationId
    );

    if (!organization) {
        res.status(411).json({
            message: "organization does not exist"
        });
        return;
    }


    // Only admin can view organization

    if (organization.admin !== userId) {
        res.status(403).json({
            message:
                "either this org doesnt exist or you are not an admin of this org"
        });
        return;
    }


    res.json({
        organization: {
            ...organization,

            members: organization.members.map(memberId => {

                const user = USERS.find(
                    user => user.id === memberId
                );

                return {
                    id: user.id,
                    username: user.username
                };
            })
        }
    });
});


// ==================== GET BOARDS ====================

app.get("/boards", authMiddleware, (req, res) => {

    const userId = req.userId;

    const organizationId = parseInt(
        req.query.organizationId
    );


    const organization = ORGANIZATIONS.find(
        org => org.id === organizationId
    );

    if (!organization) {
        res.status(411).json({
            message: "organization does not exist"
        });
        return;
    }


    const isMember =
        organization.admin === userId ||
        organization.members.includes(userId);

    if (!isMember) {
        res.status(403).json({
            message:
                "you are not a member of this organization"
        });
        return;
    }


    const organizationBoards = BOARDS.filter(
        board => board.organizationId === organizationId
    );


    res.json({
        boards: organizationBoards
    });
});


// ==================== GET ISSUES ====================

app.get("/issues", authMiddleware, (req, res) => {

    const userId = req.userId;

    const boardId = parseInt(
        req.query.boardId
    );


    const board = BOARDS.find(
        board => board.id === boardId
    );

    if (!board) {
        res.status(411).json({
            message: "board does not exist"
        });
        return;
    }


    const organization = ORGANIZATIONS.find(
        org => org.id === board.organizationId
    );

    if (!organization) {
        res.status(411).json({
            message: "organization does not exist"
        });
        return;
    }


    const isMember =
        organization.admin === userId ||
        organization.members.includes(userId);

    if (!isMember) {
        res.status(403).json({
            message:
                "you are not a member of this organization"
        });
        return;
    }


    const boardIssues = ISSUES.filter(
        issue => issue.boardId === boardId
    );


    res.json({
        issues: boardIssues
    });
});


// ==================== GET MEMBERS ====================

app.get("/members", authMiddleware, (req, res) => {

    const userId = req.userId;

    const organizationId = parseInt(
        req.query.organizationId
    );


    const organization = ORGANIZATIONS.find(
        org => org.id === organizationId
    );

    if (!organization) {
        res.status(411).json({
            message: "organization does not exist"
        });
        return;
    }


    const isMember =
        organization.admin === userId ||
        organization.members.includes(userId);

    if (!isMember) {
        res.status(403).json({
            message:
                "you are not a member of this organization"
        });
        return;
    }


    const members = organization.members.map(
        memberId => {

            const user = USERS.find(
                user => user.id === memberId
            );

            return {
                id: user.id,
                username: user.username
            };
        }
    );


    const admin = USERS.find(
        user => user.id === organization.admin
    );


    res.json({
        admin: {
            id: admin.id,
            username: admin.username
        },

        members: members
    });
});


// ======================================================
// PUT
// ======================================================


// ==================== UPDATE ISSUE ====================

app.put("/issues", authMiddleware, (req, res) => {

    const userId = req.userId;

    const issueId = parseInt(
        req.body.issueId
    );

    const newState = req.body.state;


    const issue = ISSUES.find(
        issue => issue.id === issueId
    );

    if (!issue) {
        res.status(411).json({
            message: "issue does not exist"
        });
        return;
    }


    const board = BOARDS.find(
        board => board.id === issue.boardId
    );


    const organization = ORGANIZATIONS.find(
        org => org.id === board.organizationId
    );


    const isMember =
        organization.admin === userId ||
        organization.members.includes(userId);

    if (!isMember) {
        res.status(403).json({
            message:
                "you are not a member of this organization"
        });
        return;
    }


    issue.state = newState;


    res.json({
        message: "issue updated successfully",
        issue: issue
    });
});


// ======================================================
// DELETE
// ======================================================


// ==================== DELETE MEMBER ====================

app.delete(
    "/members",
    authMiddleware,
    (req, res) => {

        const userId = req.userId;

        const organizationId = parseInt(
            req.body.organizationId
        );

        const memberUserUsername = req.body.username;


        // Find organization

        const organization = ORGANIZATIONS.find(
            org => org.id === organizationId
        );

        if (!organization || organization.admin !== userId) {
            res.status(411).json({
                message:
                    "either this org doesnt exist or you are not an admin of this org"
            });
            return;
        }


        // Find user

        const memberUser = USERS.find(
            user => user.username === memberUserUsername
        );

        if (!memberUser) {
            res.status(411).json({
                message:
                    "no user with this username exists in our db"
            });
            return;
        }


        // Check if user is actually a member

        if (!organization.members.includes(memberUser.id)) {
            res.status(411).json({
                message:
                    "this user is not a member of this organization"
            });
            return;
        }


        // Remove member

        organization.members =
            organization.members.filter(
                memberId => memberId !== memberUser.id
            );


        res.json({
            message: "member deleted!"
        });
    }
);


// ======================================================
// SERVER
// ======================================================

app.listen(3000, () => {
    console.log("server is listening");
});