const express = require("express");
const documentController = require("../../controllers/v1/documentController");
const setRoleMiddleware = require("../../middleware/setRoleMiddleware");
const checkAdminAccess = require("../../middleware/checkAdminAccess");
const router = express.Router();

router.post(
  "/",
  setRoleMiddleware,
  checkAdminAccess,
  documentController.syncGoogleDrive
);

router.post(
  "/webhook",
  documentController.googleDriveWebhook
);

router.post(
  "/register-webhook",
  setRoleMiddleware,
  checkAdminAccess,
  documentController.registerWebhook
);

module.exports = router;
