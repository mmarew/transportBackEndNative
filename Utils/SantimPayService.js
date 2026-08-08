const axios = require("axios");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const logger = require("./logger");
const Config = require("./Config");
const { DOMAIN, HTTP_STATUS } = require("./Constants");
const { TIME } = require("../Utils/Constants");

/**
 * Formats a phone number for SantimPay requirements (+2519...).
 * @param {string} phoneNumber - The raw phone number string.
 * @returns {string|null} - The formatted phone number or null if invalid/empty.
 */
const formatPhoneNumberForSantim = (phoneNumber) => {
  if (!phoneNumber) {
    return null;
  }

  // Remove all non-digit characters
  let clean = phoneNumber.replace(/\D/g, "");

  // Handle various formats:
  // 0912345678 -> +251912345678
  // 251912345678 -> +251912345678
  // 912345678 -> +251912345678

  if (clean.startsWith("0")) {
    clean = clean.substring(1);
  }

  if (clean.startsWith("251")) {
    clean = clean.substring(DOMAIN.PHONE_COUNTRY_CODE_LENGTH);
  }

  // Ensure it's now a 9-digit number starting with 9 or 7 (Ethiopian mobile standards)
  if (clean.length === DOMAIN.PHONE_NUMBER_LENGTH) {
    return `+251${clean}`;
  }

  // If we can't reliably format it, return original cleaned string as a fallback but logged
  logger.warn("Could not reliably format phone number for SantimPay", {
    original: phoneNumber,
    cleaned: clean,
  });
  return `+${clean}`;
};

/**
 * Sign payload with ES256 algorithm
 */
function signES256(payload, privateKey) {
  // SantimPay requires the payload to be a stringified JSON object before signing
  const stringifiedPayload = typeof payload === "string" ? payload : JSON.stringify(payload);
  return jwt.sign(stringifiedPayload, privateKey, { algorithm: "ES256" });
}

/**
 * Initialize SantimPay SDK instance
 */
function getSantimPayClient() {
  const merchantId = Config.SANTIMPAY.MERCHANT_ID;
  const privateKey = Config.SANTIMPAY.PRIVATE_KEY;
  const baseUrl = Config.SANTIMPAY.BASE_URL;

  if (!merchantId || !privateKey || !baseUrl) {
    throw new Error(
      "SANTIMPAY_MERCHANT_ID and SANTIMPAY_PRIVATE_KEY and SANTIMPAY_BASE_URL are required",
    );
  }

  // Handle literal backticks or quotes and ensure proper PEM formatting
  const formattedPrivateKey = privateKey.replace(/[`"]/g, "").trim();

  // Derive public key from private key for webhook verification
  let publicKey;
  try {
    publicKey = crypto.createPublicKey(formattedPrivateKey).export({
      type: "spki",
      format: "pem",
    });
  } catch (err) {
    logger.error("Failed to derive public key from SantimPay private key", { error: err.message });
  }

  return {
    merchantId,
    privateKey: formattedPrivateKey,
    publicKey,
    baseUrl,
  };
}

/**
 * Generate signed token for initiate payment
 */
function generateSignedTokenForInitiatePayment(amount, reason, client) {
  const payload = {
    amount: parseFloat(amount),
    paymentReason: reason,
    merchantId: client.merchantId,
    generated: Math.floor(Date.now() / TIME.MILLISECONDS_PER_SECOND),
  };
  return signES256(payload, client.privateKey);
}

/**
 * Generate signed token for get transaction
 */
function generateSignedTokenForGetTransaction(id, client) {
  const time = Math.floor(Date.now() / TIME.MILLISECONDS_PER_SECOND);
  const payload = {
    id,
    merId: client.merchantId,
    generated: time,
  };
  return signES256(payload, client.privateKey);
}

// this is generate the payment url
async function generatePaymentUrl(id, amount, paymentReason, phoneNumber = "") {
  try {
    const client = getSantimPayClient();
    const successRedirectUrl = Config.SANTIMPAY.SUCCESS_REDIRECT_URL;
    const failureRedirectUrl = Config.SANTIMPAY.FAILURE_REDIRECT_URL;
    const cancelRedirectUrl = Config.SANTIMPAY.CANCEL_REDIRECT_URL;
    const notifyUrl = Config.SANTIMPAY.WEBHOOK_URL;

    if (
      !successRedirectUrl ||
      !failureRedirectUrl ||
      !notifyUrl ||
      !cancelRedirectUrl
    ) {
      throw new Error(
        "SANTIMPAY_SUCCESS_REDIRECT_URL,SANTIMPAY_FAILURE_REDIRECT_URL,SANTIMPAY_CANCEL_REDIRECT_URL, and SANTIMPAY_WEBHOOK_URL are required",
      );
    }
    logger.debug("@client above token ", client);
    let token=null;
    try {
      token = generateSignedTokenForInitiatePayment(
        amount,
        paymentReason,
        client,
      );

    } catch (error) {
      logger.error("@Error generating token", {
        message: error.message,
        response: error?.response?.data,
        code: error.code,
      });
  
    }
    logger.debug("Generated Token:", token, "@client", client);
    const payload = {
      id,
      amount: parseFloat(amount),
      reason: paymentReason,
      merchantId: client.merchantId,
      signedToken: token,
      successRedirectUrl,
      failureRedirectUrl,
      notifyUrl,
      cancelRedirectUrl,
    };

    if (phoneNumber) {
      const formattedPhone = formatPhoneNumberForSantim(phoneNumber);
      if (formattedPhone) {
        payload.phoneNumber = formattedPhone;
      }
    }

    try {

      const response = await axios.post(
        `${client.baseUrl}/initiate-payment`,
        payload,
      );


      if (response.status === HTTP_STATUS.OK && response.data.url) {
        return response.data.url;
      } else {
        throw new Error("Failed to initiate payment: Invalid response");
      }
  
    } catch (error) {
      logger.debug("@payload", payload);
      logger.error("@Error generating payment url /initiate-payment", {
        message: error.message,
        response: error?.response?.data,
        code: error.code,
      });
      if (error?.response && error?.response?.data) {
        throw error?.response?.data;
      }
      throw error;
  
    }
  } catch (error) {
    logger.error("@Error generating payment url", {
      message: error.message,
      response: error?.response?.data,
      code: error.code,
    });
    if (error?.response && error?.response?.data) {
      throw error?.response?.data;
    }
    throw error;
  }
}

async function checkTransactionStatus(id) {
  try {
    const client = getSantimPayClient();
    const token = generateSignedTokenForGetTransaction(id, client);

    const response = await axios.post(
      `${client.baseUrl}/fetch-transaction-status`,
      {
        id,
        merchantId: client.merchantId,
        signedToken: token,
      },
    );

    if (response.status === HTTP_STATUS.OK) {
      return response.data;
    } else {
      throw new Error("Failed to check transaction status");
    }
  } catch (error) {
    if (error.response && error.response.data) {
      throw error.response.data;
    }
    throw error;
  }
}

/**
 * Verifies the SantimPay webhook signed-token.
 * @param {string} token - The Signed-Token from header.
 * @param {Object} body - The webhook POST body.
 * @returns {boolean} - True if valid, false otherwise.
 */
function verifyWebhookToken(token, body) {
  try {
    const client = getSantimPayClient();
    if (!client.publicKey) {
      logger.error("Public key not available for webhook verification");
      return false;
    }

    // Verify signature using the derived public key
    const decoded = jwt.verify(token, client.publicKey, { algorithms: ["ES256"] });

    // Ensure the payload matches the body (anti-forgery)
    // SantimPay token payload mirrors the body fields
    const payload = typeof decoded === "string" ? JSON.parse(decoded) : decoded;
    
    // Check critical fields match
    const matches = 
      payload.txnId === body.txnId &&
      parseFloat(payload.amount) === parseFloat(body.amount) &&
      payload.status === body.Status;

    if (!matches) {
      logger.warn("Webhook token payload does not match body", { payload, body });
    }

    return matches;
  } catch (error) {
    logger.error("Webhook token verification failed", { error: error.message });
    return false;
  }
}

module.exports = {
  generatePaymentUrl,
  checkTransactionStatus,
  verifyWebhookToken,
  getSantimPayClient, // Exported for testing
  generateSignedTokenForInitiatePayment, // Exported for use in other services
  signES256, // Exported for testing
};
