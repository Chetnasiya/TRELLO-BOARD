const jwt = require("jsonwebtoken");
const crypto = require("crypto");

if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = crypto.randomBytes(64).toString("hex");
    console.warn("JWT_SECRET was not set; using a temporary secret for this run");
}

function authMiddleware(req, res, next) {
    const authorization = req.get("authorization");
    const token = authorization && authorization.startsWith("Bearer ")
        ? authorization.slice(7)
        : req.get("token");

    if (!token) {
        return res.status(401).json({ message: "authentication required" });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (typeof decoded !== "object" ||
            typeof decoded.userId !== "string" ||
            !/^[a-f\d]{24}$/i.test(decoded.userId)) {
            return res.status(401).json({ message: "invalid authentication token" });
        }

        req.userId = decoded.userId;
        return next();
    } catch (error) {
        if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) {
            return res.status(401).json({ message: "invalid or expired authentication token" });
        }
        return next(error);
    }
}

module.exports = {
    authMiddleware
};