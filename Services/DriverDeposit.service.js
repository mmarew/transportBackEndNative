const { pool } = require("../Middleware/Database.config");
const { v4: uuidv4 } = require("uuid");
const {
  prepareAndCreateNewBalance,
} = require("./DriverBalance.service/DriverBalance.post.service");
const { sendSocketIONotificationToAdmin } = require("../Utils/Notifications");
const {
  deleteDriverBalance,
} = require("./DriverBalance.service/DriverBalance.delete.service");
const { getData } = require("../CRUD/Read/ReadData");

// Create
const createDriverDeposit = async (data) => {
  console.log("@createDriverDeposit data", data);
  // return;
  const driverDepositUniqueId = uuidv4();
  const {
    driverUniqueId,
    depositAmount,
    depositSourceUniqueId,
    accountUniqueId,
    depositTime,
    depositURL,
  } = data;

  // Check if required fields are provided
  if (
    !driverUniqueId ||
    !depositAmount ||
    !depositSourceUniqueId ||
    !accountUniqueId ||
    !depositTime
  ) {
    return {
      message: "error",
      error: "Missing required fields to create deposit",
    };
  }
  // Validate depositAmount
  if (isNaN(depositAmount) || depositAmount <= 0) {
    return { message: "error", error: "Invalid deposit amount" };
  }
  // Validate depositTime
  if (isNaN(new Date(depositTime).getTime())) {
    return { message: "error", error: "Invalid deposit time" };
  }
  // Validate depositURL
  if (depositURL && typeof depositURL !== "string") {
    return { message: "error", error: "Invalid deposit URL" };
  }
  // Validate driverUniqueId
  if (typeof driverUniqueId !== "string" || driverUniqueId.length === 0) {
    return { message: "error", error: "Invalid driver unique ID" };
  }
  // Validate depositSourceUniqueId
  if (
    typeof depositSourceUniqueId !== "string" ||
    depositSourceUniqueId.length === 0
  ) {
    return { message: "error", error: "Invalid deposit source unique ID" };
  }
  // Validate accountUniqueId
  if (typeof accountUniqueId !== "string" || accountUniqueId.length === 0) {
    return { message: "error", error: "Invalid account unique ID" };
  }
  // check if depositURL existed before
  const existedURL = await getData({
    tableName: "DriverDeposit",
    conditions: {
      depositURL: depositURL,
    },
  });
  if (existedURL?.length > 0)
    return { message: "error", error: "Deposit URL already exists" };
  // Prepare SQL query
  const sql = `
    INSERT INTO DriverDeposit (
      driverDepositUniqueId,
      driverUniqueId,
      depositAmount,
      depositSourceUniqueId,
      accountUniqueId,
      depositTime,depositURL
    ) VALUES (?, ?, ?, ?, ?, ?,?)
  `;
  try {
    const [insertResult] = await pool.query(sql, [
      driverDepositUniqueId,
      driverUniqueId,
      depositAmount,
      depositSourceUniqueId,
      accountUniqueId,
      depositTime,
      depositURL,
    ]);
    if (!insertResult.affectedRows) {
      return { message: "error", error: "Failed to insert deposit data" };
    }
    // Fetch inserted row via consolidated getter
    const fullData = await getDriverDeposit({
      driverDepositUniqueId,
      driverUniqueId,
      limit: 1,
    });
    const message = {
      message: "success",
      data: Array.isArray(fullData?.data) ? fullData.data[0] : fullData?.data,
    };
    sendSocketIONotificationToAdmin({ message });
    return message;
  } catch (error) {
    console.log("@createDriverDeposit error", error);
    // deleteDriverBalance(driverBalanceUniqueId);
    return { message: "error", error: "unable to create deposit data" };
  }
};

// Removed specialized GET helpers in favor of consolidated getDriverDeposit
const getDriverDeposit = async (filters = {}) => {
  const {
    driverUniqueId,
    depositStatus,
    includeNullStatus,
    minAmount,
    maxAmount,
    depositAmount,
    startDate,
    endDate,
    depositSourceUniqueId,
    accountUniqueId,
    depositURL,
    depositURLMatch, // contains|exact|startsWith|endsWith
    depositURLCaseSensitive, // boolean-like
    driverDepositUniqueId,
    driverDepositId,
    createdStart,
    createdEnd,
    page = 1,
    limit = 10,
    sortBy = "depositTime",
    sortOrder = "DESC",
  } = filters;

  // Build WHERE conditions
  const whereConditions = [];
  const params = [];

  // Existing filters
  if (driverUniqueId) {
    whereConditions.push("dd.driverUniqueId = ?");
    params.push(driverUniqueId);
  }

  if (driverDepositUniqueId) {
    whereConditions.push("dd.driverDepositUniqueId = ?");
    params.push(driverDepositUniqueId);
  }

  if (driverDepositId) {
    whereConditions.push("dd.driverDepositId = ?");
    params.push(Number(driverDepositId));
  }

  if (depositStatus || includeNullStatus) {
    const statusArray = Array.isArray(depositStatus)
      ? depositStatus
      : String(depositStatus || "")
          .split(",")
          .filter(Boolean);

    const hasStatuses = statusArray.length > 0;
    if (includeNullStatus && hasStatuses) {
      const placeholders = statusArray.map(() => "?").join(",");
      whereConditions.push(
        `(dd.depositStatus IN (${placeholders}) OR dd.depositStatus IS NULL)`
      );
      params.push(...statusArray);
    } else if (includeNullStatus && !hasStatuses) {
      whereConditions.push(`dd.depositStatus IS NULL`);
    } else if (hasStatuses) {
      const placeholders = statusArray.map(() => "?").join(",");
      whereConditions.push(`dd.depositStatus IN (${placeholders})`);
      params.push(...statusArray);
    }
  }

  // Additional filters
  if (minAmount) {
    whereConditions.push("dd.depositAmount >= ?");
    params.push(parseFloat(minAmount));
  }

  if (maxAmount) {
    whereConditions.push("dd.depositAmount <= ?");
    params.push(parseFloat(maxAmount));
  }

  if (depositAmount) {
    whereConditions.push("dd.depositAmount = ?");
    params.push(parseFloat(depositAmount));
  }

  if (startDate) {
    whereConditions.push("dd.depositTime >= ?");
    params.push(startDate);
  }

  if (endDate) {
    whereConditions.push("dd.depositTime <= ?");
    params.push(endDate);
  }

  if (createdStart) {
    whereConditions.push("dd.createdAt >= ?");
    params.push(createdStart);
  }

  if (createdEnd) {
    whereConditions.push("dd.createdAt <= ?");
    params.push(createdEnd);
  }

  if (depositSourceUniqueId) {
    whereConditions.push("dd.depositSourceUniqueId = ?");
    params.push(depositSourceUniqueId);
  }

  if (accountUniqueId) {
    whereConditions.push("dd.accountUniqueId = ?");
    params.push(accountUniqueId);
  }

  if (depositURL) {
    const mode = String(depositURLMatch || "contains").toLowerCase();
    const caseSensitive =
      depositURLCaseSensitive === true ||
      String(depositURLCaseSensitive).toLowerCase() === "true";

    let pattern = `%${depositURL}%`;
    if (mode === "exact") pattern = `${depositURL}`;
    if (mode === "startswith") pattern = `${depositURL}%`;
    if (mode === "endswith") pattern = `%${depositURL}`;

    if (mode === "exact") {
      if (caseSensitive) {
        whereConditions.push("dd.depositURL COLLATE utf8mb4_bin = ?");
      } else {
        whereConditions.push("dd.depositURL = ?");
      }
      params.push(pattern);
    } else {
      if (caseSensitive) {
        whereConditions.push("dd.depositURL COLLATE utf8mb4_bin LIKE ?");
      } else {
        whereConditions.push("dd.depositURL LIKE ?");
      }
      params.push(pattern);
    }
  }

  const whereClause =
    whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : "";

  // Normalize pagination and cap limit
  const numPage = Math.max(1, Number(page) || 1);
  const numLimit = Math.max(1, Math.min(Number(limit) || 10, 100));
  const offset = (numPage - 1) * numLimit;

  // Whitelist sort fields to prevent SQL injection
  const sortableMap = {
    depositTime: "dd.depositTime",
    depositAmount: "dd.depositAmount",
    depositStatus: "dd.depositStatus",
    createdAt: "dd.createdAt",
    driverDepositId: "dd.driverDepositId",
    driverDepositUniqueId: "dd.driverDepositUniqueId",
  };
  const safeSortBy = sortableMap[sortBy] || sortableMap["depositTime"];
  const safeSortOrder =
    String(sortOrder).toUpperCase() === "ASC" ? "ASC" : "DESC";

  const sql = `
    SELECT dd.*, u.fullName ,u.phoneNumber,u.email
    FROM DriverDeposit dd
    LEFT JOIN Users u ON dd.driverUniqueId = u.userUniqueId
    ${whereClause}
    ORDER BY ${safeSortBy} ${safeSortOrder}
    LIMIT ? OFFSET ?
  `;

  const countSql = `SELECT COUNT(*) as total FROM DriverDeposit dd ${whereClause}`;

  const [data] = await pool.query(sql, [
    ...params,
    Number(numLimit),
    Number(offset),
  ]);
  const [countResult] = await pool.query(countSql, params);

  const total = countResult[0].total;
  const totalPages = Math.ceil(total / numLimit);

  return {
    message: "success",
    data,
    pagination: {
      currentPage: Number(numPage),
      totalPages,
      totalItems: total,
      itemsPerPage: Number(numLimit),
      hasNext: Number(numPage) < totalPages,
      hasPrev: Number(numPage) > 1,
    },
  };
};
// Removed extra getters (with account info, by ID, etc.) to keep a single GET service

// Update
const updateDriverDepositByUniqueId = async (driverDepositUniqueId, data) => {
  const {
    driverUniqueId,
    depositAmount,
    depositSourceUniqueId,
    accountUniqueId,
    depositTime,
  } = data;

  const sql = `
    UPDATE DriverDeposit SET
      driverUniqueId = ?,
      depositAmount = ?,
      depositSourceUniqueId = ?,
      accountUniqueId = ?,
      depositTime = ?
    WHERE driverDepositUniqueId = ?
  `;

  const [result] = await pool.query(sql, [
    driverUniqueId,
    depositAmount,
    depositSourceUniqueId,
    accountUniqueId,
    depositTime,
    driverDepositUniqueId,
  ]);

  return result.affectedRows > 0
    ? {
        message: "success",
        data: { driverDepositUniqueId, ...data },
      }
    : { message: "error", error: "Update failed or deposit not found" };
};

// Delete
const deleteDriverDepositByUniqueId = async (driverDepositUniqueId) => {
  const sql = `DELETE FROM DriverDeposit WHERE driverDepositUniqueId = ?`;
  const [result] = await pool.query(sql, [driverDepositUniqueId]);

  return result.affectedRows > 0
    ? { message: "success", data: `Deleted: ${driverDepositUniqueId}` }
    : { message: "error", error: "Delete failed or deposit not found" };
};

// Removed specialized date-range getter: use getDriverDeposit with startDate & endDate

/**
 * @function updateDriverDepositStatusService
 * @description Updates the deposit status of a specific driver deposit record.
 *
 * @param {string} driverDepositUniqueId - The unique ID of the deposit.
 * @param {"approved" | "rejected"} newStatus - The new status to set.
 * @returns {Promise<Object>} - A success or failure response.
 */
const updateDriverDepositStatusService = async ({
  driverDepositUniqueId,
  newStatus,
}) => {
  const allowedStatuses = ["approved", "rejected"];
  if (!allowedStatuses.includes(newStatus)) {
    return { message: "error", error: "Invalid deposit status" };
  }

  // Load deposit using consolidated getter
  const depositFetch = await getDriverDeposit({
    driverDepositUniqueId,
    limit: 1,
  });
  const depositData = Array.isArray(depositFetch?.data)
    ? depositFetch.data[0]
    : depositFetch?.data;
  console.log("@depositData", depositData);

  if (!depositData) {
    return { message: "error", error: "Deposit not found" };
  }
  const depositStatus = depositData?.depositStatus;
  if (depositStatus == "approved") {
    return {
      message: "success",
      data: depositData,
    };
  }
  const depositAmount = depositData.depositAmount;
  const driverUniqueId = depositData.driverUniqueId;

  let driverBalanceUniqueId = null;

  // Only update balance if newStatus is 'approved'
  if (newStatus === "approved") {
    const newBalance = await prepareAndCreateNewBalance({
      addOrDeduct: "add",
      amount: depositAmount,
      driverUniqueId,
      transactionType: "Deposit",
      transactionUniqueId: driverDepositUniqueId,
    });

    if (newBalance.message === "error") return newBalance;

    driverBalanceUniqueId = newBalance.data?.driverBalanceUniqueId;
  }

  try {
    const sql = ` UPDATE DriverDeposit  SET depositStatus = ?  WHERE driverDepositUniqueId = ?  `;

    const [result] = await pool.query(sql, [newStatus, driverDepositUniqueId]);

    if (result.affectedRows === 0) {
      if (driverBalanceUniqueId) {
        await deleteDriverBalance(driverBalanceUniqueId);
      }
      return {
        message: "error",
        error: "Deposit not found or already updated",
      };
    }
    // sendNotificationToDriver;

    return { message: "success", data: { updated: true } };
  } catch (error) {
    if (driverBalanceUniqueId) {
      await deleteDriverBalance(driverBalanceUniqueId);
    }
    return {
      message: "error",
      error: "Unable to update deposit data",
    };
  }
};
// Removed unauthorized helpers; use consolidated getter with depositStatus filter as needed

module.exports = {
  updateDriverDepositStatusService,
  getDriverDeposit,
  createDriverDeposit,
  updateDriverDepositByUniqueId,
  deleteDriverDepositByUniqueId,
};
