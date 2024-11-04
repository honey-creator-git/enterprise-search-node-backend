const express = require("express");
const documentController = require("../controllers/documentController");
const router = express.Router();

// Route to add a new document to an index
router.post("/:indexName/add-document", documentController.addDocument);

// Route to retrieve a document by ID from an index
router.get(
  "/:indexName/get-document/:documentId",
  documentController.getDocument
);

// Route to update a document by ID from an index
router.put(
  "/:indexName/update-document/:documentId",
  documentController.updateDocument
);

// Route to delete a document by ID from an index
router.delete(
  "/:indexName/delete-document/:documentId",
  documentController.deleteDocument
);

// Route to search documents with keyword and advanced query support
router.post("/:indexName/search", documentController.searchDocuments);

// Route to search documents across all indices
router.post("/search-all", documentController.searchAllDocuments);

// Route to get all documents from an index
router.get("/:indexName/get-all-documents", documentController.getAllDocuments);

// Route to retrieve all documents across all indices with optional pagination
router.get(
  "/get-all-documents-across-indices",
  documentController.getAllDocumentsAcrossIndices
);

module.exports = router;
