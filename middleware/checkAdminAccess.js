const checkAdminAccess = (req, res, next) => {
  if (req.userRole !== "Admin") {
    return res.status(403).send("Access denied. Admins only.");
  }
  next();
};

module.exports = checkAdminAccess;
