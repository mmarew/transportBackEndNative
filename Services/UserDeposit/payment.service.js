"use strict";

const {
  pool
} = require("../../Middleware/Database.config");
const {
  v4: uuidv4
} = require("uuid");
const {
  currentDate
} = require("../../Utils/CurrentDate");
const {
  prepareAndCreateNewBalance
} = require("../UserBalance.service/UserBalance.post.service");


const AppError = require("../../Utils/AppError");




// Create

/**
 * Initiates a payment process using the SantimPay service.
 * 
 * This service function:
 * 1. Ensures the "santimpay" deposit source exists.
 * 2. Creates a pending deposit record in the local database.
 * 3. Generates a signed payment URL from SantimPay using ES256 algorithm.
 * 4. Returns the payment URL for the client to redirect the user.
 * 
 * @param {Object} params - The initialization parameters.
 * @param {string} params.driverUniqueId - The unique ID of the driver making the deposit.
 * @param {number|string} params.depositAmount - The amount to deposit in ETB.
 * @param {string} [params.phoneNumber=""] - Optional phone number for the payment gateway.
 * @returns {Promise<Object>} - An object containing the transaction ID, payment URL, amount, and status.
 * @throws {AppError} - If deposit source creation fails or payment initiation fails.
 */
const initiateSantimPayPaymentService = async ({
  driverUniqueId,
  depositAmount,
  phoneNumber = ""
}) => {
  const {
    generatePaymentUrl
  } = require("../../Utils/SantimPayService");
  const {
    createDepositSource
  } = require("../DepositSource.service");

  // 1. Get or create SantimPay deposit source
  // Note: createDepositSource should also be refactored, assuming it might return older format for now
  // but if it's already refactored it would throw or return data.
  // Checking typical pattern:
  const depositSourceResult = await createDepositSource({
    sourceKey: "santimpay",
    sourceLabel: "SantimPay Automatic Payment",
    user: {
      userUniqueId: driverUniqueId
    }
  });

  // Handle older format if still exists, but transition to data directly
  const depositSourceUniqueId = depositSourceResult?.data ? depositSourceResult.data.depositSourceUniqueId : depositSourceResult.depositSourceUniqueId;
  if (!depositSourceUniqueId) {
    throw new AppError("Failed to get deposit source", 500);
  }
  const userDepositUniqueId = uuidv4();
  const paymentReason = `Driver Deposit - ${depositAmount} ETB`;
  const depositURL = userDepositUniqueId;
  const depositData = {
    userDepositUniqueId,
    driverUniqueId,
    depositAmount: parseFloat(depositAmount),
    depositSourceUniqueId,
    depositURL,
    depositStatus: "PENDING"
  };
  await createUserDeposit(depositData);

  // 4. Generate SantimPay payment URL
  const paymentUrl = await generatePaymentUrl(userDepositUniqueId, parseFloat(depositAmount), paymentReason, phoneNumber);
  return {
    userDepositUniqueId,
    paymentUrl,
    depositAmount: parseFloat(depositAmount),
    status: "PENDING"
  };
};

/**
 * Generates a signed token for SantimPay checkout.
 * 
 * @param {Object} params - The parameters.
 * @param {number|string} params.depositAmount - The amount to deposit.
 * @param {string} [params.reason] - Optional reason for payment.
 * @returns {Promise<Object>} - Object containing the signed token.
 */

/**
 * Generates a signed token for SantimPay checkout.
 * 
 * @param {Object} params - The parameters.
 * @param {number|string} params.depositAmount - The amount to deposit.
 * @param {string} [params.reason] - Optional reason for payment.
 * @returns {Promise<Object>} - Object containing the signed token.
 */
const getSignedTokenService = async ({
  depositAmount,
  reason
}) => {
  const {
    getSantimPayClient,
    generateSignedTokenForInitiatePayment
  } = require("../../Utils/SantimPayService");
  const client = getSantimPayClient();
  const paymentReason = reason || `Driver Deposit - ${depositAmount} ETB`;
  const token = generateSignedTokenForInitiatePayment(depositAmount, paymentReason, client);
  return {
    signedToken: token,
    merchantId: client.merchantId,
    amount: parseFloat(depositAmount),
    reason: paymentReason
  };
};

const handleSantimPayWebhookService = async ({
  webhookData,
  signedToken
}) => {
  const {
    verifyWebhookToken
  } = require("../../Utils/SantimPayService");

  // 1. Verify the webhook token for security
  if (!signedToken) {
    throw new AppError("Missing Signed-Token header", 401);
  }
  if (!verifyWebhookToken(signedToken, webhookData)) {
    throw new AppError("Invalid webhook signature", 401);
  }
  const {
    txnId,
    thirdPartyId,
    Status,
    amount,
    paymentVia,
    message
  } = webhookData;
  if (!txnId || !thirdPartyId || !Status) {
    throw new AppError("Missing required webhook fields: txnId, thirdPartyId, or status", 400);
  }
  const depositResult = await getUserDeposit({
    userDepositUniqueId: thirdPartyId,
    limit: 1
  });
  const deposit = depositResult.data && Array.isArray(depositResult.data) ? depositResult.data[0] : null;
  if (!deposit) {
    throw new AppError(`Deposit not found for userDepositUniqueId: ${thirdPartyId}`, 404);
  }
  if (deposit.depositStatus === "COMPLETED" && deposit.depositURL === txnId) {
    return "Webhook already processed";
  }
  let newStatus;
  switch (Status.toUpperCase()) {
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
  const depositTime = currentDate();
  const updateSql = `
    UPDATE UserDeposit
    SET
      depositStatus = ?,
      depositURL = ?,
      depositTime = ?,
      acceptRejectReason = ?
    WHERE userDepositUniqueId = ?
  `;
  const reasonData = {
    reason: message || `Payment via ${paymentVia || "SantimPay"}`,
    paymentVia: paymentVia || null
  };
  const reasonMessage = JSON.stringify(reasonData);
  const [updateResult] = await pool.query(updateSql, [newStatus, txnId, depositTime, reasonMessage, thirdPartyId]);
  if (updateResult.affectedRows === 0) {
    throw new AppError("Failed to update deposit", 500);
  }
  if (newStatus === "COMPLETED") {
    // Note: prepareAndCreateNewBalance now throws AppError
    await prepareAndCreateNewBalance({
      addOrDeduct: "add",
      amount: parseFloat(amount),
      driverUniqueId: deposit.driverUniqueId,
      transactionType: "Deposit",
      transactionUniqueId: thirdPartyId,
      userBalanceCreatedBy: deposit.driverUniqueId
    });
  }
  return {
    userDepositUniqueId: thirdPartyId,
    txnId,
    status: newStatus,
    updated: true
  };
};

module.exports = {
  initiateSantimPayPaymentService,
  getSignedTokenService,
  handleSantimPayWebhookService
};
