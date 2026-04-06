"use strict";

const { db, paginate, paginatedQuery } = require("./CompanyHelper.service");

/**
 * Returns the list of availble dynamic company roles (owner, manager, etc.).
 *
 * @param {Object} [filters={}] - Query filters (page, limit)
 * @returns {Promise<Object>} Paginated list of roles with their Unique IDs
 */
exports.getRoles = async (filters = {}) => {
  const [roles] = await db().query(
    "SELECT * FROM CompanyRoles ORDER BY companyRoleName ASC"
  );
  return { message: "success", data: roles };
};
