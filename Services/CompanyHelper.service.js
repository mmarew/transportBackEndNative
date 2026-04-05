"use strict";

const AppError = require("../Utils/AppError");
const { transactionStorage } = require("../Utils/TransactionContext");
const { pool } = require("../Middleware/Database.config");

const db = () => transactionStorage.getStore() || pool;

async function findOne(table, conditions, errorMsg, errorCode = 404) {
  const keys = Object.keys(conditions);
  const where = keys.map((k) => `${k} = ?`).join(" AND ");
  const vals = keys.map((k) => conditions[k]);
  const [rows] = await db().query(
    `SELECT * FROM ${table} WHERE ${where} LIMIT 1`,
    vals,
  );
  if (!rows || rows.length === 0) throw new AppError(errorMsg, errorCode);
  return rows[0];
}

function paginate(filters) {
  const page = Math.max(1, Number(filters.page) || 1);
  const limit = Math.min(Math.max(1, Number(filters.limit) || 10), 100);
  return { page, limit, offset: (page - 1) * limit };
}

async function paginatedQuery(baseSql, countSql, params, page, limit, offset) {
  const executor = db();
  const [dataRows] = await executor.query(
    `${baseSql} LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  const [countRows] = await executor.query(countSql, params);
  const total = countRows?.[0]?.total || 0;
  if (!dataRows || dataRows.length === 0) throw new AppError("No records found", 404);
  return {
    message: "success",
    data: dataRows,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
  };
}

module.exports = {
  db,
  findOne,
  paginate,
  paginatedQuery,
};
