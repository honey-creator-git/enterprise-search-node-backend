const express = require("express");
const documentController = require("../../controllers/v1/documentController");
const authorize = require("../../middleware/authorize");
const setRoleMiddleware = require("../../middleware/setRoleMiddleware");
const checkAdminAccess = require("../../middleware/checkAdminAccess");
const checkViewerAccess = require("../../middleware/checkViewerAccess");
const router = express.Router();

// Route for NLP / Semantic Search (accessible by all roles)
router.post(
  "/",
  setRoleMiddleware,
  checkViewerAccess,
  documentController.searchDocumentsFromAzureAIIndex
);

// Route to delete a document by ID from an index of Azure Cognitive Search
router.delete(
  "/",
  setRoleMiddleware,
  checkAdminAccess,
  documentController.deleteDocumentFromAzureSearch
);

// Route to update a document by ID from an index of Azure Cognitive Search
router.put(
  "/",
  setRoleMiddleware,
  checkAdminAccess,
  documentController.updateDocumentInAzureSearch
);

module.exports = router;
