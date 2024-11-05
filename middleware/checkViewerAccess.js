const checkViewerAccess = (req, res, next) => {
  if (req.userRole !== "Viewer" && req.userRole !== "Admin") {
    return res.status(403).send("Access denied");
  }
  next();
};

module.exports = checkViewerAccess;
