const jwt = require("jsonwebtoken"); // Make sure to install this if you haven't: npm install jsonwebtoken

// Middleware to check and set role
const setRoleMiddleware = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  if (!authHeader) return res.status(401).send("Authorization header missing");

  const token = authHeader.split(" ")[1];

  try {
    // Decode the token (assuming no verification here since it's a third-party token without a secret)
    const decodedToken = jwt.decode(token);
    if (!decodedToken) return res.status(401).send("Invalid token");

    req.adminRole = decodedToken.groups.join(", ").includes("Admin")
      ? true
      : false;

    req.userId = decodedToken["uoid"]; // Get uoid from token
    req.coid = decodedToken["coid"]; // Get coid from token

    req.name = decodedToken["name"]; // Get name from token
    req.email = decodedToken["email"]; // Get email from token

    req.permissions = decodedToken["permissions"].join(", ");
    req.groups = decodedToken["groups"].join(", ");

    // Check if "groups" includes "Admin"
    const groups = decodedToken.groups || [];
    req.userRole = groups.includes("Admin") ? "Admin" : "Viewer";

    // Check if "permissions" includes "ESS"
    const permissions = decodedToken.permissions || [];
    req.userPermission = permissions.includes("ess::") ? "ESS" : "";

    next();
  } catch (error) {
    console.error("Error decoding token:", error);
    res.status(500).send("Internal server error");
  }
};

module.exports = setRoleMiddleware;