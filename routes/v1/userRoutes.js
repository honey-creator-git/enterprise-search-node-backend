const express = require("express");
const documentController = require("../../controllers/v1/documentController");
const setRoleMiddleware = require("../../middleware/setRoleMiddleware");
const checkAdminAccess = require("../../middleware/checkAdminAccess");
const router = express.Router();

router.post(
  "/",
  setRoleMiddleware,
  checkAdminAccess,
  documentController.decodeUserTokenAndSave
);

router.get(
    "/",
    setRoleMiddleware,
    checkAdminAccess,
    documentController.getAllUsersFromTenant
)

module.exports = router;
