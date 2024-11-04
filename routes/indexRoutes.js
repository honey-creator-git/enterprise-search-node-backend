const express = require("express");
const indexController = require("../controllers/indexController");
const router = express.Router();

// Route to create a new index
router.post("/create-index", indexController.createIndex);

// Route to delete an index
router.delete("/delete-index/:indexName", indexController.deleteIndex);

// Route to list all indices
router.get("/list", indexController.listIndices);

// Route to update index settings
router.put("/update-settings/:indexName", indexController.updateIndexSettings);

module.exports = router;
