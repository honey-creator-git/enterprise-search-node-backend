const express = require("express");
const indexController = require("../../controllers/v1/indexController");
const documentController = require("../../controllers/v1/documentController");
const authorize = require("../../middleware/authorize");
const setRoleMiddleware = require("../../middleware/setRoleMiddleware");
const checkAdminAccess = require("../../middleware/checkAdminAccess");
const checkViewerAccess = require("../../middleware/checkViewerAccess");
const router = express.Router();

// Route to create a new index (only accessible by admin and manager)
router.post(
  "/",
  setRoleMiddleware,
  checkAdminAccess,
  indexController.createIndex
);

// Route to delete an index (only accessible by admin)
router.delete(
  "/:indexName",
  setRoleMiddleware,
  checkAdminAccess,
  indexController.deleteIndex
);

// Route to list all indices (accessible by all roles)
router.get(
  "/",
  setRoleMiddleware,
  checkViewerAccess,
  indexController.listIndices
);

// Route to update index settings (only accessible by admin and manager)
router.put(
  "/:indexName",
  setRoleMiddleware,
  checkAdminAccess,
  indexController.updateIndexSettings
);

router.get(
  "/:newIndex/:oldIndex",
  setRoleMiddleware,
  checkAdminAccess,
  indexController.reindexIndices
);

// Route to retrieve a document by ID from an index (accessible by all roles)
router.get(
  "/:indexName/document/:documentId",
  setRoleMiddleware,
  checkViewerAccess,
  documentController.getDocument
);

// Route to delete a document by ID from an index (only accessible by admin and manager)
router.delete(
  "/:indexName/document/:documentId",
  setRoleMiddleware,
  checkAdminAccess,
  documentController.deleteDocument
);

// Route to update a document by ID from an index (accessible by admin, manager, and editor)
router.put(
  "/:indexName/document/:documentId",
  setRoleMiddleware,
  checkAdminAccess,
  documentController.updateDocument
);

// Route to search documents across all indices (only accessible by admin)
router.post(
  "/search-all",
  setRoleMiddleware,
  checkAdminAccess,
  documentController.searchAllDocuments
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
  "/:indexName",
  setRoleMiddleware,
  checkViewerAccess,
  documentController.getAllDocuments
);

// Route to retrieve all documents across all indices with optional pagination (only accessible by admin)
router.get(
  "/",
  setRoleMiddleware,
  checkAdminAccess,
  documentController.getAllDocumentsAcrossIndices
);

// Route to add a new document to an index (accessible by admin, manager, and editor)
router.post(
  "/:indexName",
  setRoleMiddleware,
  checkAdminAccess,
  documentController.addDocument
);

module.exports = router;
