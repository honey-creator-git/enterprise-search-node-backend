const express = require("express");
const documentController = require("../../controllers/v1/documentController");
const setRoleMiddleware = require("../../middleware/setRoleMiddleware");
const checkAdminAccess = require("../../middleware/checkAdminAccess");
const checkViewerAccess = require("../../middleware/checkViewerAccess");
const router = express.Router();

// Route to retieve all documents from an index and store them in Azure Cognitive Search Service index
router.get(
  "/sync/:indexName",
  setRoleMiddleware,
  checkAdminAccess,
  documentController.syncElasticSearchAzureAiSearch
);

// Route to retrieve all documents across all indices with optional pagination (only accessible by admin)
router.get(
  "/",
  setRoleMiddleware,
  checkAdminAccess,
  documentController.getAllDocumentsAcrossIndices
);

// Route to search documents with keyword and advanced query support (accessible by all roles)
router.post(
  "/",
  setRoleMiddleware,
  checkViewerAccess,
  documentController.searchDocuments
);

module.exports = router;
