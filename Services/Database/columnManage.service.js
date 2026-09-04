"use strict";

const { pool } = require("../../Middleware/Database.config");

const changeColumnProperty = async (
  tableName,
  { oldColumnName, newColumnName, newColumnType },
) => {
  const sqlQuery = `ALTER TABLE ${tableName} CHANGE ${oldColumnName} ${newColumnName} ${newColumnType}`;
  await pool.query(sqlQuery);
  return {
    message: `Column ${oldColumnName} changed to ${newColumnName} with type ${newColumnType}`,
    data: null,
  };
};

const dropColumn = async (tableName, columnName) => {
  const sqlQuery = `ALTER TABLE ${tableName} DROP COLUMN ${columnName}`;
  await pool.query(sqlQuery);
  return {
    message: `Column ${columnName} dropped from table ${tableName}`,
    data: null,
  };
};

// DEV ONLY: add an index on an existing column (e.g. the FK target column).
// updateTable adds a column + optional FK but never an index, yet a MySQL FK
// requires an index on the FK column — so this fills that gap for dev DDL.
const addIndex = async (
  tableName,
  { indexName, columnName },
) => {
  const sqlQuery = `ALTER TABLE ${tableName} ADD INDEX \`${indexName}\` (\`${columnName}\`)`;
  await pool.query(sqlQuery);
  return {
    message: `Index ${indexName} added on ${tableName}.${columnName}`,
    data: null,
  };
};

// DEV ONLY: drop an index by name. Needed before dropping a column that the
// index supports, or to clean up a renamed index.
const dropIndex = async (
  tableName,
  { indexName },
) => {
  const sqlQuery = `ALTER TABLE ${tableName} DROP INDEX \`${indexName}\``;
  await pool.query(sqlQuery);
  return {
    message: `Index ${indexName} dropped from table ${tableName}`,
    data: null,
  };
};

// DEV ONLY: drop a foreign key constraint by name. A column referenced by an
// FK cannot be dropped until the FK is removed, so this must run before
// dropColumn when the column is the FK target.
const dropForeignKey = async (
  tableName,
  { constraintName },
) => {
  const sqlQuery = `ALTER TABLE ${tableName} DROP FOREIGN KEY \`${constraintName}\``;
  await pool.query(sqlQuery);
  return {
    message: `Foreign key ${constraintName} dropped from table ${tableName}`,
    data: null,
  };
};

// DEV ONLY: add a foreign key constraint on an existing column WITHOUT
// re-adding the column (unlike updateTable which does ADD COLUMN first).
// The FK column must already have an index, or MySQL errors
// "Missing index for constraint" — run addIndex first.
const addForeignKey = async (
  tableName,
  { constraintName, columnName, references } = {},
) => {
  const ref = references || {};
  const sqlQuery = `ALTER TABLE ${tableName}
    ADD CONSTRAINT \`${constraintName}\`
    FOREIGN KEY (\`${columnName}\`)
    REFERENCES \`${ref.table}\` (\`${ref.column}\`)`;
  await pool.query(sqlQuery);
  return {
    message: `Foreign key ${constraintName} added on ${tableName}.${columnName}`,
    data: null,
  };
};

module.exports = {
  changeColumnProperty,
  dropColumn,
  addIndex,
  dropIndex,
  dropForeignKey,
  addForeignKey,
};
