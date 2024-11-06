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

// Route to search documents with keyword and advanced query support (accessible by all roles)
router.post(
  "/:indexName/search",
  setRoleMiddleware,
  checkViewerAccess,
  documentController.searchDocuments
);

// Route to get all documents from an index (accessible by all roles)
router.get(
  "/:indexName/get-all-documents",
  setRoleMiddleware,
  checkViewerAccess,
  documentController.getAllDocuments
);

// Route to retrieve all documents across all indices with optional pagination (only accessible by admin)
router.get(
  "/get-all-documents-across-indices",
  setRoleMiddleware,
  checkAdminAccess,
  documentController.getAllDocumentsAcrossIndices
);

// Route for NLP / Semantic Search
router.post(
  "/semantic/:indexName",
  setRoleMiddleware,
  checkViewerAccess,
  documentController.semanticSearch
);

module.exports = router;
