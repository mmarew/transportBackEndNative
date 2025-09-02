// services/Passenger.service.js
const {
  getData,
  checkActivePassengerRequest,
  performJoinSelect,
} = require("../CRUD/Read/ReadData");
const { createCanceledJourney } = require("./CanceledJourneys.service");
const { updateData } = require("../CRUD/Update/Data.update");
const { deleteData } = require("../CRUD/Delete/DeleteData");
const { createNewPassengerRequest } = require("../CRUD/Create/CreateData");

const { sendNotificationToDriver } = require("../Utils/Notifications");

const { pool } = require("../Middleware/Database.config");
const { journeyStatusMap } = require("../Utils/ListOfFixedData");
const { updateJourneyStatus } = require("./JourneyStatus.service");
const {
  verifyPassengerStatus,
  verifyDriverStatus,
} = require("./UsersCurrentStatus");
require("./AttachedDocuments.service");

const createPassengerRequest = async (body, user, journeyStatusId) => {
  try {
    const { userUniqueId } = user;
    const numberOfVehicles = body?.numberOfVehicles || 1;
    // first check if the user has an active request based on passengerRequestBatchId
    const passengerRequestBatchId = body?.passengerRequestBatchId;
    const dataByBatchId = await getData({
      tableName: "PassengerRequest",
      conditions: { passengerRequestBatchId, userUniqueId },
    });

    if (dataByBatchId?.length >= numberOfVehicles) {
      return await verifyPassengerStatus({
        userUniqueId,
        activeRequest: null, // newRequest?.data,
        sendNotificationsToDrivers: true,
      });
    }
    const noOfRecords = numberOfVehicles - dataByBatchId?.length;
    for (let i = 0; i < noOfRecords; i++) {
      await createNewPassengerRequest(body, userUniqueId, journeyStatusId);
    }
    return await verifyPassengerStatus({
      userUniqueId,
      activeRequest: null, // newRequest?.data,
      sendNotificationsToDrivers: true,
    });
  } catch (error) {
    console.log("Error in createRequest:", error);
    return { message: "error", error: "Unable to create request" };
  }
};
const acceptDriverRequest = async (body) => {
  try {
    const userUniqueId = body?.userUniqueId;
    const driverRequestUniqueId = body?.driverRequestUniqueId;
    const journeyDecisionUniqueId = body?.journeyDecisionUniqueId;

    const statusData = await verifyPassengerStatus({
      userUniqueId,
      sendNotificationsToDrivers: false,
    });
    console.log(
      "@acceptDriverRequest statusData?.drivers",
      statusData?.drivers
    );
    // multiple drivers
    const acceptedDriver = [];
    const decisions = statusData?.decisions;
    // find accepted decision from the decisions array
    const acceptedDecision = decisions?.find(
      (decision) => decision.journeyDecisionUniqueId == journeyDecisionUniqueId
    );
    console.log("@acceptedDecision", acceptedDecision);
    // return;
    const drivers = statusData?.drivers;

    for (let i = 0; i < drivers?.length; i++) {
      const driver = drivers[i];
      const phoneNumber = driver?.driver?.phoneNumber;

      if (driverRequestUniqueId != driver.driver.driverRequestUniqueId) {
        body.journeyStatusId = journeyStatusMap.rejectedByPassenger;
      } else {
        acceptedDriver[0] = driver;
        body.journeyStatusId = journeyStatusMap.acceptedByPassenger;
        // update only accepted driver request
        await updateJourneyStatus(body);
      }
      console.log("@ body.journeyStatusId", body.journeyStatusId);
      // return;
      // await updateJourneyStatus(body);
      const driverStatus = await verifyDriverStatus({
        userUniqueId: driver?.driver?.userUniqueId,
      });
      console.log("@driverStatus", driverStatus);
      if (driverStatus?.message == "success") {
        sendNotificationToDriver({ message: driverStatus, phoneNumber });
      } else if (driverStatus?.message == "error") {
        console.log(
          "Error in sending notification to driver. driverStatus is :",
          driverStatus
        );
      }
    }
    // return passenger status after journey status data is updated like above
    return await verifyPassengerStatus({ userUniqueId });
  } catch (error) {
    console.log("@acceptDriverRequest error", error);
    return { message: "error", error: "unable to accept driver request" };
  }
};

const rejectDriverOffer = async (body) => {
  try {
    console.log("@rejectDriverOffer body", body);

    // Validate required fields
    const requiredFields = [
      "passengerRequestId",
      "passengerRequestUniqueId",
      "driverRequestUniqueId",
      "journeyDecisionUniqueId",
      "journeyStatusId",
    ];
    const missingFields = requiredFields.filter((field) => !body?.[field]);

    if (missingFields.length > 0) {
      throw new Error(`Missing required fields: ${missingFields.join(", ")}`);
    }
    const allPassengerRequests = await getData({
      tableName: "JourneyDecisions",
      conditions: {
        passengerRequestId: body.passengerRequestId,
      },
    });
    // Execute all updates in parallel for better performance
    const [
      passengerRequestUpdateResult,
      driverRequestUpdateResult,
      journeyDecisionUpdateResult,
    ] = await Promise.all([
      // if there is only one request then update PassengerRequest else don't update PassengerRequest
      allPassengerRequests.length == 1 &&
        updateData({
          tableName: "PassengerRequest",
          conditions: {
            passengerRequestUniqueId: body.passengerRequestUniqueId,
          },
          updateValues: {
            journeyStatusId: journeyStatusMap.waiting,
            // updatedAt: new Date().toISOString(), // Add timestamp for tracking
          },
        }),
      updateData({
        tableName: "DriverRequest",
        conditions: {
          driverRequestUniqueId: body.driverRequestUniqueId,
        },
        updateValues: {
          journeyStatusId: body.journeyStatusId,
          // updatedAt: new Date().toISOString(),
        },
      }),
      updateData({
        tableName: "JourneyDecisions",
        conditions: {
          journeyDecisionUniqueId: body.journeyDecisionUniqueId,
        },
        updateValues: {
          journeyStatusId: body.journeyStatusId,
          // updatedAt: new Date().toISOString(),
        },
      }),
    ]);

    // Log results in a structured way
    const results = {
      passengerRequest: passengerRequestUpdateResult,
      driverRequest: driverRequestUpdateResult,
      journeyDecision: journeyDecisionUpdateResult,
    };

    console.log(
      "@rejectDriverOffer results:",
      JSON.stringify(results, null, 2)
    );

    // Verify all updates were successful
    const allSuccessful = [
      passengerRequestUpdateResult,
      driverRequestUpdateResult,
      journeyDecisionUpdateResult,
    ].every((result) => result && result.affectedRows > 0);

    if (!allSuccessful) {
      throw new Error("One or more updates failed");
    }
    const result = await verifyPassengerStatus({
      userUniqueId: body.userUniqueId,
    });
    console.log("@verifyPassengerStatus result", result);
    return result;
  } catch (error) {
    console.error("@rejectDriverOffer error:", error.message, error.stack);

    return {
      message: "error",
      error: error.message || "Unable to reject driver offer",
      code: error.code || "UPDATE_FAILED",
    };
  }
};
const getAllActiveRequests = async () => {
  const activeStatusIds = [
    journeyStatusMap.requested,
    journeyStatusMap.waiting,
    journeyStatusMap.acceptedByDriver,
  ];

  const sql = `
    SELECT pr.*, u.* 
    FROM PassengerRequest pr
    JOIN Users u ON u.userUniqueId = pr.userUniqueId 
    WHERE pr.journeyStatusId IN (?)
  `;

  try {
    const [results] = await pool.query(sql, [activeStatusIds]);
    return {
      status: "success",
      data: results,
      count: results.length,
    };
  } catch (error) {
    console.error("Failed to fetch active requests:", error);
    return {
      status: "error",
      error: "Unable to retrieve active ride requests",
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    };
  }
};
const getPassengerRequestByPassengerRequestId = async (passengerRequestId) => {
  try {
    const result = await performJoinSelect({
      baseTable: "PassengerRequest",
      joins: [
        {
          table: "Users",
          on: "PassengerRequest.userUniqueId = Users.userUniqueId",
        },
      ],
      conditions: { passengerRequestId },
    });
    return { message: "success", data: result[0] };
  } catch (error) {
    console.log(
      "@error on getPassengerRequestByPassengerRequestId error is",
      error
    );
    return { message: "error", error: "unable to get data" };
  }
};
const getPassengerRequestByPassengerRequestUniqueId = async (
  passengerRequestUniqueId
) => {
  try {
    const result = await performJoinSelect({
      baseTable: "PassengerRequest",
      joins: [
        {
          table: "Users",
          on: "PassengerRequest.userUniqueId = Users.userUniqueId",
        },
      ],
      conditions: {
        passengerRequestUniqueId,
      },
    });

    if (!result?.length) {
      return { message: "error", error: "Request not found" };
    }

    return { message: "success", data: result[0] };
  } catch (error) {
    console.log("Error in getRequestById:", error);
    return { message: "error", error: "Unable to retrieve request" };
  }
};
const getPassengerRequest4allOrSingleUser = async ({ data }) => {
  try {
    const { userUniqueId, target, page = 1, limit = 10, filters = {} } = data;
    const offset = (page - 1) * limit;

    let whereClause = "";
    let queryParams = [];
    let countParams = [];

    // Build WHERE clause based on target and filters
    if (target !== "all" && userUniqueId) {
      whereClause = " WHERE PassengerRequest.userUniqueId = ?";
      queryParams = [userUniqueId];
      countParams = [userUniqueId];
    }

    // Add additional filters if provided
    if (filters.vehicleTypeUniqueId) {
      whereClause += whereClause ? " AND " : " WHERE ";
      whereClause += " PassengerRequest.vehicleTypeUniqueId = ?";
      queryParams.push(filters.vehicleTypeUniqueId);
      countParams.push(filters.vehicleTypeUniqueId);
    }

    if (filters.journeyStatusId) {
      whereClause += whereClause ? " AND " : " WHERE ";
      whereClause += " PassengerRequest.journeyStatusId = ?";
      queryParams.push(filters.journeyStatusId);
      countParams.push(filters.journeyStatusId);
    }

    if (filters.passengerRequestBatchId) {
      whereClause += whereClause ? " AND " : " WHERE ";
      whereClause += " PassengerRequest.passengerRequestBatchId = ?";
      queryParams.push(filters.passengerRequestBatchId);
      countParams.push(filters.passengerRequestBatchId);
    }

    if (filters.shippableItemName) {
      whereClause += whereClause ? " AND " : "   WHERE ";
      whereClause += " PassengerRequest.shippableItemName LIKE ?";
      queryParams.push(`%${filters.shippableItemName}%`);
      countParams.push(`%${filters.shippableItemName}%`);
    }

    // Get paginated results
    const sqlToGetRequests = `
      SELECT 
        PassengerRequest.*, 
        Users.email,
        Users.phoneNumber,
        VehicleTypes.vehicleTypeName ,
        Users.fullName
       FROM PassengerRequest 
      JOIN Users ON Users.userUniqueId = PassengerRequest.userUniqueId 
      JOIN VehicleTypes ON VehicleTypes.vehicleTypeUniqueId = PassengerRequest.vehicleTypeUniqueId
      JOIN JourneyStatus ON JourneyStatus.journeyStatusId = PassengerRequest.journeyStatusId
      ${whereClause}
      ORDER BY PassengerRequest.requestTime DESC 
      LIMIT ? OFFSET ?
    `;

    queryParams.push(parseInt(limit), offset);
    const [requests] = await pool.query(sqlToGetRequests, queryParams);
    console.log("@requests", requests);
    // Get total count
    const sqlCount = `
      SELECT COUNT(*) as total 
      FROM PassengerRequest 
      ${whereClause}
    `;

    const countResult = await pool.query(sqlCount, countParams);
    const total = countResult[0]?.total || 0;
    const totalPages = Math.ceil(total / limit);

    // Format response data
    const formattedData = requests.map((request) => ({
      passengerRequestId: request.passengerRequestId,
      passengerRequestUniqueId: request.passengerRequestUniqueId,
      userUniqueId: request.userUniqueId,

      email: request.email,
      phoneNumber: request.phoneNumber,
      fullName: request.fullName,
      passengerRequestBatchId: request.passengerRequestBatchId,
      vehicleTypeUniqueId: request.vehicleTypeUniqueId,
      vehicleTypeName: request.vehicleTypeName,
      journeyStatusId: request.journeyStatusId,
      statusName: request.statusName,
      originLatitude: request.originLatitude,
      originLongitude: request.originLongitude,
      originPlace: request.originPlace,
      destinationLatitude: request.destinationLatitude,
      destinationLongitude: request.destinationLongitude,
      destinationPlace: request.destinationPlace,
      requestTime: request.requestTime,
      shippableItemName: request.shippableItemName,
      shippableItemQtyInQuintal: request.shippableItemQtyInQuintal,
      shippingDate: request.shippingDate,
      deliveryDate: request.deliveryDate,
      shippingCost: request.shippingCost,
    }));

    return {
      message: "success",
      data: formattedData,
      pagination: {
        currentPage: parseInt(page),
        totalPages: totalPages,
        totalItems: total,
        itemsPerPage: parseInt(limit),
        hasNext: page < totalPages,
        hasPrev: page > 1,
        ...(userUniqueId && { userId: userUniqueId }),
      },
      filters: Object.keys(filters).length > 0 ? filters : undefined,
    };
  } catch (error) {
    console.log("Error in getPassengerRequest4allOrSingleUser:", error);
    return {
      message: "error",
      error: "Unable to get passenger requests",
      data: [],
      pagination: {
        currentPage: 1,
        totalPages: 0,
        totalItems: 0,
        itemsPerPage: 10,
        hasNext: false,
        hasPrev: false,
      },
    };
  }
};

const updateRequestById = async (requestId, updates) => {
  try {
    const result = await updateData({
      tableName: "PassengerRequest",
      conditions: { passengerRequestId: requestId },
      updateValues: updates,
    });

    if (result.affectedRows === 0) {
      return {
        message: "error",
        error: "Request not found or no changes made",
      };
    }

    return { message: "success", data: "Request updated successfully" };
  } catch (error) {
    console.log("Error in updateRequestById:", error);
    return { message: "error", error: "Unable to update request" };
  }
};

const deleteRequest = async (requestId) => {
  try {
    const result = await deleteData({
      tableName: "PassengerRequest",
      conditions: { passengerRequestId: requestId },
    });

    if (result.affectedRows === 0) {
      return { message: "error", error: "Request not found" };
    }

    return { message: "success", data: "Request deleted successfully" };
  } catch (error) {
    console.log("Error in deleteRequest:", error);
    return { message: "error", error: "Unable to delete request" };
  }
};

const cancelPassengerRequest = async (body) => {
  try {
    const user = body?.user;
    const roleId = user?.roleId;
    const ownerUserUniqueId = body?.ownerUserUniqueId,
      driverUserUniqueId = body?.driverUserUniqueId,
      cancellationReasonsTypeId = body?.cancellationReasonsTypeId;
    const { userUniqueId } = user;
    // Check if the user has any active passenger requests
    const data = await checkActivePassengerRequest({
      userUniqueId: ownerUserUniqueId,
    });
    const getActiveRequest = data?.activeRequests;
    const totalRecords = data?.totalRecords;

    if (getActiveRequest.length == 0) {
      return {
        message: "error",
        error: "No active requests found for this user",
      };
    }

    const passengerRequestId = getActiveRequest?.[0]?.passengerRequestId;

    let journeyStatusId;

    if (roleId == 1) {
      journeyStatusId = journeyStatusMap.cancelledByPassenger;
    } else if (roleId == 3) {
      journeyStatusId = journeyStatusMap.cancelledByAdmin;
    } else {
      journeyStatusId = journeyStatusMap.cancelledBySystem;
    }

    // Update the PassengerRequest to reflect the cancellation
    await updateData({
      tableName: "PassengerRequest",
      conditions: { passengerRequestId },
      // 6 is canceled by passenger, 7 is canceled by driver, 8 is canceled by admin, 10 is canceled by system
      updateValues: {
        journeyStatusId,
      },
    });

    // Check if the request exists in JourneyDecisions
    const journeyDecisions = await getData({
      tableName: "JourneyDecisions",
      conditions: { passengerRequestId },
    });

    if (journeyDecisions.length == 0) {
      // register cancellation data on CanceledJourney
      const canceledJourney = await createCanceledJourney({
        canceledBy: userUniqueId,
        canceledTime: null,
        contextId: passengerRequestId,
        contextType: "PassengerRequest",
        cancellationReasonsTypeId,
        roleId,
        driverUserUniqueId,
        passengerUserUniqueId: ownerUserUniqueId,
      });
      // If there's no journey decision related to this request and cancellation is successfully registered, return success
      if (canceledJourney.message === "success")
        return {
          status: null,
          message: "success",
          data: "You have successfully cancelled your request.",
        };
    }

    const driverRequestId = journeyDecisions?.[0].driverRequestId;
    const journeyDecisionUniqueId =
      journeyDecisions?.[0].journeyDecisionUniqueId;
    const journeyDecisionId = journeyDecisions?.[0].journeyDecisionId;

    // Update the DriverRequest to reflect the cancellation
    await updateData({
      tableName: "DriverRequest",
      conditions: { driverRequestId },
      updateValues: { journeyStatusId }, // Set journeyStatusId to 6 (cancelled by passenger)
    });
    const driverData = await performJoinSelect({
      baseTable: "DriverRequest",
      joins: [
        {
          table: "Users",
          on: "DriverRequest.userUniqueId = Users.userUniqueId",
        },
      ],
      conditions: { driverRequestId },
    });
    const driver = driverData?.[0];
    const phoneNumber = driver?.phoneNumber;
    await sendNotificationToDriver({
      message: {
        passenger: null,
        driver: null,
        journey: null,
        decisions: null,
        status: journeyStatusId,
        message: "success",
        data:
          userUniqueId === ownerUserUniqueId
            ? "passenger cancelled your request."
            : "system cancelled your request.",
      },
      phoneNumber,
    });

    // Update JourneyDecisions to reflect the cancellation
    await updateData({
      tableName: "JourneyDecisions",
      conditions: { journeyDecisionUniqueId },
      updateValues: { journeyStatusId }, // Set journeyStatusId to 6 (cancelled by passenger)
    });
    const existingJourneyData = await getData({
      tableName: "Journey",
      conditions: { journeyDecisionUniqueId },
    });
    // Update the Journey table (if the journey had already started)
    const updatedJourneyData = await updateData({
      tableName: "Journey",
      conditions: { journeyDecisionUniqueId },
      updateValues: { journeyStatusId },
    });
    const journeyId = existingJourneyData.at(0)?.journeyId;
    const canceledJourney = await createCanceledJourney({
      canceledBy: userUniqueId,
      canceledTime: null,
      contextId: journeyId ?? journeyDecisionId,
      contextType: journeyId ? "Journey" : "JourneyDecisions",
      cancellationReasonsTypeId,
      roleId,
      driverUserUniqueId,
      passengerUserUniqueId: ownerUserUniqueId,
    });
    console.log("canceledJourney", canceledJourney);

    return {
      status: null,
      message: "success",
      data: "You have successfully cancelled your request.",
    };
  } catch (error) {
    console.log("@cancelPassengerRequest error", error);
    return { message: "error", error: "Unable to cancel passenger request" };
  }
};

// Function to get the passenger's current journey status
const getPassengerJourneyStatus = async (userUniqueId) => {
  try {
    const [currentRequest] = await getData({
      tableName: "PassengerRequest",
      conditions: { userUniqueId },
      limit: 1,
      orderBy: "passengerRequestId",
      orderDirection: "desc",
    });

    const journeyStatusId = currentRequest?.journeyStatusId;
    return journeyStatusId && journeyStatusId <= journeyStatusMap.journeyStarted
      ? journeyStatusId
      : null;
  } catch (error) {
    console.log("Error in getPassengerJourneyStatus:", error);
    return null;
  }
};
const getRecentCompletedJourney = async (user) => {
  console.log("@user", user);
  const userUniqueId = user?.userUniqueId;
  const results = await getData({
    tableName: "PassengerRequest",
    conditions: { userUniqueId },
    limit: 7,
    orderBy: "passengerRequestId",
    orderDirection: "desc",
  });
  return { message: "success", data: results };
};
module.exports = {
  getRecentCompletedJourney,
  acceptDriverRequest,
  getAllActiveRequests,
  getPassengerJourneyStatus,
  cancelPassengerRequest,
  createPassengerRequest,
  getPassengerRequestByPassengerRequestUniqueId,
  updateRequestById,
  deleteRequest,
  getPassengerRequestByPassengerRequestId,
  rejectDriverOffer,
  getPassengerRequest4allOrSingleUser,
};
