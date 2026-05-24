"use strict";



const {
  pool} = require("../../Middleware/Database.config");



























const changeColumnProperty = async (tableName, {
  oldColumnName,
  newColumnName,
  newColumnType
}) => {
  const sqlQuery = `ALTER TABLE ${tableName} CHANGE ${oldColumnName} ${newColumnName} ${newColumnType}`;
  await pool.query(sqlQuery);
  return {
    message: "success",
    data: `Column ${oldColumnName} changed to ${newColumnName} with type ${newColumnType}`
  };
};

const dropColumn = async (tableName, columnName) => {
  const sqlQuery = `ALTER TABLE ${tableName} DROP COLUMN ${columnName}`;
  await pool.query(sqlQuery);
  return {
    message: "success",
    data: `Column ${columnName} dropped from table ${tableName}`
  };
};

module.exports = {
  changeColumnProperty,
  dropColumn
};
