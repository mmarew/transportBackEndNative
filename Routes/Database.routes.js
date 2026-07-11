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
const AppError = require("../Utils/AppError");
const Config = require("../Utils/Config");

// Accept either a valid JWT (Bearer token) or the dev API key (x-api-key header).
// Useful for bootstrapping (createTable / dropAllTables) when no users exist yet.
const jwtOrApiKey = (req, res, next) => {
  const authHeader = req?.headers?.authorization;
  if (authHeader) {
    return verifyTokenOfAxios(req, res, next);
  }
  const apiKey = req.headers["x-api-key"];
  if (apiKey && apiKey === Config.API_KEY) {
    return next();
  }
  return next(new AppError("Authorization header missing", 401));
};

// Route to create all tables (no body required - creates all tables from predefined SQL)
// Accepts JWT or x-api-key so E2E tests can bootstrap without any users in the DB.
router.post(
  DATABASE_ENDPOINTS.CREATE_TABLE,
  jwtOrApiKey,
  createTableController,
);

// Route to list all tables in the database
router.get(
  DATABASE_ENDPOINTS.GET_ALL_TABLES,
  verifyTokenOfAxios,
  getAllTablesController,
);

// Route to drop a table by name
router.delete(
  DATABASE_ENDPOINTS.DROP_TABLES,
  verifyTokenOfAxios,
  dropTableController,
);

// Route to drop all tables (also accepts x-api-key for E2E bootstrapping)
router.delete(
  DATABASE_ENDPOINTS.DROP_ALL_TABLES,
  jwtOrApiKey,
  dropAllTablesController,
);

// Route to update a table by adding a column
router.put(
  DATABASE_ENDPOINTS.UPDATE_TABLE,
  verifyTokenOfAxios,
  validator(tableParams, "params"),
  // validator(updateTable), // optional body validation
  updateTableController,
);

// New: Route to change a column's properties
router.put(
  DATABASE_ENDPOINTS.ALTER_COLUMN,
  verifyTokenOfAxios,
  validator(tableParams, "params"),
  changeColumnPropertyController,
);

// New: Route to drop a column
router.delete(
  DATABASE_ENDPOINTS.DROP_COLUMN,
  verifyTokenOfAxios,
  validator(tableParams, "params"),
  dropColumnController,
);
// New: Route to get table columns
router.get(
  DATABASE_ENDPOINTS.GET_TABLE_COLUMNS,
  verifyTokenOfAxios,
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

// DEV ONLY: Fetch OTP for a phone number (for automated testing without SMS)
if (Config.NODE_ENV !== "production") {
  const {
    getUserOtp,
    seedTestDocument,
  } = require("../Controllers/DevTools.controller");
  const devApiKeyMiddleware = (req, res, next) => {
    const key = req.headers["x-api-key"] || req.query.apiKey;
    if (!key || key !== Config.API_KEY) {
      return res.status(401).json({ message: "error", error: "Unauthorized" });
    }
    next();
  };
  router.get(DATABASE_ENDPOINTS.GET_USER_OTP, devApiKeyMiddleware, getUserOtp);
  router.post(
    DATABASE_ENDPOINTS.SEED_TEST_DOCUMENT,
    devApiKeyMiddleware,
    seedTestDocument,
  );
}

module.exports = router;
