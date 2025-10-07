// services/Passenger.service.js
const { getData, performJoinSelect } = require("../CRUD/Read/ReadData");
const { createCanceledJourney } = require("./CanceledJourneys.service");
const { updateData } = require("../CRUD/Update/Data.update");
const { deleteData } = require("../CRUD/Delete/DeleteData");
const { createNewPassengerRequest } = require("../CRUD/Create/CreateData");

const { sendSocketIONotificationToDriver } = require("../Utils/Notifications");
const { sendFCMNotificationToUser } = require("./Firebase.service");

const { pool } = require("../Middleware/Database.config");
const { journeyStatusMap, usersRoles } = require("../Utils/ListOfFixedData");
const { updateJourneyStatus } = require("./JourneyStatus.service");
const {
  verifyPassengerStatus,
  verifyDriverStatus,
} = require("./UsersCurrentStatus");
const { on } = require("stream");
// Removed granular VehicleOwnership getter; use performJoinSelect instead
require("./AttachedDocuments.service");

const createPassengerRequest = async (
  body,
  user,
  journeyStatusId,
  createBy
) => {
  try {
    const { userUniqueId } = user;
    const numberOfVehicles = body?.numberOfVehicles || 1;
    // first check if the user has an active request based on passengerRequestBatchId
    const passengerRequestBatchId = body?.passengerRequestBatchId;
    if (!passengerRequestBatchId) {
      return {
        message: "error",
        error: "Batch Id Cant be null",
      };
    }
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
    const newRequests = [];
    const noOfRecords = numberOfVehicles - dataByBatchId?.length;
    for (let i = 0; i < noOfRecords; i++) {
      const newRequest = await createNewPassengerRequest(
        body,
        userUniqueId,
        journeyStatusId
      );
      newRequests.push(newRequest?.data[0]);
    }
    if (createBy == "driver") {
      return newRequests;
    }
    const statusData = await verifyPassengerStatus({
      userUniqueId,
      activeRequest: null, // newRequest?.data,
      sendNotificationsToDrivers: true,
    });
    return { ...statusData, newRequests };
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

    const acceptedDriver = [];

    const connectedDrivers = await performJoinSelect({
      baseTable: "DriverRequest",
      //  DriverRequest to decision
      joins: [
        {
          table: "JourneyDecisions",
          on: "DriverRequest.driverRequestId = JourneyDecisions.driverRequestId",
        },
        {
          table: "PassengerRequest",
          on: "JourneyDecisions.passengerRequestId = PassengerRequest.passengerRequestId",
        },
      ],
      conditions: {
        "PassengerRequest.userUniqueId": userUniqueId,
        "JourneyDecisions.journeyStatusId": journeyStatusMap.acceptedByDriver,
      },
    });
    console.log("@connectedDrivers", connectedDrivers);

    for (let i = 0; i < connectedDrivers?.length; i++) {
      const driver = connectedDrivers[i];
      const phoneNumber = driver?.phoneNumber;
      const targetDriverUserUniqueId = driver?.userUniqueId;

      const isAccepted = driverRequestUniqueId == driver.driverRequestUniqueId;

      // Build a fresh payload per driver to avoid mutating the shared body
      const updatePayload = {
        journeyStatusId: isAccepted
          ? journeyStatusMap.acceptedByPassenger
          : journeyStatusMap.rejectedByPassenger,
        // use identifiers from the joined row to guarantee correct updates
        driverRequestUniqueId: driver?.driverRequestUniqueId,
        journeyDecisionUniqueId: driver?.journeyDecisionUniqueId,
        passengerRequestUniqueId: driver?.passengerRequestUniqueId,
      };

      if (isAccepted) {
        acceptedDriver[0] = driver;
      }

      // Update journey status for both accepted and non-selected drivers
      await updateJourneyStatus(updatePayload);

      const driverStatus = await verifyDriverStatus({
        userUniqueId: driver?.userUniqueId,
      });

      // Build FCM notification payload once
      const notification = {
        title: isAccepted ? "Offer accepted" : "Offer not selected",
        body: isAccepted
          ? "Passenger accepted your price."
          : "Passenger selected another offer.",
      };
      const data = {
        type: "driver_offer_status",
        status: isAccepted ? "success" : "not_selected",
        driverRequestUniqueId: String(driver?.driverRequestUniqueId || ""),
        journeyDecisionUniqueId: String(journeyDecisionUniqueId || ""),
        passengerUserUniqueId: String(userUniqueId || ""),
      };

      // Always send FCM so non-selected drivers are also notified
      if (targetDriverUserUniqueId) {
        try {
          await sendFCMNotificationToUser({
            userUniqueId: targetDriverUserUniqueId,
            roleId: usersRoles.driverRoleId,
            notification,
            data,
          });
        } catch (e) {
          console.log(
            "@FCM notify driver (accept/reject) error",
            e?.message || e
          );
        }
      }

      // Only send SMS when driver status fetch succeeded
      if (driverStatus?.message == "success") {
        sendSocketIONotificationToDriver({
          message: driverStatus,
          phoneNumber,
        });
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
    // get all requests which are accepted by driver passenger requests for this passenger based on passenger request id from JourneyDecisions table.
    const allPassengerRequests = await getData({
      tableName: "JourneyDecisions",
      conditions: {
        passengerRequestId: body.passengerRequestId,
        journeyStatusId: journeyStatusMap.acceptedByDriver,
      },
    });
    // Execute all updates in parallel for better performance
    const [
      passengerRequestUpdateResult,
      driverRequestUpdateResult,
      journeyDecisionUpdateResult,
    ] = await Promise.all([
      // if there is only one request then update PassengerRequest to waiting else don't update PassengerRequest
      allPassengerRequests.length <= 1 &&
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
          journeyStatusId: journeyStatusMap.rejectedByPassenger,
          // updatedAt: new Date().toISOString(),
        },
      }),
      updateData({
        tableName: "JourneyDecisions",
        conditions: {
          journeyDecisionUniqueId: body.journeyDecisionUniqueId,
        },
        updateValues: {
          journeyStatusId: journeyStatusMap.rejectedByPassenger,
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
      // passengerRequestUpdateResult,
      driverRequestUpdateResult,
      journeyDecisionUpdateResult,
    ].every((result) => result && result.affectedRows > 0);

    if (!allSuccessful) {
      throw new Error("One or more updates failed");
    }
    const result = await verifyPassengerStatus({
      userUniqueId: body.userUniqueId,
    });
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
const getDetailedJourneyData = async (passengerRequests) => {
  const processPassengerRequest = async (passengerRequest) => {
    const { journeyStatusId, passengerRequestId } = passengerRequest;

    if (journeyStatusId === journeyStatusMap.waiting) {
      return {
        passengerRequest,
        driverRequests: [],
        decisions: [],
        journey: {},
      };
    }

    // Determine which table to query
    const useJourneyDecisions = [
      journeyStatusMap.journeyStarted,
      journeyStatusMap.journeyCompleted,
    ].includes(journeyStatusId);

    // Get decisions
    const decisions = await getData({
      tableName: "JourneyDecisions",
      conditions: { passengerRequestId, journeyStatusId },
    });

    if (decisions.length === 0) {
      return {
        passengerRequest,
        driverRequests: [],
        decisions: [],
        journey: {},
      };
    }

    // Get driver requests
    const driverRequests = await Promise.all(
      decisions.map(async (decision) => {
        const driverResults = await performJoinSelect({
          baseTable: "DriverRequest",
          joins: [
            {
              table: "Users",
              on: "DriverRequest.userUniqueId = Users.userUniqueId",
            },
          ],
          conditions: {
            "DriverRequest.driverRequestId": decision.driverRequestId,
            "DriverRequest.journeyStatusId": journeyStatusId,
          },
        });

        const driverUserUniqueId = driverResults[0]?.userUniqueId;
        if (driverUserUniqueId) {
          const vehicleOfDriver = await performJoinSelect({
            baseTable: "Vehicle",
            joins: [
              {
                table: "VehicleOwnership",
                on: "Vehicle.vehicleUniqueId = VehicleOwnership.vehicleUniqueId",
              },
              {
                table: "VehicleTypes",
                on: "Vehicle.vehicleTypeUniqueId = VehicleTypes.vehicleTypeUniqueId",
              },
            ],
            conditions: { "VehicleOwnership.userUniqueId": driverUserUniqueId },
            limit: 1,
          });
          return (
            { ...driverResults[0], vehicleOfDriver: vehicleOfDriver?.[0] } ||
            null
          );
        }
        return null;
      })
    );

    // Get journey data if applicable
    let journey = {};
    if (useJourneyDecisions) {
      const journeyData = await getData({
        tableName: "Journey",
        conditions: {
          "Journey.journeyDecisionUniqueId":
            decisions[0].journeyDecisionUniqueId,
        },
      });
      journey = journeyData[0] || {};
    }

    return {
      passengerRequest,
      // get all non null driverRequests values only

      driverRequests: driverRequests.filter((driverRequest) =>
        Boolean(driverRequest)
      ),
      decisions: decisions.filter((decision) => Boolean(decision)),
      journey,
    };
  };

  return Promise.all(passengerRequests.map(processPassengerRequest));
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
    if (filters?.vehicleTypeUniqueId) {
      whereClause += whereClause ? " AND " : " WHERE ";
      whereClause += " PassengerRequest.vehicleTypeUniqueId = ?";
      queryParams.push(filters.vehicleTypeUniqueId);
      countParams.push(filters.vehicleTypeUniqueId);
    }

    // if isCompletionSeen is provided
    if (filters?.isCompletionSeen) {
      whereClause += whereClause ? " AND " : " WHERE ";
      whereClause += " PassengerRequest.isCompletionSeen = ?";
      queryParams.push(filters.isCompletionSeen);
      countParams.push(filters.isCompletionSeen);
    }

    // Handle multiple journeyStatusIds
    if (filters?.journeyStatusIds && filters.journeyStatusIds.length > 0) {
      whereClause += whereClause ? " AND " : " WHERE ";

      if (filters.journeyStatusIds.length === 1) {
        // Single value for efficiency
        whereClause += " PassengerRequest.journeyStatusId = ?";
        queryParams.push(filters.journeyStatusIds[0]);
        countParams.push(filters.journeyStatusIds[0]);
      } else {
        // Multiple values using IN clause
        const placeholders = filters.journeyStatusIds.map(() => "?").join(",");
        whereClause += ` PassengerRequest.journeyStatusId IN (${placeholders})`;
        queryParams.push(...filters.journeyStatusIds);
        countParams.push(...filters.journeyStatusIds);
      }
    }

    if (filters?.passengerRequestBatchId) {
      whereClause += whereClause ? " AND " : " WHERE ";
      whereClause += " PassengerRequest.passengerRequestBatchId = ?";
      queryParams.push(filters.passengerRequestBatchId);
      countParams.push(filters.passengerRequestBatchId);
    }

    if (filters?.shippableItemName) {
      whereClause += whereClause ? " AND " : " WHERE ";
      whereClause += " PassengerRequest.shippableItemName LIKE ?";
      queryParams.push(`%${filters.shippableItemName}%`);
      countParams.push(`%${filters.shippableItemName}%`);
    }

    // Get paginated results - Using only columns from original code
    const sqlToGetRequests = `
      SELECT 
        PassengerRequest.*, 
        Users.email,
        Users.phoneNumber,
        VehicleTypes.vehicleTypeName,
        Users.fullName
      FROM PassengerRequest 
      JOIN Users ON Users.userUniqueId = PassengerRequest.userUniqueId 
      JOIN VehicleTypes ON VehicleTypes.vehicleTypeUniqueId = PassengerRequest.vehicleTypeUniqueId
      ${whereClause}
      ORDER BY PassengerRequest.requestTime DESC 
      LIMIT ? OFFSET ?
    `;

    queryParams.push(parseInt(limit), offset);
    const [passengerRequests] = await pool.query(sqlToGetRequests, queryParams);
    // Get total count
    const sqlCount = `
      SELECT COUNT(*) as total 
      FROM PassengerRequest 
      ${whereClause}
    `;

    const [countResult] = await pool.query(sqlCount, countParams);
    const total = countResult[0]?.total || 0;
    const totalPages = Math.ceil(total / limit);
    const formattedData = await getDetailedJourneyData(passengerRequests);
    return {
      message: "success",
      // data: passengerRequests,
      formattedData,
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
    const {
      user,
      ownerUserUniqueId,
      cancellationReasonsTypeId,
      passengerRequestId,
    } = body;
    console.log("@body", body);
    const { userUniqueId, roleId } = user;

    if (!userUniqueId || !roleId || !passengerRequestId) {
      return {
        message: "error",
        error: "Missing required fields to cancel passenger request",
      };
    }
    // get passenger data
    // const [passengerData] = await performJoinSelect({
    //   baseTable: "PassengerRequest",
    //   joins: [
    //     {
    //       table: "Users",
    //       on: "PassengerRequest.userUniqueId = Users.userUniqueId",
    //     },
    //   ],
    //   conditions: { passengerRequestId },
    // });

    await updateData({
      tableName: "PassengerRequest",
      conditions: { passengerRequestId },
      updateValues: {
        journeyStatusId: journeyStatusMap.cancelledByPassenger,
      },
    });

    // Get all journey decisions for this passenger request
    const journeyDecisions = await getData({
      tableName: "JourneyDecisions",
      conditions: { passengerRequestId },
    });
    const cancelledByPassenger = journeyStatusMap?.cancelledByPassenger;
    console.log("@cancelledByPassenger journeyDecisions", journeyDecisions);
    // If no journey decisions found, return early
    if (journeyDecisions.length) {
      // Process all journey decisions in parallel
      const updatePromises = journeyDecisions?.map(async (journeyDecision) => {
        const { journeyDecisionUniqueId, driverRequestId } = journeyDecision;

        // Update driver request status
        await updateData({
          tableName: "DriverRequest",
          conditions: { driverRequestId },
          updateValues: { journeyStatusId: cancelledByPassenger },
        });

        // Update journey decision status
        await updateData({
          tableName: "JourneyDecisions",
          conditions: { journeyDecisionUniqueId },
          updateValues: { journeyStatusId: cancelledByPassenger },
        });

        // Update journey status
        await updateData({
          tableName: "Journey",
          conditions: { journeyDecisionUniqueId },
          updateValues: { journeyStatusId: cancelledByPassenger },
        });

        // Get driver data for notification
        const [driverData] = await performJoinSelect({
          baseTable: "DriverRequest",
          joins: [
            {
              table: "Users",
              on: "DriverRequest.userUniqueId = Users.userUniqueId",
            },
          ],
          conditions: { driverRequestId },
        });

        // Send notification to driver if phone number exists
        if (driverData?.phoneNumber) {
          const notificationMessage =
            userUniqueId === ownerUserUniqueId
              ? "Passenger cancelled Journey."
              : "System cancelled Journey.";

          await sendSocketIONotificationToDriver({
            message: {
              passenger: null,
              driver: null,
              journey: null,
              decisions: null,
              status: cancelledByPassenger,
              message: "success",
              data: notificationMessage,
            },
            phoneNumber: driverData.phoneNumber,
          });

          // Also send Firebase push notification to the driver
          try {
            await sendFCMNotificationToUser({
              userUniqueId: driverData?.userUniqueId,
              roleId: usersRoles.driverRoleId,
              notification: {
                title: "Request canceled",
                body: notificationMessage,
              },
              data: {
                type: "driver_request_canceled",
                status: "canceled",
                passengerRequestId: String(passengerRequestId || ""),
                passengerUserUniqueId: String(ownerUserUniqueId || ""),
              },
            });
          } catch (e) {
            console.log("@FCM notify driver (cancel) error", e?.message || e);
          }
        }
      });

      // Wait for all updates to complete
      await Promise.all(updatePromises);
    }

    // Check if cancellation is already registered
    const canceledJourneyBefore = await getData({
      tableName: "CanceledJourneys",
      conditions: {
        contextId: passengerRequestId,
        contextType: "PassengerRequest",
      },
    });

    if (canceledJourneyBefore.length == 0) {
      // Create new cancellation record
      const canceledJourney = await createCanceledJourney({
        canceledBy: userUniqueId,
        canceledTime: new Date(), // Added timestamp
        contextId: passengerRequestId,
        contextType: "PassengerRequest",
        cancellationReasonsTypeId,
        roleId,
        passengerUserUniqueId: ownerUserUniqueId,
      });
    }
    return {
      status: null,
      message: "success",
      data: "You have successfully cancelled your request.",
    };
  } catch (error) {
    console.error("@cancelPassengerRequest error", error);
    return {
      message: "error",
      error: "Unable to cancel passenger request",
      details: error.message,
    };
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
const seenByPassenger = async (body) => {
  try {
    const { userUniqueId, passengerRequestUniqueId } = body;
    console.log(
      "@seenByPassenger userUniqueId",
      userUniqueId,
      "passengerRequestUniqueId",
      passengerRequestUniqueId
    );
    const result = await updateData({
      tableName: "PassengerRequest",
      conditions: { passengerRequestUniqueId },
      updateValues: { isCompletionSeen: true },
    });
    return { message: "success", data: "Data seen by passenger" };
  } catch (error) {
    console.log("Error in seenByPassenger:", error);
    return { message: "error", error: "Unable to seen by passenger" };
  }
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
  seenByPassenger,
};
