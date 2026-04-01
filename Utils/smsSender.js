const axios = require("axios");
const AppError = require("./AppError");
const Config = require("./Config");
const logger = require("./logger");

const sendSms = async (
  receiverPhoneNumber,
  otp = null,
  customMessage = null,
) => {
  try {
    // Get configuration from centralized Config
    const {
      TOKEN: token,
      BASE_URL: baseUrl,
      SENDER: sender,
      FROM: from,
      CALLBACK: callback,
      OTP_TEMPLATE: otpTemplate,
    } = Config.SMS;
    logger.info("SMS Configuration Details:", {
      config: Config.SMS,
      receiverPhoneNumber,
    });
    // Validate required fields
    if (!token) {
      throw new AppError("SMS_TOKEN is not configured", 500);
    }

    if (!baseUrl) {
      throw new AppError("AFRO_BASE_URL is not configured", 500);
    }

    if (!sender) {
      throw new AppError("SMS_SENDER is not configured", 500);
    }

    if (!receiverPhoneNumber) {
      throw new AppError("Receiver Phone Number is required", 400);
    }

    // Determine the message to send and track if it's OTP
    let message = "";
    let isOtpMessage = false;

    // If custom message is provided, use it directly
    if (customMessage) {
      message = customMessage;
      isOtpMessage = false;
    }
    // If OTP is provided, use OTP template
    else if (otp !== null && otp !== undefined) {
      isOtpMessage = true;
      if (!otpTemplate) {
        throw new AppError("OTP_TEMPLATE is not configured", 500);
      }

      const otpString = String(otp);

      // Check if template contains #OTP# placeholder
      if (otpTemplate.includes("#OTP#")) {
        message = otpTemplate.replace(/#OTP#/g, otpString);
      } else {
        message = otpTemplate.trim() + " " + otpString;
      }
    } else {
      throw new AppError("Either OTP or custom message is required", 400);
    }

    const postfields = {
      sender: sender,
      to: receiverPhoneNumber,
      message: message,
    };

    // Add optional fields only if they have valid values (not empty, not 'null', not 'undefined')
    if (from && from !== "null" && from !== "undefined" && from.trim() !== "") {
      postfields.from = from;
    }

    if (
      callback &&
      callback !== "null" &&
      callback !== "undefined" &&
      callback.trim() !== ""
    ) {
      postfields.callback = callback;
    }
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };

    const apiResponse = await axios.post(baseUrl, postfields, {
      headers,
      timeout: 30000,
    });
    logger.info("SMS API Raw Response:", {
      status: apiResponse.status,
      data: apiResponse.data,
      receiverPhoneNumber,
    });
    const { status, data } = apiResponse;

    if (status === 200) {
      if (data && data.acknowledge === "success") {
        const successMessage = isOtpMessage
          ? "OTP sent successfully"
          : "SMS sent successfully";
        return { message: "success", data: successMessage };
      } else {
        throw new AppError(
          "SMS API returned error: " + data?.response?.errors?.[0],
          502,
        );
      }
    } else {
      throw new AppError(`SMS API HTTP Error: ${status}`, 502);
    }
  } catch (error) {
    logger.error("SMS API Request Error Details:", {
      message: error.message,
      response: error.response?.data,
      receiverPhoneNumber,
    });
    if (error instanceof AppError) {
      throw error;
    }
    // Handle axios specific errors
    if (error.response) {
      throw new AppError(
        `SMS API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`,
        502,
      );
    } else if (error.request) {
      throw new AppError("SMS API: No response received from server", 503);
    } else {
      throw new AppError("SMS API request error: " + error.message, 500);
    }
  }
};

module.exports = {
  sendSms,
};
