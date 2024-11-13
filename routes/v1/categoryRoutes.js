const express = require("express");
const documentController = require("../../controllers/v1/documentController");
const indexController = require("../../controllers/v1/indexController");
const setRoleMiddleware = require("../../middleware/setRoleMiddleware");
const checkAdminAccess = require("../../middleware/checkAdminAccess");
const router = express.Router();

// Route to retrieve all categories with tenant id
router.get(
  "/",
  setRoleMiddleware,
  checkAdminAccess,
  documentController.getAllCategoriesForTenant
);

// Route to update category-user index with userId
router.put(
  "/",
  setRoleMiddleware,
  checkAdminAccess,
  indexController.updateCategoryUser
);

// Route to add new category
router.post(
  "/",
  setRoleMiddleware,
  checkAdminAccess,
  indexController.createNewCategory
);

// Route to update category with categoryId
router.put(
  "/:categoryId",
  setRoleMiddleware,
  checkAdminAccess,
  indexController.updateCategory
);

// Route to delete a category with id
router.delete(
  "/:categoryId",
  setRoleMiddleware,
  checkAdminAccess,
  indexController.deleteCategory
);

module.exports = router;
