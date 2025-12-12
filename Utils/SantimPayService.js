const axios = require("axios");
const jwt = require("jsonwebtoken");

/**
 * Sign payload with ES256 algorithm
 */
function signES256(payload, privateKey) {
  return jwt.sign(JSON.stringify(payload), privateKey, { algorithm: "ES256" });
}

/**
 * Initialize SantimPay SDK instance
 */
function getSantimPayClient() {
  const merchantId = process.env.SANTIMPAY_MERCHANT_ID;
  const privateKey = process.env.SANTIMPAY_PRIVATE_KEY;
  const baseUrl = process.env.SANTIMPAY_BASE_URL;

  if (!merchantId || !privateKey || !baseUrl) {
    throw new Error(
      "SANTIMPAY_MERCHANT_ID and SANTIMPAY_PRIVATE_KEY and SANTIMPAY_BASE_URL are required"
    );
  }

  return {
    merchantId,
    privateKey,
    baseUrl,
  };
}

/**
 * Generate signed token for initiate payment
 */
function generateSignedTokenForInitiatePayment(amount, paymentReason, client) {
  const time = Math.floor(Date.now() / 1000);
  const payload = {
    amount,
    paymentReason,
    merchantId: client.merchantId,
    generated: time,
  };
  return signES256(payload, client.privateKey);
}

/**
 * Generate signed token for get transaction
 */
function generateSignedTokenForGetTransaction(id, client) {
  const time = Math.floor(Date.now() / 1000);
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

    const successRedirectUrl = process.env.SANTIMPAY_SUCCESS_REDIRECT_URL;
    const failureRedirectUrl = process.env.SANTIMPAY_FAILURE_REDIRECT_URL;
    const cancelRedirectUrl = process.env.SANTIMPAY_CANCEL_REDIRECT_URL;
    const notifyUrl = process.env.SANTIMPAY_WEBHOOK_URL;

    if (
      !successRedirectUrl ||
      !failureRedirectUrl ||
      !notifyUrl ||
      !cancelRedirectUrl
    ) {
      throw new Error(
        "SANTIMPAY_SUCCESS_REDIRECT_URL,SANTIMPAY_FAILURE_REDIRECT_URL,SANTIMPAY_CANCEL_REDIRECT_URL, and SANTIMPAY_WEBHOOK_URL are required"
      );
    }

    const token = generateSignedTokenForInitiatePayment(
      amount,
      paymentReason,
      client
    );

    const payload = {
      id,
      amount,
      reason: paymentReason,
      merchantId: client.merchantId,
      signedToken: token,
      successRedirectUrl,
      failureRedirectUrl,
      notifyUrl,
      cancelRedirectUrl: cancelRedirectUrl,
    };

    if (phoneNumber && phoneNumber.length > 0) {
      payload.phoneNumber = phoneNumber;
    }

    const response = await axios.post(
      `${client.baseUrl}/initiate-payment`,
      payload
    );

    if (response.status === 200 && response.data.url) {
      return response.data.url;
    } else {
      throw new Error("Failed to initiate payment: Invalid response");
    }
  } catch (error) {
    console.error("SantimPay generatePaymentUrl error:", error);
    if (error.response && error.response.data) {
      throw error.response.data;
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
      }
    );

    console.log("response in checkTransactionStatus is ", response);

    if (response.status === 200) {
      return response.data;
    } else {
      throw new Error("Failed to check transaction status");
    }
  } catch (error) {
    console.log("@error in checkTransactionStatus is ", error);
    console.error("SantimPay checkTransactionStatus error:", error);
    if (error.response && error.response.data) {
      throw error.response.data;
    }
    throw error;
  }
}

module.exports = {
  generatePaymentUrl,
  checkTransactionStatus,
};
