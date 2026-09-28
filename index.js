const express = require('express');
const jwt = require("jsonwebtoken");

let USERS_ID = 1;
let ORGANIZATION_ID = 1;
let BOARD_ID = 1;
let ISSUES_ID = 1;

const USERS = [{
    id: 1,
    username: "chetana",
    password: "123123"
}];

const ORGANIZATION = [{
    id: 1,
    title: "100xdevs",
    description: "Learning coding platform",
    members: [2]
}];

const BOARDS = [{
    id: 1,
    title: "100xschool website (frontend)",
    organizationId: 1
}]

const ISSUES = [{
    id: 1,
    title: "Add dark mode",
    boardID: 1,
    state : "IN_PROGRESS"
}];

const app = express();
app.use(express.json());

//CREATE
app.post("/signup", (req ,res) => {
    const username = req.body.username;
    const password = req.body.password;

    const userExists = USERS.find(u => u.username === username);
    if(userExists){
        res.status(411).json({
            message: "user with this username already exists"
        })
        return;
    }

    USERS.push({
        username,
        password,
        id: USERS_ID++
    })

    res.json({
        message: "you have signed up successfully"
    })
})
app.post("/signin", (req ,res) => {
    const username = req.body.username;
    const password = req.body.password;

    const userExists = USERS.find(u => u.username === username && u.password === password);
    if(!userExists){
        res.status(403).json({
            message: "Incorrect credentials"
        })
    }
    const token = jwt.sign({
        user
    })


})
app.post("/organization", (req ,res) => {

})
app.post("/add-member-to-organization", (req ,res) => {

})
app.post("/board", (req ,res) => {

})
app.post("/issue", (req ,res) => {

})

//READ
app.get("/boards", (req ,res) => {

})
app.get("/issues", (req ,res) => {

})
app.get("/members", (req ,res) => {

})

//PUT
app.put("/issues", (req, res) => {

})

//DELETE
app.delete("/members", (req, res) => {

})


app.listen(3000);

