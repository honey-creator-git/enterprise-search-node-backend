const express = require("express");
const documentController = require("../../controllers/v1/documentController");
const setRoleMiddleware = require("../../middleware/setRoleMiddleware");
const checkViewerAccess = require("../../middleware/checkViewerAccess");
const router = express.Router();

router.get(
  "/",
  setRoleMiddleware,
  checkViewerAccess,
  documentController.getPopularDocuments
);

module.exports = router;
