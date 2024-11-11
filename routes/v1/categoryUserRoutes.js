const express = require("express");
const documentController = require("../../controllers/v1/documentController");
const setRoleMiddleware = require("../../middleware/setRoleMiddleware");
const checkAdminAccess = require("../../middleware/checkAdminAccess");
const router = express.Router();

// Route to get categories of a user
router.get(
  "/",
  setRoleMiddleware,
  checkAdminAccess,
  documentController.getUserCategories
);

module.exports = router;
