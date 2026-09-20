"use strict";

const { transactionStorage } = require("../Utils/TransactionContext");
const { pool } = require("../Middleware/Database.config");
const { PAGINATION } = require("../Utils/Constants");
const { companyRoles } = require("../Utils/ListOfSeedData");

const db = () => transactionStorage.getStore() || pool;

function paginate(filters) {
  const page = Math.max(1, Number(filters.page) || 1);
  const defaultLimit = Number(filters.defaultLimit) || PAGINATION.DEFAULT_PAGE_SIZE;
  const limit = Math.min(
    Math.max(1, Number(filters.limit) || defaultLimit),
    PAGINATION.MAX_PAGE_SIZE,
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

// The owner of a company is identified by its CompanyMembership row carrying
// the 'owner' CompanyRoles role. Returns the owner's userUniqueId, or null
// when no active owner membership exists (legacy companies — callers should
// fall back to TransportCompany.companyCreatedBy).
async function resolveOwnerUserUniqueId(companyUniqueId) {
  if (!companyUniqueId) return null;
  const [rows] = await db().query(
    `SELECT userUniqueId
     FROM CompanyMembership
     WHERE companyUniqueId = ?
       AND companyRoleUniqueId = ?
       AND isActive = 1
       AND membershipDeletedAt IS NULL
     ORDER BY membershipId ASC
     LIMIT 1`,
    [companyUniqueId, companyRoles.ownerUniqueId],
  );
  return rows?.[0]?.userUniqueId ?? null;
}

// Batch variant for list endpoints: returns { [companyUniqueId]: ownerUserUniqueId }.
async function resolveOwnerUserUniqueIds(companyUniqueIds) {
  const ids = [...new Set((companyUniqueIds || []).filter(Boolean))];
  if (ids.length === 0) return {};
  const placeholders = ids.map(() => "?").join(", ");
  const [rows] = await db().query(
    `SELECT cm.companyUniqueId, cm.userUniqueId
     FROM CompanyMembership cm
     JOIN (
       SELECT companyUniqueId, MIN(membershipId) AS firstId
       FROM CompanyMembership
       WHERE companyRoleUniqueId = ?
         AND isActive = 1
         AND membershipDeletedAt IS NULL
       GROUP BY companyUniqueId
     ) firstOwner ON firstOwner.companyUniqueId = cm.companyUniqueId
       AND firstOwner.firstId = cm.membershipId
     WHERE cm.companyUniqueId IN (${placeholders})`,
    [companyRoles.ownerUniqueId, ...ids],
  );
  return Object.fromEntries(rows.map((r) => [r.companyUniqueId, r.userUniqueId]));
}

module.exports = {
  db,
  paginate,
  paginatedQuery,
  resolveOwnerUserUniqueId,
  resolveOwnerUserUniqueIds,
};
