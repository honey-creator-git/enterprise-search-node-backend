const express = require("express");
const documentController = require("../../controllers/v1/documentController");
const authorize = require("../../middleware/authorize");
const setRoleMiddleware = require("../../middleware/setRoleMiddleware");
const checkAdminAccess = require("../../middleware/checkAdminAccess");
const checkViewerAccess = require("../../middleware/checkViewerAccess");
const router = express.Router();


// Route for NLP / Semantic Search
router.post(
  "/",
  setRoleMiddleware,
  checkViewerAccess,
  documentController.searchDocumentsFromAzureAIIndex
);

module.exports = router;
