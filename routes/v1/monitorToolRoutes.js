const express = require("express");
const documentController = require("../../controllers/v1/documentController");
const router = express.Router();

router.get("/", documentController.monitorToolRoutes);

module.exports = router;
