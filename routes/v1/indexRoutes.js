const express = require("express");
const indexController = require("../../controllers/v1/indexController");
const documentController = require("../../controllers/v1/documentController");
const setRoleMiddleware = require("../../middleware/setRoleMiddleware");
const checkAdminAccess = require("../../middleware/checkAdminAccess");
const checkViewerAccess = require("../../middleware/checkViewerAccess");
const router = express.Router();

// Route to create a new index (only accessible by admin)
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

// Route to update index settings (only accessible by admin)
router.put(
  "/:indexName",
  setRoleMiddleware,
  checkAdminAccess,
  indexController.updateIndexSettings
);

// Route to update index settings (only accessible by admin)
router.get(
  "/:newIndex/:oldIndex",
  setRoleMiddleware,
  checkAdminAccess,
  indexController.reindexIndices
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
  "/:indexName",
  setRoleMiddleware,
  checkViewerAccess,
  documentController.getAllDocuments
);

// Route to add a new document to an index (accessible by admin, manager, and editor)
router.post(
  "/:indexName",
  setRoleMiddleware,
  checkAdminAccess,
  documentController.addDocument
);

module.exports = router;
