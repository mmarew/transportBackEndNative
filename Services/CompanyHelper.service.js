"use strict";

const { transactionStorage } = require("../Utils/TransactionContext");
const { pool } = require("../Middleware/Database.config");

const db = () => transactionStorage.getStore() || pool;

function paginate(filters) {
  const page = Math.max(1, Number(filters.page) || 1);
  const defaultLimit = Number(filters.defaultLimit) || 10;
  const limit = Math.min(
    Math.max(1, Number(filters.limit) || defaultLimit),
    100,
  );
  return { page, limit, offset: (page - 1) * limit };
}

async function paginatedQuery(baseSql, countSql, params, page, limit, offset) {
  const executor = db();
  const [dataRows] = await executor.query(`${baseSql} LIMIT ? OFFSET ?`, [
    ...params,
    limit,
    offset,
  ]);
  const [countRows] = await executor.query(countSql, params);
  const dataRowsResult = dataRows || [];
  const total = countRows?.[0]?.total || 0;
  return {
    message: "Query results fetched",
    data: dataRowsResult,
    pagination: {
      currentPage: page,
      limit,
      totalItems: total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
}

module.exports = {
  db,
  paginate,
  paginatedQuery,
};
