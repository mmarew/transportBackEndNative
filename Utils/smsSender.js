const axios = require("axios");

const sendSms = async (
  receiverPhoneNumber,
  otp = null,
  customMessage = null
) => {
  try {
    // Get configuration from environment variables
    const token = process.env.SMS_TOKEN;
    const baseUrl = process.env.AFRO_BASE_URL;
    const sender = process.env.SMS_SENDER || "";
    const from = process.env.SMS_FROM || "";
    const callback = process.env.SMS_CALLBACK || "";
    const otpTemplate = process.env.OTP_TEMPLATE || "";

    // Validate required fields
    if (!token) {
      console.error("AfroMessage SMS: Token is missing");
      return { message: "error", error: "SMS_TOKEN is not configured" };
    }

    if (!baseUrl) {
      console.error("AfroMessage SMS: Base URL is missing");
      return { message: "error", error: "AFRO_BASE_URL is not configured" };
    }

    if (!sender) {
      console.error("AfroMessage SMS: Sender is missing");
      return { message: "error", error: "SMS_SENDER is not configured" };
    }

    if (!receiverPhoneNumber) {
      console.error("AfroMessage SMS: Receiver Phone Number is missing");
      return { message: "error", error: "Receiver Phone Number is required" };
    }

    // Determine the message to send and track if it's OTP
    let message = "";
    let isOtpMessage = false;

    // If custom message is provided, use it directly
    if (customMessage) {
      message = customMessage;
      isOtpMessage = false;
      console.log(`AfroMessage SMS: ${receiverPhoneNumber} - Custom Message`);
    }
    // If OTP is provided, use OTP template
    else if (otp !== null && otp !== undefined) {
      isOtpMessage = true;
      if (!otpTemplate) {
        console.error("AfroMessage SMS: OTP_TEMPLATE is missing");
        return { message: "error", error: "OTP_TEMPLATE is not configured" };
      }

      const otpString = String(otp);
      console.log(
        `AfroMessage SMS: ${receiverPhoneNumber} - OTP: ${otpString}`
      );

      // Check if template contains #OTP# placeholder
      if (otpTemplate.includes("#OTP#")) {
        message = otpTemplate.replace(/#OTP#/g, otpString);
      } else {
        message = otpTemplate.trim() + " " + otpString;
      }
    }
    // Neither OTP nor custom message provided
    else {
      console.error(
        "AfroMessage SMS: Either OTP or custom message is required"
      );
      return {
        message: "error",
        error: "Either OTP or custom message is required",
      };
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

    const { status, data } = apiResponse;

    if (status === 200) {
      if (data && data.acknowledge === "success") {
        console.log("AfroMessage SMS: Success - ", JSON.stringify(data));
        const successMessage = isOtpMessage
          ? "OTP sent successfully"
          : "SMS sent successfully";
        return { message: "success", data: successMessage };
      } else {
        console.error("AfroMessage SMS: API Error - ", JSON.stringify(data));
        return {
          message: "error",
          error: "SMS API returned error: " + JSON.stringify(data),
        };
      }
    } else {
      console.error(
        `AfroMessage SMS: HTTP Error ${status} - `,
        JSON.stringify(data)
      );
      return {
        message: "error",
        error: `SMS API HTTP Error: ${status}`,
      };
    }
  } catch (error) {
    console.error("AfroMessage SMS Error: ", error.message);

    // Handle axios specific errors
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.error("AfroMessage SMS: Response Error - ", error.response.data);
      return {
        message: "error",
        error: `SMS API Error: ${error.response.status} - ${JSON.stringify(
          error.response.data
        )}`,
      };
    } else if (error.request) {
      console.error("AfroMessage SMS: No Response - ", error.request);
      return {
        message: "error",
        error: "SMS API: No response received from server",
      };
    } else {
      console.error("AfroMessage SMS: Request Setup Error - ", error.message);
      return {
        message: "error",
        error: "SMS API request error: " + error.message,
      };
    }
  }
};

module.exports = {
  sendSms,
};
