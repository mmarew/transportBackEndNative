const axios = require("axios");

const sendOtpViaAfroSMS = async (receiverPhoneNumber, otp) => {
  try {
    console.log(`AfroMessage SMS: ${receiverPhoneNumber} - ${otp}`);

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
      console.error("AfroMessage SMS: ReceiverPhone Number is missing");
      return { message: "error", error: "Receiver Phone Number is required" };
    }

    if (!otp) {
      console.error("AfroMessage SMS: OTP is missing");
      return { message: "error", error: "OTP is required" };
    }

    if (!otpTemplate) {
      console.error("AfroMessage SMS: OTP_TEMPLATE is missing");
      return { message: "error", error: "OTP_TEMPLATE is not configured" };
    }

    // Convert OTP to string and prepare message by replacing #OTP# placeholder
    const otpString = String(otp);
    let message = "";

    // Check if template contains #OTP# placeholder
    if (otpTemplate.includes("#OTP#")) {
      message = otpTemplate.replace(/#OTP#/g, otpString);
    } else {
      message = otpTemplate.trim() + " " + otpString;
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
        return { message: "success", data: "OTP sent successfully" };
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
  sendOtpViaAfroSMS,
};
