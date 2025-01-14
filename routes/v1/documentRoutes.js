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
// router.get(
//   "/",
//   setRoleMiddleware,
//   checkAdminAccess,
//   documentController.getAllDocumentsAcrossIndices
// );

// Route to search documents with keyword and advanced query support (accessible by all roles)
// router.post(
//   "/",
//   setRoleMiddleware,
//   checkViewerAccess,
//   documentController.searchDocuments
// );

// Route to update a document by ID from an index (accessible by admin)
// router.put(
//   "/",
//   setRoleMiddleware,
//   checkAdminAccess,
//   documentController.updateDocument
// );

// Route to retrieve a document by ID from an index (accessible by all roles)
// router.get(
//   "/",
//   setRoleMiddleware,
//   checkViewerAccess,
//   documentController.getDocument
// );

// Route to delete a document by ID from an index (only accessible by admin)
router.delete(
  "/:indexName",
  setRoleMiddleware,
  checkAdminAccess,
  documentController.deleteDocument
);

// Route to get documents with category ID
router.get(
  "/",
  setRoleMiddleware,
  checkAdminAccess,
  documentController.getDocumentsWithCategoryId
);

// Route to update a document by ID from an index of Azure Cognitive Search
router.put(
  "/",
  setRoleMiddleware,
  checkAdminAccess,
  documentController.updateDocumentInAzureSearch
);

// Route to delete a document by ID from an index of Azure Cognitive Search
router.delete(
  "/",
  setRoleMiddleware,
  checkAdminAccess,
  documentController.deleteDocumentFromAzureSearch
);

// Route to add a new document to the Azure Cognitive Search index
router.post(
  "/",
  setRoleMiddleware,
  checkAdminAccess,
  documentController.addNewDocumentWithCategoryId
);

// Route to get the details of a document with document id
router.get(
  "/:documentId",
  setRoleMiddleware,
  checkViewerAccess,
  documentController.getDocumentById
);

module.exports = router;
