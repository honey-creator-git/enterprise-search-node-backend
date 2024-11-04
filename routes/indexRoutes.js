const express = require("express");
const indexController = require("../controllers/indexController");
const authorize = require("../middleware/authorize");
const router = express.Router();

// Route to create a new index (only accessible by admin and manager)
router.post(
  "/create-index",
  authorize("createIndex"),
  indexController.createIndex
);

// Route to delete an index (only accessible by admin)
router.delete(
  "/delete-index/:indexName",
  authorize("deleteIndex"),
  indexController.deleteIndex
);

// Route to list all indices (accessible by all roles)
router.get("/list", authorize("listIndices"), indexController.listIndices);

// Route to update index settings (only accessible by admin and manager)
router.put(
  "/update-settings/:indexName",
  authorize("updateIndex"),
  indexController.updateIndexSettings
);

module.exports = router;
