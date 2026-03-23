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

// Route to create all tables (no body required - creates all tables from predefined SQL)
router.post("/api/admin/createTable", createTableController);

// Route to list all tables in the database
router.get("/api/admin/tables", getAllTablesController);

// Route to drop a table by name
router.delete("/api/admin/dropTables", dropTableController);

// Route to drop all tables
router.delete("/api/admin/dropAllTables", dropAllTablesController);

// Route to update a table by adding a column
router.put(
  "/api/admin/updateTable/:tableName",
  validator(tableParams, "params"),
  // validator(updateTable), // optional body validation
  updateTableController,
);

// New: Route to change a column's properties
router.put(
  "/api/admin/alterColumn/:tableName",
  validator(tableParams, "params"),
  changeColumnPropertyController,
);

// New: Route to drop a column
router.delete(
  "/api/admin/dropColumn/:tableName/:columnName",
  validator(tableParams, "params"),
  dropColumnController,
);
// New: Route to get table columns
router.get(
  "/tableColumns/:tableName",
  validator(tableParams, "params"),
  getTableColumnsController,
);
router.get(
  "/api/admin/installPreDefinedData",
  verifyTokenOfAxios,
  validator(installDataQuery, "query"),
  installPreDefinedDataController,
);

// POST method for installing predefined data
router.post(
  "/api/admin/installPreDefinedData",
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
  router.get("/api/admin/dev/getUserOtp", devApiKeyMiddleware, getUserOtp);
  router.post("/api/admin/dev/seedTestDocument", devApiKeyMiddleware, seedTestDocument);
}

module.exports = router;
