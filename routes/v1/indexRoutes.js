const express = require("express");
const indexController = require("../../controllers/v1/indexController");
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
  "/all",
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

module.exports = router;
