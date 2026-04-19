const databaseService = require("../Services/Database.service");
const ServerResponder = require("../Utils/ServerResponder");
const { executeInTransaction } = require("../Utils/DatabaseTransaction");

const createTableController = async (req, res, next) => {
  try {
    // NOTE: Do NOT wrap in executeInTransaction here.
    // executeInTransaction calls pool.getConnection() first, which requires
    // the database to already exist. createTable() creates the database itself
    // using its own dedicated connection before touching the pool.
    const result = await databaseService.createTable();
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const getAllTablesController = async (req, res, next) => {
  try {
    const response = await databaseService.getAllTables();
    ServerResponder(res, response);
  } catch (error) {
    next(error);
  }
};

const dropTableController = async (req, res, next) => {
  try {
    const tables = req.body.tables;
    if (!tables) {
      return res.status(400).json({ message: "Table name is required" });
    }
    const result = await executeInTransaction(async () => {
      return await databaseService.dropTable(tables);
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const dropAllTablesController = async (req, res, next) => {
  try {
    const result = await executeInTransaction(async () => {
      return await databaseService.dropAllTables();
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const updateTableController = async (req, res, next) => {
  try {
    const result = await executeInTransaction(async () => {
      return await databaseService.updateTable(req.params.tableName, req.body);
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const changeColumnPropertyController = async (req, res, next) => {
  try {
    const { tableName } = req.params;
    const result = await executeInTransaction(async () => {
      return await databaseService.changeColumnProperty(tableName, req.body);
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const dropColumnController = async (req, res, next) => {
  try {
    const { tableName, columnName } = req.params;
    const result = await executeInTransaction(async () => {
      return await databaseService.dropColumn(tableName, columnName);
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const getTableColumnsController = async (req, res, next) => {
  try {
    const response = await databaseService.getTableColumns(
      req.params.tableName,
    );
    ServerResponder(res, response);
  } catch (error) {
    next(error);
  }
};

const installPreDefinedDataController = async (req, res, next) => {
  try {
    // Seed data installs many records across multiple tables — extend timeout to 5 minutes.
    const result = await executeInTransaction(
      async () => {
        return await databaseService.installPreDefinedData(req);
      },
      { timeout: 300000 }, // 5 minutes
    );
    res.status(200).json(result);
  } catch (error) {
    next(error);
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
  changeColumnPropertyController,
  dropColumnController,
};
