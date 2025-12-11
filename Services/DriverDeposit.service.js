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
    search, // New search parameter
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

  // SEARCH FUNCTIONALITY - Search by phone, email, or full name
  if (search) {
    const searchTerm = `%${search}%`;
    whereConditions.push(`
      (u.phoneNumber LIKE ? OR u.email LIKE ? OR u.fullName LIKE ?)
    `);
    params.push(searchTerm, searchTerm, searchTerm);
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
    acceptRejectReason: "dd.acceptRejectReason",
    createdAt: "dd.createdAt",
    driverDepositId: "dd.driverDepositId",
    driverDepositUniqueId: "dd.driverDepositUniqueId",
    fullName: "u.fullName", // Allow sorting by user full name
    phoneNumber: "u.phoneNumber", // Allow sorting by phone number
    email: "u.email", // Allow sorting by email
  };
  const safeSortBy = sortableMap[sortBy] || sortableMap["depositTime"];
  const safeSortOrder =
    String(sortOrder).toUpperCase() === "ASC" ? "ASC" : "DESC";

  const sql = `
    SELECT 
      dd.*, 
      u.fullName,
      u.phoneNumber,
      u.email,
      ds.sourceLabel as depositSourceLabel,
      fia.institutionName,
      fia.accountNumber
    FROM DriverDeposit dd
    LEFT JOIN Users u ON dd.driverUniqueId = u.userUniqueId
    LEFT JOIN DepositSource ds ON dd.depositSourceUniqueId = ds.depositSourceUniqueId
    LEFT JOIN FinancialInstitutionAccounts fia ON dd.accountUniqueId = fia.accountUniqueId
    ${whereClause}
    ORDER BY ${safeSortBy} ${safeSortOrder}
    LIMIT ? OFFSET ?
  `;

  const countSql = `
    SELECT COUNT(*) as total 
    FROM DriverDeposit dd
    LEFT JOIN Users u ON dd.driverUniqueId = u.userUniqueId
    ${whereClause}
  `;

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
    filters: {
      search: search || null,
      driverUniqueId: driverUniqueId || null,
      depositStatus: depositStatus || null,
      // Include other active filters for reference
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
  acceptRejectReason,
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
  console.log("@depositData", depositData, "@newStatus", newStatus);

  if (!depositData) {
    return { message: "error", error: "Deposit not found" };
  }
  const depositStatus = depositData?.depositStatus;
  if (newStatus == depositStatus && depositStatus == "approved") {
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
    console.log("@newBalance", newBalance);
    if (newBalance.message === "error") return newBalance;

    driverBalanceUniqueId = newBalance.data?.driverBalanceUniqueId;
  }

  try {
    const sql = ` UPDATE DriverDeposit  SET depositStatus = ?, acceptRejectReason=?  WHERE driverDepositUniqueId = ?  `;

    const [result] = await pool.query(sql, [
      newStatus,
      acceptRejectReason || "null",

      driverDepositUniqueId,
    ]);
    console.log("@result", result);

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


const initiateSantimPayPaymentService = async ({
  driverUniqueId,
  depositAmount,
  phoneNumber = "",
}) => {
  try {
    const { generatePaymentUrl } = require("../Utils/SantimPayService");
    const { createDepositSource } = require("./DepositSource.service");
    const { pool } = require("../Middleware/Database.config");
    const currentDate = require("../Utils/CurrentDate");

    // 1. Get or create SantimPay deposit source
    const depositSourceResult = await createDepositSource({
      sourceKey: "santimpay",
      sourceLabel: "SantimPay Automatic Payment",
    });

    if (depositSourceResult.message === "error") {
      return depositSourceResult;
    }

    const depositSourceUniqueId =
      depositSourceResult.data.depositSourceUniqueId;

    // 2. Get system account (you may need to adjust this based on your system)
    // For now, we'll get the first active account or create a system account
    const accountSql = `
      SELECT accountUniqueId FROM FinancialInstitutionAccounts 
      WHERE isActive = TRUE 
      LIMIT 1
    `;
    const [accounts] = await pool.query(accountSql);

    if (accounts.length === 0) {
      return {
        message: "error",
        error:
          "No active financial institution account found. Please create one first.",
      };
    }

    const accountUniqueId = accounts[0].accountUniqueId;

    // 3. Create driver deposit record with PENDING status
    const driverDepositUniqueId = uuidv4();
    const depositTime = currentDate();
    const paymentReason = `Driver Deposit - ${depositAmount} ETB`;

    // Use driverDepositUniqueId as the transaction ID (id) for SantimPay
    const depositURL = driverDepositUniqueId; // Will be updated with txnId from webhook

    const depositData = {
      driverDepositUniqueId,
      driverUniqueId,
      depositAmount: parseFloat(depositAmount),
      depositSourceUniqueId,
      accountUniqueId,
      depositTime,
      depositURL,
      depositStatus: "PENDING", // Start with PENDING status
    };

    const createResult = await createDriverDeposit(depositData);

    if (createResult.message === "error") {
      return createResult;
    }

    // 4. Generate SantimPay payment URL
    const paymentUrl = await generatePaymentUrl(
      driverDepositUniqueId, // Use driverDepositUniqueId as transaction ID
      parseFloat(depositAmount),
      paymentReason,
      phoneNumber
    );

    // Log payment URL for easy testing (you can click this in browser)
    console.log("\n========================================");
    console.log("🎯 SANTIMPAY PAYMENT URL:");
    console.log("========================================");
    console.log(paymentUrl);
    console.log("========================================\n");

    return {
      message: "success",
      data: {
        driverDepositUniqueId,
        paymentUrl,
        depositAmount: parseFloat(depositAmount),
        status: "PENDING",
      },
    };
  } catch (error) {
    console.error("Initiate SantimPay payment service error:", error);
    return {
      message: "error",
      error: error.message || "Failed to initiate payment",
    };
  }
};


const handleSantimPayWebhookService = async ({ webhookData, signedToken }) => {
  try {
    const {
      txnId,
      thirdPartyId, // This is our driverDepositUniqueId
      status,
      amount,
      paymentVia,
      message,
      refId,
    } = webhookData;

    console.log("Processing webhook:", {
      txnId,
      thirdPartyId,
      status,
      amount,
      paymentVia,
    });

    // Validate required fields
    if (!txnId || !thirdPartyId || !status) {
      return {
        message: "error",
        error:
          "Missing required webhook fields: txnId, thirdPartyId, or status",
      };
    }

    // Find deposit by driverDepositUniqueId (thirdPartyId)
    const depositResult = await getDriverDeposit({
      driverDepositUniqueId: thirdPartyId,
      limit: 1,
    });

    if (
      !depositResult.data ||
      !Array.isArray(depositResult.data) ||
      depositResult.data.length === 0
    ) {
      return {
        message: "error",
        error: `Deposit not found for driverDepositUniqueId: ${thirdPartyId}`,
      };
    }

    const deposit = depositResult.data[0];

    // Check if already processed (avoid duplicate processing)
    if (deposit.depositStatus === "COMPLETED" && deposit.depositURL === txnId) {
      return {
        message: "success",
        data: "Webhook already processed",
      };
    }

    // Map SantimPay status to DriverDeposit status
    let newStatus;
    switch (status.toUpperCase()) {
      case "COMPLETED":
        newStatus = "COMPLETED";
        break;
      case "FAILED":
      case "DECLINED":
        newStatus = "FAILED";
        break;
      case "PENDING":
        newStatus = "PENDING";
        break;
      default:
        newStatus = "PENDING";
    }

    // Search for payment method account by paymentVia (e.g., "Telebirr", "M-Pesa")
    let accountUniqueId = deposit.accountUniqueId; // Keep existing account if payment method not found
    if (paymentVia && paymentVia.trim().length > 0) {
      const paymentMethodSql = `
        SELECT accountUniqueId FROM FinancialInstitutionAccounts 
        WHERE LOWER(institutionName) = LOWER(?) AND isActive = TRUE
        LIMIT 1
      `;
      const [paymentMethodAccounts] = await pool.query(paymentMethodSql, [
        paymentVia.trim(),
      ]);

      if (paymentMethodAccounts.length > 0) {
        accountUniqueId = paymentMethodAccounts[0].accountUniqueId;
        console.log(
          `Found payment method account for ${paymentVia}: ${accountUniqueId}`
        );
      } else {
        console.log(
          `Payment method "${paymentVia}" not found in FinancialInstitutionAccounts, using existing account`
        );
      }
    }

    // Update deposit with transaction ID, status, and account (if payment method found)
    const updateSql = `
      UPDATE DriverDeposit 
      SET 
        depositStatus = ?,
        depositURL = ?,
        acceptRejectReason = ?,
        accountUniqueId = ?
      WHERE driverDepositUniqueId = ?
    `;

    const reasonMessage = message || `Payment via ${paymentVia || "SantimPay"}`;
    const [updateResult] = await pool.query(updateSql, [
      newStatus,
      txnId, // Store SantimPay transaction ID in depositURL
      reasonMessage,
      accountUniqueId, // Update account if payment method found
      thirdPartyId,
    ]);

    if (updateResult.affectedRows === 0) {
      return {
        message: "error",
        error: "Failed to update deposit",
      };
    }

    // If status is COMPLETED, update driver balance
    if (newStatus === "COMPLETED") {
      const {
        prepareAndCreateNewBalance,
      } = require("./DriverBalance.service/DriverBalance.post.service");

      const balanceResult = await prepareAndCreateNewBalance({
        addOrDeduct: "add",
        amount: parseFloat(amount || deposit.depositAmount),
        driverUniqueId: deposit.driverUniqueId,
        transactionType: "Deposit",
        transactionUniqueId: thirdPartyId,
      });

      if (balanceResult.message === "error") {
        console.error("Failed to update driver balance:", balanceResult.error);
        // Don't fail the webhook, but log the error
      }
    }

    return {
      message: "success",
      data: {
        driverDepositUniqueId: thirdPartyId,
        txnId,
        status: newStatus,
        updated: true,
      },
    };
  } catch (error) {
    console.error("Handle SantimPay webhook service error:", error);
    return {
      message: "error",
      error: error.message || "Failed to process webhook",
    };
  }
};

module.exports = {
  updateDriverDepositStatusService,
  getDriverDeposit,
  createDriverDeposit,
  updateDriverDepositByUniqueId,
  deleteDriverDepositByUniqueId,
  initiateSantimPayPaymentService,
  handleSantimPayWebhookService,
};
