"use strict";


const {
  pool
} = require("../../Middleware/Database.config");


const AppError = require("../../Utils/AppError");
const {
  transactionStorage
} = require("../../Utils/TransactionContext");

// Helper function for database queries



const getCanceledJourneyCountsByDate = async (filters = {}) => {
  try {
    const {
      ownerUserUniqueId,
      toDate,
      fromDate,
      userFilters = {}
    } = filters;
    const {
      fullName,
      phone,
      email,
      search
    } = userFilters;

    // Build query conditions - use canceledTime for canceled journeys
    const queryWhereParts = ["1 = 1"]; // Always true to make building easier
    const queryParams = [];

    // Owner filter - check both shipper and driver
    if (ownerUserUniqueId && ownerUserUniqueId !== "all") {
      queryWhereParts.push(`
        (cj.driverUserUniqueId = ? OR cj.shipperUserUniqueId = ?)
      `);
      queryParams.push(ownerUserUniqueId, ownerUserUniqueId);
    }

    // Date range filter - use canceledTime
    if (fromDate && toDate) {
      queryWhereParts.push(`cj.canceledTime BETWEEN ? AND ?`);
      queryParams.push(`${fromDate} 00:00:00`, `${toDate} 23:59:59`);
    }

    // User-based filters
    if (fullName) {
      queryWhereParts.push(`(u_driver.fullName LIKE ? OR u_shipper.fullName LIKE ? OR u_canceled.fullName LIKE ?)`);
      queryParams.push(`%${fullName}%`, `%${fullName}%`, `%${fullName}%`);
    }
    if (phone) {
      queryWhereParts.push(`(u_driver.phoneNumber LIKE ? OR u_shipper.phoneNumber LIKE ? OR u_canceled.phoneNumber LIKE ?)`);
      queryParams.push(`%${phone}%`, `%${phone}%`, `%${phone}%`);
    }
    if (email) {
      queryWhereParts.push(`(u_driver.email LIKE ? OR u_shipper.email LIKE ? OR u_canceled.email LIKE ?)`);
      queryParams.push(`%${email}%`, `%${email}%`, `%${email}%`);
    }
    if (search) {
      queryWhereParts.push(`(
        u_driver.fullName LIKE ? OR 
        u_driver.phoneNumber LIKE ? OR 
        u_driver.email LIKE ? OR
        u_shipper.fullName LIKE ? OR
        u_shipper.phoneNumber LIKE ? OR 
        u_shipper.email LIKE ? OR
        u_canceled.fullName LIKE ? OR
        u_canceled.phoneNumber LIKE ? OR 
        u_canceled.email LIKE ? OR
        crt.cancellationReason LIKE ?
      )`);
      for (let i = 0; i < 10; i++) {
        queryParams.push(`%${search}%`);
      }
    }
    const whereClause = queryWhereParts.length > 0 ? ` WHERE ${queryWhereParts.join(" AND ")}` : "";

    // Use DATE_FORMAT with canceledTime
    const countSql = `
      SELECT 
        DATE_FORMAT(cj.canceledTime, '%Y-%m-%d') as canceledDate,
        COUNT(*) as totalCount
      FROM CanceledJourneys cj
      LEFT JOIN Users u_driver ON cj.driverUserUniqueId = u_driver.userUniqueId
      LEFT JOIN Users u_shipper ON cj.shipperUserUniqueId = u_shipper.userUniqueId
      LEFT JOIN Users u_canceled ON cj.canceledBy = u_canceled.userUniqueId
      LEFT JOIN CancellationReasonsType crt ON cj.cancellationReasonsTypeId = crt.cancellationReasonsTypeId
      ${whereClause}
      GROUP BY DATE_FORMAT(cj.canceledTime, '%Y-%m-%d')
      ORDER BY canceledDate
    `;
    const executor = transactionStorage.getStore() || pool;
    const [countRows] = await executor.query(countSql, queryParams);

    // Transform results into the desired format { date: count, ... }
    const dateCounts = {};
    countRows.forEach(row => {
      dateCounts[row.canceledDate] = row.totalCount;
    });
    return {
      message: "success",
      data: dateCounts,
      totalDates: countRows.length,
      dateRange: {
        fromDate,
        toDate
      }
    };
  } catch {
    throw new AppError("Failed to retrieve canceled journey counts", 500);
  }
};

const getCanceledJourneyCountsByReason = async (filters = {}) => {
  try {
    const {
      startDate,
      endDate,
      roleId,
      contextType,
      groupBy = "reason",
      // reason, role, or contextType
      includeEmptyReasons = false
    } = filters;

    // Build WHERE conditions
    const whereConditions = ["1 = 1"];
    const queryParams = [];

    // Date range filter
    if (startDate && endDate) {
      whereConditions.push("cj.canceledTime BETWEEN ? AND ?");
      queryParams.push(`${startDate} 00:00:00`, `${endDate} 23:59:59`);
    }

    // Role filter
    if (roleId) {
      whereConditions.push("cj.roleId = ?");
      queryParams.push(roleId);
    }

    // Context type filter
    if (contextType) {
      whereConditions.push("cj.contextType = ?");
      queryParams.push(contextType);
    }
    const whereClause = whereConditions.join(" AND ");

    // Determine grouping based on groupBy parameter
    let groupByClause, selectFields;
    switch (groupBy) {
    case "role":
      selectFields = `
          crt.cancellationReason,
          r.roleName as groupName,
          COUNT(*) as count
        `;
      groupByClause = "crt.cancellationReason, r.roleName";
      break;
    case "contextType":
      selectFields = `
          crt.cancellationReason,
          cj.contextType as groupName,
          COUNT(*) as count
        `;
      groupByClause = "crt.cancellationReason, cj.contextType";
      break;
    case "reason":
    default:
      selectFields = `
          crt.cancellationReason as reason,
          COUNT(*) as qty
        `;
      groupByClause = "crt.cancellationReason";
      break;
    }
    const sql = `
      SELECT 
        ${selectFields}
      FROM CanceledJourneys cj
      INNER JOIN CancellationReasonsType crt ON cj.cancellationReasonsTypeId = crt.cancellationReasonsTypeId
      LEFT JOIN Roles r ON cj.roleId = r.roleId
      WHERE ${whereClause}
      GROUP BY ${groupByClause}
      ORDER BY ${groupBy === "reason" ? "qty" : "count"} DESC
    `;
    const executor = transactionStorage.getStore() || pool;
    const [results] = await executor.query(sql, queryParams);

    // Transform results into array format
    let formattedData;
    let totalCanceled = 0;
    switch (groupBy) {
    case "role":
      // Group by role: array of { role: "Driver", reasons: [{reason: "...", qty: 10}, ...] }
      const rolesMap = {};
      results.forEach(row => {
        totalCanceled += row.count;
        if (!rolesMap[row.groupName]) {
          rolesMap[row.groupName] = {
            role: row.groupName,
            reasons: []
          };
        }
        rolesMap[row.groupName].reasons.push({
          reason: row.cancellationReason,
          qty: row.count
        });
      });
      formattedData = Object.values(rolesMap);
      break;
    case "contextType":
      // Group by context type: array of { contextType: "JourneyDecisions", reasons: [{reason: "...", qty: 10}, ...] }
      const contextMap = {};
      results.forEach(row => {
        totalCanceled += row.count;
        if (!contextMap[row.groupName]) {
          contextMap[row.groupName] = {
            contextType: row.groupName,
            reasons: []
          };
        }
        contextMap[row.groupName].reasons.push({
          reason: row.cancellationReason,
          qty: row.count
        });
      });
      formattedData = Object.values(contextMap);
      break;
    case "reason":
    default:
      // Simple array of { reason: "...", qty: 10 }
      formattedData = results.map(row => {
        totalCanceled += row.qty;
        return {
          reason: row.reason,
          qty: row.qty
        };
      });
      break;
    }

    // If includeEmptyReasons is true, get all reasons and include zeros
    if (includeEmptyReasons && groupBy === "reason") {
      const allReasonsSql = `
        SELECT cancellationReason 
        FROM CancellationReasonsType 
        WHERE roleId = ? OR ? IS NULL
      `;
      const [allReasons] = await executor.query(allReasonsSql, [roleId, roleId]);
      const existingReasons = new Set(formattedData.map(item => item.reason));
      allReasons.forEach(reasonRow => {
        const reason = reasonRow.cancellationReason;
        if (!existingReasons.has(reason)) {
          formattedData.push({
            reason: reason,
            qty: 0
          });
        }
      });

      // Re-sort after adding zero-count reasons
      formattedData.sort((a, b) => b.qty - a.qty);
    }
    return {
      message: "success",
      data: formattedData,
      summary: {
        totalCanceled,
        totalReasons: formattedData.length,
        dateRange: {
          startDate,
          endDate
        }
      },
      grouping: groupBy,
      filters: {
        startDate,
        endDate,
        roleId,
        contextType
      }
    };
  } catch {
    throw new AppError("Failed to retrieve canceled journey counts by reason", 500);
  }
};

module.exports = {
  getCanceledJourneyCountsByDate,
  getCanceledJourneyCountsByReason
};
