const dns = require("dns");
dns.setServers(["8.8.8.8", "1.1.1.1"]);

const mongoose = require("mongoose");
mongoose.connect("mongodb+srv://siyachetana:siyachetana@cluster0.nagl3bg.mongodb.net/trello")
    .then(() => {
        console.log("MongoDB connected");
    })
    .catch((err) => {
        console.log(err);
    });

//schemas and models

const userSchema = mongoose.Schema({
    username: String,
    password: String
})

const organizationSchema = mongoose.Schema({
    title: String,
    description: String,
    admin: mongoose.Types.ObjectId,
    members: [mongoose.Types.ObjectId]
})

const organizationModel = mongoose.model("organizations", organizationSchema);
const userModel = mongoose.model("users", userSchema);

module.exports = {
    organizationModel,
    userModel
}