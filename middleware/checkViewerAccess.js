const checkViewerAccess = (req, res, next) => {
  if (req.userPermission !== "ESS" && req.userRole !== "Admin") {
    return res.status(403).send("Access denied");
  }
  next();
};

module.exports = checkViewerAccess;
