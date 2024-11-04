const roles = require("../roles");

// Middleware to check if a user has the required permission
function authorize(permission) {
  return (req, res, next) => {
    // Assuming `req.role' is set
    const userRole = req.body.role;

    // check if the role exists and has the required permission
    if (roles[userRole] && roles[userRole].can.includes(permission)) {
      return next();
    }

    // if the role does not have permission, respond with a 403 Forbidden
    return res
      .status(403)
      .json({
        error: "Forbidden: You do not have permission to perform this action",
      });
  };
}

module.exports = authorize;
