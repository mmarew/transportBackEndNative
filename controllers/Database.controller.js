const DatabaseService = require("../services/database.service");
const ServerResponder = require("../Utils/ServerResponder");

const createTableController = async (req, res) => {
  try {
    const response = await DatabaseService.createTable(req.body);
    ServerResponder(res, response);
  } catch (error) {
    ServerResponder(res, {
      message: "error",
      error: "Failed to create table",
    });
  }
};

const getAllTablesController = async (req, res) => {
  try {
    const response = await DatabaseService.getAllTables();
    ServerResponder(res, response);
  } catch (error) {
    ServerResponder(res, {
      message: "error",
      error: "Failed to retrieve tables",
    });
  }
};

const dropTableController = async (req, res) => {
  try {
    const response = await DatabaseService.dropTable(req.params.tableName);
    ServerResponder(res, response);
  } catch (error) {
    console.log("@dropTableController  error", error);
    ServerResponder(res, {
      message: "error",
      error: `Failed to drop table ${req.params.tableName}`,
    });
  }
};

const dropAllTablesController = async (req, res) => {
  try {
    const response = await DatabaseService.dropAllTables();
    ServerResponder(res, response);
  } catch (error) {
    ServerResponder(res, {
      message: "error",
      error: "Failed to drop all tables",
    });
  }
};

const updateTableController = async (req, res) => {
  try {
    const response = await DatabaseService.updateTable(
      req.params.tableName,
      req.body
    );
    ServerResponder(res, response);
  } catch (error) {
    ServerResponder(res, {
      message: "error",
      error: `Failed to update table ${req.params.tableName}`,
    });
  }
};

// New: Change a column's property (like data type, name, etc.)
const changeColumnPropertyController = async (req, res) => {
  try {
    const { tableName } = req.params;
    const response = await DatabaseService.changeColumnProperty(
      tableName,
      req.body
    );
    ServerResponder(res, response);
  } catch (error) {
    ServerResponder(res, {
      message: "error",
      error: `Failed to change column properties in table ${req.params.tableName}`,
    });
  }
};

// New: Drop a column from a table
const dropColumnController = async (req, res) => {
  try {
    const { tableName, columnName } = req.params;
    const response = await DatabaseService.dropColumn(tableName, columnName);
    ServerResponder(res, response);
  } catch (error) {
    ServerResponder(res, {
      message: "error",
      error: `Failed to drop column ${req.params.columnName} in table ${req.params.tableName}`,
    });
  }
};
const getTableColumnsController = async (req, res) => {
  try {
    const response = await DatabaseService.getTableColumns(
      req.params.tableName
    );
    ServerResponder(res, response);
  } catch (error) {
    ServerResponder(res, {
      message: "error",
      error: `Failed to retrieve columns for table ${req.params.tableName}`,
    });
  }
};
const installPreDefinedDataController = async (req, res) => {
  try {
    const user = req?.user;
    const response = await DatabaseService.installPreDefinedData(req, res);
    ServerResponder(res, response);
  } catch (error) {
    ServerResponder(res, {
      message: "error",
      error: "Failed to install pre-defined data",
    });
  }
};
module.exports = {
  installPreDefinedDataController,
  getTableColumnsController,
  createTableController,
  getAllTablesController,
  dropTableController,
  dropAllTablesController,
  updateTableController,
  changeColumnPropertyController, // New
  dropColumnController, // New
};
