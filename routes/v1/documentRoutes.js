const express = require("express");
const documentController = require("../../controllers/v1/documentController");
const authorize = require("../../middleware/authorize");
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

module.exports = router;
