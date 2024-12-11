const express = require("express");
const documentController = require("../../controllers/v1/documentController");
const setRoleMiddleware = require("../../middleware/setRoleMiddleware");
const checkAdminAccess = require("../../middleware/checkAdminAccess");
const router = express.Router();

router.post(
  "/",
  setRoleMiddleware,
  checkAdminAccess,
  documentController.syncOneDrive
);

router.post("/webhook", documentController.oneDriveWebhook);

// Handle GET request for webhook validation (sent by Microsoft Graph)
// router.get("/webhook", documentController.oneDriveWebhook);

module.exports = router;
