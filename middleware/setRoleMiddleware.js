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

    // console.log("Decoded Token => ", decodedToken);

    // Check if "groups" includes "Admin"
    const groups = decodedToken.groups || [];
    req.userRole = groups.includes("Admin") ? "Admin" : "Viewer";

    // Check if "permissions" includes "ESS"
    const permissions = decodedToken.permissions || [];
    req.userPermission = permissions.includes("ESS") ? "ESS" : "";

    // console.log("User Role => ", req.userRole);

    // console.log("User Permission => ", req.userPermission);

    next();
  } catch (error) {
    console.error("Error decoding token:", error);
    res.status(500).send("Internal server error");
  }
};

module.exports = setRoleMiddleware;
