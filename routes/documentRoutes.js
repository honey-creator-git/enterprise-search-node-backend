const express = require("express");
const documentController = require("../controllers/documentController");
const authorize = require("../middleware/authorize");
const router = express.Router();

// Route to add a new document to an index (accessible by admin, manager, and editor)
router.post(
  "/:indexName/add-document",
  authorize("addDocument"),
  documentController.addDocument
);

// Route to retrieve a document by ID from an index (accessible by all roles)
router.get(
  "/:indexName/get-document/:documentId",
  authorize("getDocument"),
  documentController.getDocument
);

// Route to update a document by ID from an index (accessible by admin, manager, and editor)
router.put(
  "/:indexName/update-document/:documentId",
  authorize("updateDocument"),
  documentController.updateDocument
);

// Route to delete a document by ID from an index (only accessible by admin and manager)
router.delete(
  "/:indexName/delete-document/:documentId",
  authorize("deleteDocument"),
  documentController.deleteDocument
);

// Route to search documents with keyword and advanced query support (accessible by all roles)
router.post(
  "/:indexName/search",
  authorize("searchDocuments"),
  documentController.searchDocuments
);

// Route to search documents across all indices (only accessible by admin)
router.post(
  "/search-all",
  authorize("searchDocumentsAcrossAllIndices"),
  documentController.searchAllDocuments
);

// Route to get all documents from an index (accessible by all roles)
router.get(
  "/:indexName/get-all-documents",
  authorize("getAllDocumentFromIndex"),
  documentController.getAllDocuments
);

// Route to retrieve all documents across all indices with optional pagination (only accessible by admin)
router.get(
  "/get-all-documents-across-indices",
  authorize("getAllDocumentAcrossAllIndices"),
  documentController.getAllDocumentsAcrossIndices
);

module.exports = router;
