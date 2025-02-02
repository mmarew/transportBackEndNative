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

// Route to create a new table
router.post("/api/admin/createTable", createTableController);

// Route to list all tables in the database
router.get("/api/admin/tables", getAllTablesController);

// Route to drop a table by name
router.delete("/api/admin/dropTable/:tableName", dropTableController);

// Route to drop all tables
router.delete("/api/admin/dropAllTables", dropAllTablesController);

// Route to update a table by adding a column
router.put("/api/admin/updateTable/:tableName", updateTableController);

// New: Route to change a column's properties
router.put("/api/admin/alterColumn/:tableName", changeColumnPropertyController);

// New: Route to drop a column
router.delete(
  "/api/admin/dropColumn/:tableName/:columnName",
  dropColumnController
);
// New: Route to get table columns
router.get("/tableColumns/:tableName", getTableColumnsController);
router.get(
  "/api/admin/installPreDefinedData",
  verifyTokenOfAxios,
  installPreDefinedDataController
);
module.exports = router;
