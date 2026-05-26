const express = require("express");
const router = express.Router();
const {
  createTableController,
  getAllTablesController,
  dropTableController,
  dropAllTablesController,
  updateTableController,
  changeColumnPropertyController, // New
  dropColumnController,
  getTableColumnsController,
  installPreDefinedDataController, // New
} = require("../Controllers/Database.controller");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");
const { validator } = require("../Middleware/Validator");
const {
  tableParams,
  installDataQuery,
} = require("../Validations/Database.schema");
const { DATABASE_ENDPOINTS } = require("./EndPoints/database.endpoints");

// Route to create all tables (no body required - creates all tables from predefined SQL)
router.post(DATABASE_ENDPOINTS.CREATE_TABLE, createTableController);

// Route to list all tables in the database
router.get(DATABASE_ENDPOINTS.GET_ALL_TABLES, getAllTablesController);

// Route to drop a table by name
router.delete(DATABASE_ENDPOINTS.DROP_TABLES, dropTableController);

// Route to drop all tables
router.delete(DATABASE_ENDPOINTS.DROP_ALL_TABLES, dropAllTablesController);

// Route to update a table by adding a column
router.put(
  DATABASE_ENDPOINTS.UPDATE_TABLE,
  validator(tableParams, "params"),
  // validator(updateTable), // optional body validation
  updateTableController,
);

// New: Route to change a column's properties
router.put(
  DATABASE_ENDPOINTS.ALTER_COLUMN,
  validator(tableParams, "params"),
  changeColumnPropertyController,
);

// New: Route to drop a column
router.delete(
  DATABASE_ENDPOINTS.DROP_COLUMN,
  validator(tableParams, "params"),
  dropColumnController,
);
// New: Route to get table columns
router.get(
  DATABASE_ENDPOINTS.GET_TABLE_COLUMNS,
  validator(tableParams, "params"),
  getTableColumnsController,
);
router.get(
  DATABASE_ENDPOINTS.GET_INSTALL_PREDEFINED_DATA,
  verifyTokenOfAxios,
  validator(installDataQuery, "query"),
  installPreDefinedDataController,
);

// POST method for installing predefined data
router.post(
  DATABASE_ENDPOINTS.POST_INSTALL_PREDEFINED_DATA,
  verifyTokenOfAxios,
  validator(installDataQuery, "query"),
  installPreDefinedDataController,
);

// Database migration endpoints

const Config = require("../Utils/Config");

// DEV ONLY: Fetch OTP for a phone number (for automated testing without SMS)
if (Config.NODE_ENV !== "production") {
  const { getUserOtp, seedTestDocument } = require("../Controllers/DevTools.controller");
  const devApiKeyMiddleware = (req, res, next) => {
    const key = req.headers["x-api-key"] || req.query.apiKey;
    if (!key || key !== Config.API_KEY) {
      return res.status(401).json({ message: "error", error: "Unauthorized" });
    }
    next();
  };
  router.get(DATABASE_ENDPOINTS.GET_USER_OTP, devApiKeyMiddleware, getUserOtp);
  router.post(DATABASE_ENDPOINTS.SEED_TEST_DOCUMENT, devApiKeyMiddleware, seedTestDocument);
}

module.exports = router;
