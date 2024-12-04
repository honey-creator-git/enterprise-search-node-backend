const express = require("express");
const documentController = require("../../controllers/v1/documentController");
const setRoleMiddleware = require("../../middleware/setRoleMiddleware");
const checkAdminAccess = require("../../middleware/checkAdminAccess");
const router = express.Router();

router.post(
  "/sync-datasources",
  setRoleMiddleware,
  checkAdminAccess,
  documentController.syncDataFromDatasources
);

module.exports = router;
