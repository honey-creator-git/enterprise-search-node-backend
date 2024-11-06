const express = require("express");
const documentController = require("../../controllers/v1/documentController");
const authorize = require("../../middleware/authorize");
const setRoleMiddleware = require("../../middleware/setRoleMiddleware");
const checkAdminAccess = require("../../middleware/checkAdminAccess");
const checkViewerAccess = require("../../middleware/checkViewerAccess");
const router = express.Router();

// Route to add a new document to an index (accessible by admin, manager, and editor)
router.post(
  "/:indexName/add-document",
  setRoleMiddleware,
  checkAdminAccess,
  documentController.addDocument
);

// Route to retrieve a document by ID from an index (accessible by all roles)
router.get(
  "/:indexName/get-document/:documentId",
  setRoleMiddleware,
  checkViewerAccess,
  documentController.getDocument
);

// Route to update a document by ID from an index (accessible by admin, manager, and editor)
router.put(
  "/:indexName/update-document/:documentId",
  setRoleMiddleware,
  checkAdminAccess,
  documentController.updateDocument
);

// Route to delete a document by ID from an index (only accessible by admin and manager)
router.delete(
  "/:indexName/delete-document/:documentId",
  setRoleMiddleware,
  checkAdminAccess,
  documentController.deleteDocument
);

// Route to search documents with keyword and advanced query support (accessible by all roles)
router.post(
  "/:indexName/search",
  setRoleMiddleware,
  checkViewerAccess,
  documentController.searchDocuments
);

// Route to search documents across all indices (only accessible by admin)
router.post(
  "/search-all",
  setRoleMiddleware,
  checkAdminAccess,
  documentController.searchAllDocuments
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
