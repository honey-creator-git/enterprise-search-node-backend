const express = require("express");
const documentController = require("../../controllers/v1/documentController");
const setRoleMiddleware = require("../../middleware/setRoleMiddleware");
const checkAdminAccess = require("../../middleware/checkAdminAccess");
const checkViewerAccess = require("../../middleware/checkViewerAccess");
const router = express.Router();

router.post(
  "/",
  setRoleMiddleware,
  checkViewerAccess,
  documentController.decodeUserTokenAndSave
);

router.get(
  "/",
  setRoleMiddleware,
  checkAdminAccess,
  documentController.getAllUsersFromTenant
);

module.exports = router;
