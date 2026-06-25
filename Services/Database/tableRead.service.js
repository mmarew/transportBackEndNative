"use strict";



const {
  pool} = require("../../Middleware/Database.config");



























const getAllTables = async () => {
  const sqlQuery = `SHOW TABLES`;
  const [tables] = await pool.query(sqlQuery);
  return {
    message: "success",
    data: tables,
    numberOfTables: tables.length
  };
};

const getTableColumns = async tableName => {
  const sqlQuery = `SHOW COLUMNS FROM ${tableName}`;
  const [columns] = await pool.query(sqlQuery);
  return {
    message: "success",
    data: columns
  };
};

module.exports = {
  getAllTables,
  getTableColumns
};
