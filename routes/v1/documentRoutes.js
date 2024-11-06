const express = require("express");
const documentController = require("../../controllers/v1/documentController");
const authorize = require("../../middleware/authorize");
const setRoleMiddleware = require("../../middleware/setRoleMiddleware");
const checkAdminAccess = require("../../middleware/checkAdminAccess");
const checkViewerAccess = require("../../middleware/checkViewerAccess");
const router = express.Router();

// Route to add a new document to an index (accessible by admin, manager, and editor)
router.post(
  "/:indexName",
  setRoleMiddleware,
  checkAdminAccess,
  documentController.addDocument
);

// Route for NLP / Semantic Search
router.post(
  "/semantic/:indexName",
  setRoleMiddleware,
  checkViewerAccess,
  documentController.semanticSearch
);

module.exports = router;
