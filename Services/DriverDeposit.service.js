const { pool } = require("../Middleware/Database.config");
const { v4: uuidv4 } = require("uuid");
const {
  prepareAndCreateNewBalance,
} = require("./DriverBalance.service/DriverBalance.post.service");
const { sendNotificationToAdmin } = require("../Utils/Notifications");
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
    const fulldata = await getDriverDepositByUniqueIdAndDriverUniqueId({
      driverDepositUniqueId,
      driverUniqueId,
    });
    const message = {
      message: "success",
      data: fulldata?.data,
    };
    sendNotificationToAdmin({ message });
    return message;
  } catch (error) {
    console.log("@createDriverDeposit error", error);
    // deleteDriverBalance(driverBalanceUniqueId);
    return { message: "error", error: "unable to create deposit data" };
  }
};

const getOneDriverDepositDataByStatus = async ({
  status,
  driverUserUniqueId,
}) => {
  const sql = `SELECT * FROM DriverDeposit WHERE depositStatus = ? and driverUniqueId=? ORDER BY depositTime DESC`;
  const [result] = await pool.query(sql, [status, driverUserUniqueId]);
  return { message: "success", data: result };
};
const getAllDriverDepositDataByStatus = async (depositStatus) => {
  const sql = `SELECT * FROM DriverDeposit WHERE depositStatus = ? ORDER BY depositTime DESC`;
  const [result] = await pool.query(sql, [depositStatus]);
  return { message: "success", data: result };
};
const getDriverDeposit = async (filters = {}) => {
  const {
    driverUniqueId,
    depositStatus,
    minAmount,
    maxAmount,
    startDate,
    endDate,
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

  if (depositStatus) {
    const statusArray = Array.isArray(depositStatus)
      ? depositStatus
      : depositStatus.split(",");

    if (statusArray.length > 0) {
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

  if (startDate) {
    whereConditions.push("dd.depositTime >= ?");
    params.push(startDate);
  }

  if (endDate) {
    whereConditions.push("dd.depositTime <= ?");
    params.push(endDate);
  }

  const whereClause =
    whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : "";

  const offset = (page - 1) * limit;

  const sql = `
    SELECT dd.*, u.fullName ,u.phoneNumber,u.email
    FROM DriverDeposit dd
    LEFT JOIN Users u ON dd.driverUniqueId = u.userUniqueId
    ${whereClause}
    ORDER BY ${sortBy} ${sortOrder}
    LIMIT ? OFFSET ?
  `;

  const countSql = `SELECT COUNT(*) as total FROM DriverDeposit dd ${whereClause}`;

  const [data] = await pool.query(sql, [...params, limit, offset]);
  const [countResult] = await pool.query(countSql, params);

  const total = countResult[0].total;
  const totalPages = Math.ceil(total / limit);

  return {
    message: "success",
    data,
    pagination: {
      currentPage: page,
      totalPages,
      totalItems: total,
      itemsPerPage: limit,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
};
// Get All (with account + source info)
const getDriverDepositsWithAccountInfo = async (driverUniqueId) => {
  let sql = `
    SELECT 
      d.driverDepositId,
      d.driverDepositUniqueId,
      d.driverUniqueId,
      d.depositAmount,
      d.depositSourceUniqueId,
      d.accountUniqueId,
      d.depositTime,
      d.createdAt,

      a.institutionName,
      a.accountHolderName,
      a.accountNumber,
      a.accountType,

      s.sourceKey,
      s.sourceLabel

    FROM DriverDeposit d
    LEFT JOIN FinancialInstitutionAccounts a ON d.accountUniqueId = a.accountUniqueId
    LEFT JOIN DepositSource s ON d.depositSourceUniqueId = s.depositSourceUniqueId
  `;

  const values = [];
  if (driverUniqueId) {
    sql += ` WHERE d.driverUniqueId = ?`;
    values.push(driverUniqueId);
  }

  sql += ` ORDER BY d.depositTime DESC`;

  const [result] = await pool.query(sql, values);
  return { message: "success", data: result };
};

// Get by ID
const getDriverDepositByUniqueId = async (driverDepositUniqueId) => {
  const sql = `SELECT * FROM DriverDeposit WHERE driverDepositUniqueId = ?`;
  const [result] = await pool.query(sql, [driverDepositUniqueId]);

  return result.length > 0
    ? { message: "success", data: result[0] }
    : { message: "error", error: "Deposit not found" };
};
const getDriverDepositByUniqueIdAndDriverUniqueId = async ({
  driverDepositUniqueId,
  driverUniqueId,
}) => {
  const sql = `SELECT * FROM DriverDeposit join Users on Users.userUniqueId=DriverDeposit.driverUniqueId WHERE driverDepositUniqueId = ? and driverUniqueId=?`;
  const [result] = await pool.query(sql, [
    driverDepositUniqueId,
    driverUniqueId,
  ]);

  return result.length > 0
    ? { message: "success", data: result[0] }
    : { message: "error", error: "Deposit not found" };
};

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

const getDepositsByDateRangeAndDriver = async ({
  driverUniqueId,
  startDate,
  endDate,
}) => {
  const sql = `
    SELECT * FROM DriverDeposit
    WHERE driverUniqueId = ?
      AND depositTime BETWEEN ? AND ?
    ORDER BY depositTime DESC
  `;

  const [result] = await pool.query(sql, [driverUniqueId, startDate, endDate]);

  return { message: "success", data: result };
};

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

  const depositData = (await getDriverDepositByUniqueId(driverDepositUniqueId))
    ?.data;
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
/**
 * @function getUnauthorizedDeposits
 * @description Retrieves all driver deposits with status 'pending' (unauthorized).
 * @returns {Promise<Object>} - A success response with the list of unauthorized deposits.
 */
const getUnauthorizedDeposits = async () => {
  const value = ["requested"];
  const sql = `SELECT * FROM DriverDeposit WHERE depositStatus is NULL OR depositStatus =? ORDER BY depositTime DESC`;
  const [result] = await pool.query(sql, value);
  return { message: "success", data: result };
};

module.exports = {
  getDriverDepositByUniqueIdAndDriverUniqueId,
  getUnauthorizedDeposits,
  updateDriverDepositStatusService,
  getDepositsByDateRangeAndDriver,
  getOneDriverDepositDataByStatus,
  getAllDriverDepositDataByStatus,
  getDriverDeposit,
  createDriverDeposit,
  getDriverDepositsWithAccountInfo,
  getDriverDepositByUniqueId,
  updateDriverDepositByUniqueId,
  deleteDriverDepositByUniqueId,
};
