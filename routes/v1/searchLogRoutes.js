const express = require("express");
const documentController = require("../../controllers/v1/documentController");
const setRoleMiddleware = require("../../middleware/setRoleMiddleware");
const checkViewerAccess = require("../../middleware/checkViewerAccess");
const router = express.Router();

// Route for User Search Logs
router.post("/",
    setRoleMiddleware,
    checkViewerAccess,
    documentController.userSearchLogsBehavior
);

module.exports = router;