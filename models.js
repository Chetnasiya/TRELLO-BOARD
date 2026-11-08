const mongoose = require("mongoose");
const issueStates = ["TODO", "IN_PROGRESS", "DONE"];

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
        unique: true,
        minlength: 1
    },
    passwordHash: {
        type: String,
        required: true,
        select: false
    },
    password: {
        type: String,
        select: false
    }
}, { timestamps: true });

const organizationSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true,
        unique: true,
        minlength: 1
    },
    description: {
        type: String,
        default: ""
    },
    admin: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    members: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    }]
}, { timestamps: true });

const boardSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true,
        minlength: 1
    },
    organization: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Organization",
        required: true
    }
}, { timestamps: true });

const issueSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true,
        minlength: 1
    },
    board: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Board",
        required: true
    },
    state: {
        type: String,
        enum: issueStates,
        default: "TODO"
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    }
}, { timestamps: true });

const mongoModels = {
    User: mongoose.models.User || mongoose.model("User", userSchema),
    Organization: mongoose.models.Organization || mongoose.model("Organization", organizationSchema),
    Board: mongoose.models.Board || mongoose.model("Board", boardSchema),
    Issue: mongoose.models.Issue || mongoose.model("Issue", issueSchema)
};

const memoryCollections = {
    User: [],
    Organization: [],
    Board: [],
    Issue: []
};

let memoryMode = !process.env.MONGODB_URI;

function referenceId(value) {
    return value && typeof value === "object" && value._id ? value._id : value;
}

function sameId(left, right) {
    const leftId = referenceId(left);
    const rightId = referenceId(right);
    return leftId != null && rightId != null &&
        String(leftId).toLowerCase() === String(rightId).toLowerCase();
}

function castId(value) {
    return value == null ? value : new mongoose.Types.ObjectId(String(referenceId(value)));
}

class MemoryDocument {
    constructor(modelName, values) {
        Object.defineProperty(this, "_modelName", {
            value: modelName,
            enumerable: false
        });
        Object.assign(this, values);
    }

    get id() {
        return String(this._id);
    }

    equals(value) {
        return sameId(this, value);
    }

    async save() {
        const collection = memoryCollections[this._modelName];
        this.updatedAt = new Date();
        const index = collection.findIndex(item => sameId(item, this._id));
        if (index === -1) {
            collection.push(this);
        } else {
            collection[index] = this;
        }
        return this;
    }

    toJSON() {
        const result = {};
        for (const [key, value] of Object.entries(this)) {
            if (value !== undefined) {
                result[key] = value;
            }
        }
        result.id = this.id;
        return result;
    }
}

function decorateMembers(memberIds) {
    const members = memberIds;
    members.addToSet = function (member) {
        if (!this.some(existing => sameId(existing, member))) {
            this.push(member);
        }
    };
    members.pull = function (member) {
        const index = this.findIndex(existing => sameId(existing, member));
        if (index !== -1) {
            this.splice(index, 1);
        }
    };
    return members;
}

function asDocument(modelName, values) {
    const document = new MemoryDocument(modelName, values);
    if (modelName === "Organization") {
        document.members = decorateMembers(
            Array.isArray(document.members) ? document.members : []
        );
    }
    return document;
}

function matchesFilter(document, filter) {
    return Object.entries(filter).every(([key, expected]) => {
        const actual = document[key];
        if (key === "_id" || key === "admin" || key === "organization" || key === "board") {
            return sameId(actual, expected);
        }
        if (typeof actual === "string" && typeof expected === "string") {
            return actual.toLowerCase() === expected.toLowerCase();
        }
        return actual === expected;
    });
}

class MemoryQuery {
    constructor(modelName, resolver) {
        this.modelName = modelName;
        this.resolver = resolver;
        this.sortOptions = null;
        this.populates = [];
    }

    select() {
        return this;
    }

    collation() {
        return this;
    }

    sort(options) {
        this.sortOptions = options;
        return this;
    }

    populate(path, fields) {
        this.populates.push({ path, fields });
        return this;
    }

    async execute() {
        let result = this.resolver();
        if (Array.isArray(result) && this.sortOptions) {
            const [key, direction] = Object.entries(this.sortOptions)[0] || [];
            if (key) {
                result = result.sort((left, right) =>
                    (new Date(left[key]) - new Date(right[key])) * direction
                );
            }
        }

        if (this.populates.length && result) {
            const documents = Array.isArray(result) ? result : [result];
            for (const document of documents) {
                for (const { path } of this.populates) {
                    if (path === "admin") {
                        document.admin = memoryCollections.User.find(user =>
                            sameId(user, document.admin)
                        ) || document.admin;
                    } else if (path === "members") {
                        document.members = decorateMembers(document.members.map(memberId =>
                            memoryCollections.User.find(user => sameId(user, memberId)) || memberId
                        ));
                    }
                }
            }
        }

        return result;
    }

    then(resolve, reject) {
        return this.execute().then(resolve, reject);
    }

    catch(reject) {
        return this.execute().catch(reject);
    }

    finally(callback) {
        return this.execute().finally(callback);
    }
}

function createMemoryModel(modelName) {
    const collection = memoryCollections[modelName];

    return {
        async create(values) {
            if (modelName === "User" || modelName === "Organization") {
                const uniqueKey = modelName === "User" ? "username" : "title";
                if (collection.some(document =>
                    document[uniqueKey].toLowerCase() === values[uniqueKey].toLowerCase()
                )) {
                    const error = new Error("duplicate key");
                    error.code = 11000;
                    throw error;
                }
            }

            const now = new Date();
            const document = asDocument(modelName, {
                ...values,
                ...(modelName === "Organization"
                    ? {
                        admin: castId(values.admin),
                        members: (values.members || []).map(castId)
                    }
                    : {}),
                ...(modelName === "Board" ? { organization: castId(values.organization) } : {}),
                ...(modelName === "Issue"
                    ? {
                        board: castId(values.board),
                        createdBy: castId(values.createdBy)
                    }
                    : {}),
                ...(modelName === "User" && values.username
                    ? { username: values.username.trim().toLowerCase() }
                    : {}),
                ...(modelName === "Organization"
                    ? { description: values.description || "", members: values.members || [] }
                    : {}),
                ...(modelName === "Issue" && !values.state ? { state: "TODO" } : {}),
                _id: new mongoose.Types.ObjectId(),
                createdAt: now,
                updatedAt: now
            });
            collection.push(document);
            return document;
        },

        findOne(filter) {
            return new MemoryQuery(modelName, () =>
                collection.find(document => matchesFilter(document, filter)) || null
            );
        },

        findById(id) {
            return new MemoryQuery(modelName, () =>
                collection.find(document => sameId(document, id)) || null
            );
        },

        find(filter = {}) {
            return new MemoryQuery(modelName, () =>
                collection.filter(document => matchesFilter(document, filter))
            );
        }
    };
}

const memoryModels = {
    User: createMemoryModel("User"),
    Organization: createMemoryModel("Organization"),
    Board: createMemoryModel("Board"),
    Issue: createMemoryModel("Issue")
};

const activeModels = Object.fromEntries(
    Object.keys(mongoModels).map(name => [name, new Proxy({}, {
        get(_target, property) {
            const model = memoryMode ? memoryModels[name] : mongoModels[name];
            const value = model[property];
            return typeof value === "function" ? value.bind(model) : value;
        },
        set(_target, property, value) {
            const model = memoryMode ? memoryModels[name] : mongoModels[name];
            model[property] = value;
            return true;
        }
    })])
);

async function connectDatabase(uri = process.env.MONGODB_URI) {
    if (uri) {
        memoryMode = false;
        await mongoose.connect(uri);
        console.log("MongoDB connected");
        return;
    }

    memoryMode = true;
    console.log("Using in-memory datastore (data resets when the server stops)");
}

function isDatabaseConnected() {
    return memoryMode || mongoose.connection.readyState === 1;
}

module.exports = {
    connectDatabase,
    isDatabaseConnected,
    issueStates,
    userModel: activeModels.User,
    organizationModel: activeModels.Organization,
    boardModel: activeModels.Board,
    issueModel: activeModels.Issue
};
