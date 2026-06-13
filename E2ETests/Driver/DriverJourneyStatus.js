const { usersData, backendURL } = require("../constants");
const axios = require("axios");
const {
  DRIVER_REQUEST_ENDPOINTS,
} = require("../../Routes/EndPoints/driverRequest.endpoints");
const {
  COMPANY_ASSIGNMENT_ENDPOINTS,
} = require("../../Routes/EndPoints/companyAssignment.endpoints");
const { authConfig } = require("../Utils");

/**
 * GET /api/driver/verifyDriverJourneyStatus
 * Fetches the driver's current journey state.
 * Returns the full status object including any pending assignment or shipper match.
 * Stores the result on usersData.driver for use in subsequent steps.
 */
const getDriverJourneyStatus = async ({ userType = "driver" } = {}) => {
  const token = usersData?.[userType]?.token;
  if (!token) {
    console.log("❌ getDriverJourneyStatus failed, no token found.");
    return null;
  }

  const url =
    backendURL + DRIVER_REQUEST_ENDPOINTS.VERIFY_DRIVER_JOURNEY_STATUS;
  const config = { ...authConfig(token) };

  try {
    const res = await axios.get(url, config);
    console.log("✅ Driver journey status fetched. Status:", res.data?.status);
    console.log("🔍 FULL JOURNEY STATUS PAYLOAD:", JSON.stringify(res.data, null, 2));
    // Store the full status response so accept functions can read IDs from it
    if (usersData[userType]) usersData[userType].journeyStatus = res.data;
    return res.data;
  } catch (error) {
    console.log("❌ Failed to get driver journey status.");
    if (error.response) {
      console.log(
        "Server responded with:",
        error.response.data.error?.details || error.response.data,
      );
    } else {
      console.log("Raw Error:", error.message);
    }
    return null;
  }
};

/**
 * PUT /api/driver/acceptShipperRequest
 * Used in the INDIVIDUAL flow after the driver has been auto-matched with a shipper (status 2).
 * Driver accepts the match and provides their bid price.
 *
 * Requires getDriverJourneyStatus to have been called first so that
 * driverRequestUniqueId, shipperRequestUniqueId, and journeyDecisionUniqueId
 * are available on usersData.driver.journeyStatus.
 */
const acceptShipperRequest = async ({
  userType = "driver",
  shippingCostByDriver = 500,
} = {}) => {
  const token = usersData?.[userType]?.token;
  if (!token) {
    console.log("❌ acceptShipperRequest failed, no token found.");
    return null;
  }

  const journeyStatus = usersData?.[userType]?.journeyStatus;
  if (!journeyStatus) {
    console.log(
      "❌ acceptShipperRequest failed, call getDriverJourneyStatus first.",
    );
    return null;
  }

  const driverRequestUniqueId = journeyStatus?.uniqueIds?.driverRequestUniqueId;
  const shipperRequestUniqueId =
    journeyStatus?.uniqueIds?.shipperRequestUniqueId;
  const journeyDecisionUniqueId =
    journeyStatus?.uniqueIds?.journeyDecisionUniqueId;

  if (
    !driverRequestUniqueId ||
    !shipperRequestUniqueId ||
    !journeyDecisionUniqueId
  ) {
    console.log(
      "❌ acceptShipperRequest failed, missing required IDs from journey status.",
    );
    console.log("   driverRequestUniqueId:", driverRequestUniqueId);
    console.log("   shipperRequestUniqueId:", shipperRequestUniqueId);
    console.log("   journeyDecisionUniqueId:", journeyDecisionUniqueId);
    return null;
  }

  const url = backendURL + DRIVER_REQUEST_ENDPOINTS.ACCEPT_SHIPPER_REQUEST;
  const payload = {
    driverRequestUniqueId,
    shipperRequestUniqueId,
    journeyDecisionUniqueId,
    shippingCostByDriver,
  };
  const config = authConfig(token);

  try {
    const res = await axios.put(url, payload, config);
    console.log(
      "✅ Driver accepted shipper request. Status:",
      res.data?.status,
    );
    return res.data;
  } catch (error) {
    console.log("❌ Failed to accept shipper request.");
    if (error.response) {
      console.log(
        "Server responded with:",
        error.response.data.error?.details || error.response.data,
      );
    } else {
      console.log("Raw Error:", error.message);
    }
    return null;
  }
};

/**
 * PATCH /api/company/assignments/:assignmentUniqueId/status
 * Used in the COMPANY flow after the company dispatcher has assigned the driver.
 * Driver confirms (or rejects) the company assignment.
 *
 * Requires getDriverJourneyStatus to have been called first so that
 * assignmentUniqueId is available on usersData.driver.journeyStatus.
 */
const acceptCompanyAssignment = async ({
  userType = "driver",
  assignmentStatus = "confirmed_by_driver",
  originLatitude = 9.0205,
  originLongitude = 38.8025,
  originPlace = "Addis Ababa, Ethiopia",
} = {}) => {
  const token = usersData?.[userType]?.token;
  if (!token) {
    console.log("❌ acceptCompanyAssignment failed, no token found.");
    return null;
  }

  const journeyStatus = usersData?.[userType]?.journeyStatus;
  if (!journeyStatus) {
    console.log(
      "❌ acceptCompanyAssignment failed, call getDriverJourneyStatus first.",
    );
    return null;
  }

  const assignmentUniqueId =
    journeyStatus?.companyAssignment?.assignmentUniqueId;
  if (!assignmentUniqueId) {
    console.log(
      "❌ acceptCompanyAssignment failed, no assignmentUniqueId in journey status.",
    );
    return null;
  }

  const url =
    backendURL +
    COMPANY_ASSIGNMENT_ENDPOINTS.UPDATE_ASSIGNMENT_STATUS.replace(
      ":assignmentUniqueId",
      assignmentUniqueId,
    );
  const payload = {
    assignmentStatus,
    originLatitude,
    originLongitude,
    originPlace,
  };
  const config = authConfig(token);

  try {
    const res = await axios.patch(url, payload, config);
    console.log(`✅ Driver ${assignmentStatus} company assignment.`);
    return res.data;
  } catch (error) {
    console.log(
      `❌ Failed to update company assignment status to "${assignmentStatus}".`,
    );
    if (error.response) {
      console.log(
        "Server responded with:",
        error.response.data.error?.details || error.response.data,
      );
    } else {
      console.log("Raw Error:", error.message);
    }
    return null;
  }
};

// after driver accept assignment driver can start journey and complete journey.
// via put {{url}}/api/driver/startJourney and put {{url}}/api/driver/completeJourney

/**
 * PUT /api/driver/startJourney
 * Called after the shipper has accepted the driver (status 4 = acceptedByShipper).
 * Officially begins the journey and records the driver's current GPS location.
 *
 * Reads driverRequestUniqueId, shipperRequestUniqueId, journeyDecisionUniqueId
 * from usersData[userType].journeyStatus.uniqueIds (set by getDriverJourneyStatus).
 */
const startJourney = async ({
  userType = "driver",
  latitude = 9.0205,
  longitude = 38.8025,
} = {}) => {
  const token = usersData?.[userType]?.token;
  if (!token) {
    console.log("❌ startJourney failed, no token found.");
    return null;
  }

  const journeyStatus = usersData?.[userType]?.journeyStatus;

  if (!journeyStatus) {
    console.log("❌ startJourney failed, call getDriverJourneyStatus first.");
    return null;
  }

  const driverRequestUniqueId = journeyStatus?.uniqueIds?.driverRequestUniqueId;
  const shipperRequestUniqueId =
    journeyStatus?.uniqueIds?.shipperRequestUniqueId;
  const journeyDecisionUniqueId =
    journeyStatus?.uniqueIds?.journeyDecisionUniqueId;

  if (
    !driverRequestUniqueId ||
    !shipperRequestUniqueId ||
    !journeyDecisionUniqueId
  ) {
    console.log(
      "❌ startJourney failed, missing required IDs from journey status.",
    );
    console.log("   driverRequestUniqueId:", driverRequestUniqueId);
    console.log("   shipperRequestUniqueId:", shipperRequestUniqueId);
    console.log("   journeyDecisionUniqueId:", journeyDecisionUniqueId);
    return null;
  }

  const url = backendURL + DRIVER_REQUEST_ENDPOINTS.START_JOURNEY;
  const payload = {
    driverRequestUniqueId,
    shipperRequestUniqueId,
    journeyDecisionUniqueId,
    latitude,
    longitude,
  };
  const config = authConfig(token);

  try {
    const res = await axios.put(url, payload, config);
    console.log("✅ Journey started. Status:", res.data?.status);
    if (usersData[userType]) usersData[userType].journeyStatus = res.data;
    return res.data;
  } catch (error) {
    console.log("❌ Failed to start journey.");
    if (error.response) {
      console.log(
        "Server responded with:",
        error.response.data.error?.details || error.response.data,
      );
    } else {
      console.log("Raw Error:", error.message);
    }
    return null;
  }
};

/**
 * PUT /api/driver/completeJourney
 * Called when the driver has delivered the goods and the journey is done.
 * Requires journeyUniqueId which is only available after startJourney (status 5).
 *
 * Reads all required IDs from usersData[userType].journeyStatus.uniqueIds.
 */
const completeJourney = async ({
  userType = "driver",
  latitude = 9.0205,
  longitude = 38.8025,
} = {}) => {
  const token = usersData?.[userType]?.token;
  if (!token) {
    console.log("❌ completeJourney failed, no token found.");
    return null;
  }

  const journeyStatus = usersData?.[userType]?.journeyStatus;
  if (!journeyStatus) {
    console.log(
      "❌ completeJourney failed, call getDriverJourneyStatus first.",
    );
    return null;
  }

  const driverRequestUniqueId = journeyStatus?.uniqueIds?.driverRequestUniqueId;
  const shipperRequestUniqueId =
    journeyStatus?.uniqueIds?.shipperRequestUniqueId;
  const journeyDecisionUniqueId =
    journeyStatus?.uniqueIds?.journeyDecisionUniqueId;
  const journeyUniqueId = journeyStatus?.uniqueIds?.journeyUniqueId;

  if (
    !driverRequestUniqueId ||
    !shipperRequestUniqueId ||
    !journeyDecisionUniqueId ||
    !journeyUniqueId
  ) {
    console.log(
      "❌ completeJourney failed, missing required IDs from journey status.",
    );
    console.log("   driverRequestUniqueId:", driverRequestUniqueId);
    console.log("   shipperRequestUniqueId:", shipperRequestUniqueId);
    console.log("   journeyDecisionUniqueId:", journeyDecisionUniqueId);
    console.log(
      "   journeyUniqueId:",
      journeyUniqueId,
      "(only available after startJourney)",
    );
    return null;
  }

  const url = backendURL + DRIVER_REQUEST_ENDPOINTS.COMPLETE_JOURNEY;
  const payload = {
    driverRequestUniqueId,
    shipperRequestUniqueId,
    journeyDecisionUniqueId,
    journeyUniqueId,
    latitude,
    longitude,
  };
  const config = authConfig(token);

  try {
    const res = await axios.put(url, payload, config);
    console.log("✅ Journey completed. Status:", res.data?.status);
    if (usersData[userType]) usersData[userType].journeyStatus = res.data;
    return res.data;
  } catch (error) {
    console.log("❌ Failed to complete journey.");
    if (error.response) {
      console.log(
        "Server responded with:",
        error.response.data.error?.details || error.response.data,
      );
    } else {
      console.log("Raw Error:", error.message);
    }
    return null;
  }
};

module.exports = {
  getDriverJourneyStatus,
  acceptShipperRequest,
  acceptCompanyAssignment,
  startJourney,
  completeJourney,
};
