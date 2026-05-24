// services/Shipper.service.js
const {
  getData,
  performJoinSelect,
  getAttachedDocumentsByUserUniqueIdAndDocumentTypeId,
  findNearbyDrivers,
  checkActiveShipperRequest,
} = require("../CRUD/Read/ReadData");
const { createCanceledJourney } = require("./CanceledJourneys");
const { updateData } = require("../CRUD/Update/Data.update");
const { deleteData } = require("../CRUD/Delete/DeleteData");
const {
  createNewShipperRequest,
  insertData,
} = require("../CRUD/Create/CreateData");

const {
  sendSocketIONotificationToDriver,
  sendSocketIONotificationToShipper,
} = require("../Utils/Notifications");
const { sendFCMNotificationToUser } = require("./Firebase.service");
const { getVehicleDrivers } = require("./VehicleDriver.service");
const messageTypes = require("../Utils/MessageTypes");

const { pool } = require("../Middleware/Database.config");
const { journeyStatusMap, usersRoles } = require("../Utils/ListOfSeedData");
const { updateJourneyStatus } = require("./JourneyStatus.service");
const { verifyDriverJourneyStatus } = require("./DriverRequest.service");
const {
  getJourneyDecision4AllOrSingleUser,
} = require("./JourneyDecisions.service");
const { v4: uuidv4 } = require("uuid");
const { createRating } = require("./Ratings.service");
const AppError = require("../Utils/AppError");
const { transactionStorage } = require("../Utils/TransactionContext");
require("./AttachedDocuments.service");

const createShipperRequest = async (body, journeyStatusId) => {
  const { shipperRequestCreatedByRoleId } = body;
  let userUniqueId = body?.userUniqueId;

  if (!userUniqueId) {
    throw new AppError("userUniqueId is required", 400);
  }

  const numberOfVehicles = body?.numberOfVehicles || 1;
  const shipperRequestBatchId = body?.shipperRequestBatchId;
  if (!shipperRequestBatchId) {
    throw new AppError("Batch uniqueId Can't be null", 400);
  }

  // Use context-aware executor for raw query with locking
  const executor = transactionStorage.getStore() || pool;
  const batchCheckSql = `SELECT * FROM ShipperRequest WHERE shipperRequestBatchId = ? AND userUniqueId = ? FOR UPDATE`;
  const [dataByBatchId] = await executor.query(batchCheckSql, [
    shipperRequestBatchId,
    userUniqueId,
  ]);

  if (dataByBatchId?.length >= numberOfVehicles) {
    throw new AppError(
      "All required requests have already been created for this batch.",
      400,
      {
        existingRequestsCount: dataByBatchId?.length,
        requestedVehicles: numberOfVehicles,
        shipperRequestBatchId,
      },
    );
  }
  const newRequests = [];
  const noOfRecords = numberOfVehicles - dataByBatchId?.length;
  for (let i = 0; i < noOfRecords; i++) {
    const newRequest = await createNewShipperRequest(
      body,
      userUniqueId,
      journeyStatusId,
    );
    newRequests.push(newRequest?.data[0]);
  }
  if (shipperRequestCreatedByRoleId === usersRoles.driverRoleId) {
    return newRequests;
  }
  return newRequests;
};
const acceptDriverRequest = async (body) => {
  const userUniqueId = body?.userUniqueId;
  const driverRequestUniqueId = body?.driverRequestUniqueId;
  const journeyDecisionUniqueId = body?.journeyDecisionUniqueId;

  const connectedDrivers = await performJoinSelect({
    baseTable: "DriverRequest",
    joins: [
      {
        table: "JourneyDecisions",
        on: "DriverRequest.driverRequestId = JourneyDecisions.driverRequestId",
      },
      {
        table: "ShipperRequest",
        on: "JourneyDecisions.shipperRequestId = ShipperRequest.shipperRequestId",
      },
    ],
    conditions: {
      "ShipperRequest.userUniqueId": userUniqueId,
      "JourneyDecisions.journeyStatusId": journeyStatusMap.acceptedByDriver,
    },
  });

  if (!connectedDrivers?.length) {
    throw new AppError("No driver requests found to accept", 404);
  }

  for (let i = 0; i < connectedDrivers?.length; i++) {
    const driver = connectedDrivers[i];
    const phoneNumber = driver?.phoneNumber;
    const targetDriverUserUniqueId = driver?.userUniqueId;

    const isAccepted = driverRequestUniqueId === driver.driverRequestUniqueId;

    const updatePayload = {
      journeyStatusId: isAccepted
        ? journeyStatusMap.acceptedByShipper
        : journeyStatusMap.notSelectedInBid,
      driverRequestUniqueId: driver?.driverRequestUniqueId,
      journeyDecisionUniqueId: driver?.journeyDecisionUniqueId,
      shipperRequestUniqueId: driver?.shipperRequestUniqueId,
    };

    await updateJourneyStatus(updatePayload);

    const driverStatus = await verifyDriverJourneyStatus({
      userUniqueId: driver?.userUniqueId,
    });

    const notification = {
      title: isAccepted ? "Offer accepted" : "Offer not selected",
      body: isAccepted
        ? "Shipper accepted your price."
        : "Shipper selected another offer.",
    };
    const data = {
      type: "driver_offer_status",
      status: isAccepted ? "success" : "not_selected",
      driverRequestUniqueId: String(driver?.driverRequestUniqueId || ""),
      journeyDecisionUniqueId: String(journeyDecisionUniqueId || ""),
      shipperUserUniqueId: String(userUniqueId || ""),
    };

    if (targetDriverUserUniqueId) {
      await sendFCMNotificationToUser({
        userUniqueId: targetDriverUserUniqueId,
        roleId: usersRoles.driverRoleId,
        notification,
        data,
      }).catch((e) => logger.error("Error sending FCM notification", e));
    }

    if (driverStatus) {
      sendSocketIONotificationToDriver({
        message: driverStatus,
        phoneNumber,
      });
    }
  }
  return "Driver request accepted successfully";
};

const rejectDriverOffer = async (body) => {
  // Validate required fields
  const requiredFields = [
    "shipperRequestId",
    "shipperRequestUniqueId",
    "driverRequestUniqueId",
    "journeyDecisionUniqueId",
    "journeyStatusId",
  ];
  const missingFields = requiredFields.filter((field) => !body?.[field]);

  if (missingFields.length > 0) {
    throw new AppError(
      `Missing required fields: ${missingFields.join(", ")}`,
      400,
    );
  }

  const allShipperRequests = await getData({
    tableName: "JourneyDecisions",
    conditions: {
      shipperRequestId: body.shipperRequestId,
      journeyStatusId: journeyStatusMap.acceptedByDriver,
    },
  });

  const [driverRequestUpdateResult, journeyDecisionUpdateResult] =
    await Promise.all([
      allShipperRequests.length <= 1 &&
        updateData({
          tableName: "ShipperRequest",
          conditions: {
            shipperRequestUniqueId: body.shipperRequestUniqueId,
          },
          updateValues: {
            journeyStatusId: journeyStatusMap.waiting,
          },
        }),
      updateData({
        tableName: "DriverRequest",
        conditions: {
          driverRequestUniqueId: body.driverRequestUniqueId,
        },
        updateValues: {
          journeyStatusId: journeyStatusMap.rejectedByShipper,
        },
      }),
      updateData({
        tableName: "JourneyDecisions",
        conditions: {
          journeyDecisionUniqueId: body.journeyDecisionUniqueId,
        },
        updateValues: {
          journeyStatusId: journeyStatusMap.rejectedByShipper,
        },
      }),
    ]);

  if (
    !driverRequestUpdateResult?.affectedRows ||
    !journeyDecisionUpdateResult?.affectedRows
  ) {
    throw new AppError("Failed to reject driver offer", 500);
  }

  return "Driver offer rejected successfully";
};

const getAllActiveRequests = async (filters = {}) => {
  const {
    userUniqueId,
    email,
    phoneNumber,
    fullName,
    vehicleTypeUniqueId,
    journeyStatusId,
    shippableItemName,
    originPlace,
    destinationPlace,
    startDate,
    endDate,
    shippingDate,
    deliveryDate,
    page = 1,
    limit = 2,
    sortBy = "shipperRequestCreatedAt",
    sortOrder = "DESC",
    requestMode,
  } = filters;

  const activeStatusIds = [
    journeyStatusMap.requested,
    journeyStatusMap.waiting,
    journeyStatusMap.acceptedByDriver,
  ];

  let baseQuery = `
    SELECT 
      pr.*, 
      u.fullName,
      u.phoneNumber,
      u.email,
      u.userCreatedAt as userCreatedAt,
      vt.vehicleTypeName,
      js.journeyStatusName  
    FROM ShipperRequest pr
    JOIN Users u ON u.userUniqueId = pr.userUniqueId 
    LEFT JOIN VehicleTypes vt ON pr.vehicleTypeUniqueId = vt.vehicleTypeUniqueId
    LEFT JOIN JourneyStatus js ON pr.journeyStatusId = js.journeyStatusId
    WHERE pr.journeyStatusId IN (?)
  `;

  let whereConditions = [];
  let values = [activeStatusIds];

  if (userUniqueId) {
    whereConditions.push("pr.userUniqueId = ?");
    values.push(userUniqueId);
  }
  if (email) {
    whereConditions.push("u.email LIKE ?");
    values.push(`%${email}%`);
  }
  if (phoneNumber) {
    whereConditions.push("u.phoneNumber LIKE ?");
    values.push(`%${phoneNumber}%`);
  }
  if (fullName) {
    whereConditions.push("u.fullName LIKE ?");
    values.push(`%${fullName}%`);
  }
  if (vehicleTypeUniqueId) {
    whereConditions.push("pr.vehicleTypeUniqueId = ?");
    values.push(vehicleTypeUniqueId);
  }
  if (journeyStatusId) {
    whereConditions.push("pr.journeyStatusId = ?");
    values.push(journeyStatusId);
  }
  if (shippableItemName) {
    whereConditions.push("pr.shippableItemName LIKE ?");
    values.push(`%${shippableItemName}%`);
  }
  if (originPlace) {
    whereConditions.push("pr.originPlace LIKE ?");
    values.push(`%${originPlace}%`);
  }
  if (destinationPlace) {
    whereConditions.push("pr.destinationPlace LIKE ?");
    values.push(`%${destinationPlace}%`);
  }
  if (startDate && endDate) {
    whereConditions.push("pr.shipperRequestCreatedAt BETWEEN ? AND ?");
    values.push(startDate, endDate);
  } else if (startDate) {
    whereConditions.push("pr.shipperRequestCreatedAt >= ?");
    values.push(startDate);
  } else if (endDate) {
    whereConditions.push("pr.shipperRequestCreatedAt <= ?");
    values.push(endDate);
  }
  if (shippingDate) {
    whereConditions.push("DATE(pr.shippingDate) = ?");
    values.push(shippingDate);
  }
  if (deliveryDate) {
    whereConditions.push("DATE(pr.deliveryDate) = ?");
    values.push(deliveryDate);
  }
  if (requestMode) {
    whereConditions.push("pr.requestMode = ?");
    values.push(requestMode);
  }

  if (whereConditions.length > 0) {
    baseQuery += " AND " + whereConditions.join(" AND ");
  }

  const countQuery = `SELECT COUNT(*) as totalCount FROM (${baseQuery}) as countTable`;

  const offset = (page - 1) * limit;
  baseQuery += ` ORDER BY pr.${sortBy} ${sortOrder} LIMIT ? OFFSET ?`;
  values.push(parseInt(limit), parseInt(offset));

  const executor = transactionStorage.getStore() || pool;
  const [countResults] = await executor.query(countQuery, values.slice(0, -2));
  const [results] = await executor.query(baseQuery, values);

  const totalCount = countResults[0]?.totalCount || 0;
  const totalPages = Math.ceil(totalCount / limit);

  return {
    data: results,
    pagination: {
      currentPage: parseInt(page),
      totalPages,
      totalCount,
      hasNext: page < totalPages,
      hasPrevious: page > 1,
      pageSize: parseInt(limit),
    },
    filters: {
      applied: whereConditions.length > 0 ? filters : {},
      activeStatusIds,
    },
  };
};

const getShipperRequestByShipperRequestId = async (shipperRequestId) => {
  const result = await performJoinSelect({
    baseTable: "ShipperRequest",
    joins: [
      {
        table: "Users",
        on: "ShipperRequest.userUniqueId = Users.userUniqueId",
      },
    ],
    conditions: { shipperRequestId },
  });
  if (!result?.length) {
    throw new AppError("Shipper request not found", 404);
  }
  return result[0];
};
// DEPRECATED: Use getShipperRequest4allOrSingleUser with filters.shipperRequestUniqueId instead
// const getShipperRequestByShipperRequestUniqueId = async (
//   shipperRequestUniqueId
// ) => {
//   try {
//     const result = await performJoinSelect({
//       baseTable: "ShipperRequest",
//       joins: [
//         {
//           table: "Users",
//           on: "ShipperRequest.userUniqueId = Users.userUniqueId",
//         },
//       ],
//       conditions: {
//         shipperRequestUniqueId,
//       },
//     });

//     if (!result?.length) {
//       return { message: "error", error: "Request not found" };
//     }

//     return { message: "success", data: result[0] };
//   } catch (error) {
//     return { message: "error", error: "Unable to retrieve request" };
//   }
// };
const getDetailedJourneyData = async (shipperRequests) => {
  const processShipperRequest = async (shipperRequest) => {
    const { journeyStatusId, shipperRequestId } = shipperRequest;

    if (journeyStatusId === journeyStatusMap.waiting) {
      return {
        shipperRequest,
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
      conditions: { shipperRequestId, journeyStatusId },
    });

    if (decisions.length === 0) {
      return {
        shipperRequest,
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
                table: "VehicleDriver",
                on: "Vehicle.vehicleUniqueId = VehicleDriver.vehicleUniqueId",
              },
              {
                table: "VehicleTypes",
                on: "Vehicle.vehicleTypeUniqueId = VehicleTypes.vehicleTypeUniqueId",
              },
            ],
            conditions: {
              "VehicleDriver.driverUserUniqueId": driverUserUniqueId,
            },
            limit: 1,
          });

          // Get driver profile photo
          const documents =
            await getAttachedDocumentsByUserUniqueIdAndDocumentTypeId(
              driverUserUniqueId,
              listOfDocumentsTypeAndId.profilePhoto,
            );
          const data = documents?.data;
          const lastDataIndex = data?.length - 1;
          const driverProfilePhoto =
            data?.[lastDataIndex]?.attachedDocumentName;

          return (
            {
              ...driverResults[0],
              vehicleOfDriver: vehicleOfDriver?.[0],
              driverProfilePhoto,
            } || null
          );
        }
        return null;
      }),
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
      shipperRequest,
      // get all non null driverRequests values only

      driverRequests: driverRequests.filter((driverRequest) =>
        Boolean(driverRequest),
      ),
      decisions: decisions.filter((decision) => Boolean(decision)),
      journey,
    };
  };

  return Promise.all(shipperRequests.map(processShipperRequest));
};
const getShipperRequest4allOrSingleUser = async ({ data }) => {
  const { userUniqueId, target, page = 1, limit = 10, filters = {} } = data;
  const offset = (page - 1) * limit;

  let whereClause = "";
  let queryParams = [];
  let countParams = [];

  if (filters?.search) {
    whereClause += whereClause ? " AND " : " WHERE ";
    whereClause += ` (
  Users.phoneNumber LIKE ? OR 
  Users.email LIKE ? OR 
  Users.fullName LIKE ? OR
  ShipperRequest.shippableItemName LIKE ? OR
  ShipperRequest.originPlace LIKE ? OR
  ShipperRequest.destinationPlace LIKE ?
)`;

    const searchPattern = `%${filters.search}%`;
    queryParams?.push(
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
    );
    countParams?.push(
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
    );
  }

  if (target !== "all" && userUniqueId) {
    whereClause = " WHERE ShipperRequest.userUniqueId = ?";
    queryParams = [userUniqueId];
    countParams = [userUniqueId];
  }

  if (filters?.vehicleTypeUniqueId) {
    whereClause += whereClause ? " AND " : " WHERE ";
    whereClause += " ShipperRequest.vehicleTypeUniqueId = ?";
    queryParams.push(filters.vehicleTypeUniqueId);
    countParams.push(filters.vehicleTypeUniqueId);
  }

  if (filters?.isCompletionSeen) {
    whereClause += whereClause ? " AND " : " WHERE ";
    whereClause += " ShipperRequest.isCompletionSeen = ?";
    queryParams.push(filters.isCompletionSeen);
    countParams.push(filters.isCompletionSeen);
  }

  if (filters?.journeyStatusIds && filters.journeyStatusIds.length > 0) {
    whereClause += whereClause ? " AND " : " WHERE ";

    if (filters.journeyStatusIds.length === 1) {
      whereClause += " ShipperRequest.journeyStatusId = ?";
      queryParams.push(filters.journeyStatusIds[0]);
      countParams.push(filters.journeyStatusIds[0]);
    } else {
      const placeholders = filters.journeyStatusIds.map(() => "?").join(",");
      whereClause += ` ShipperRequest.journeyStatusId IN (${placeholders})`;
      queryParams.push(...filters.journeyStatusIds);
      countParams.push(...filters.journeyStatusIds);
    }
  }

  if (filters?.shipperRequestBatchId) {
    whereClause += whereClause ? " AND " : " WHERE ";
    whereClause += " ShipperRequest.shipperRequestBatchId = ?";
    queryParams.push(filters.shipperRequestBatchId);
    countParams.push(filters.shipperRequestBatchId);
  }

  if (filters?.shippableItemName) {
    whereClause += whereClause ? " AND " : " WHERE ";
    whereClause += " ShipperRequest.shippableItemName LIKE ?";
    queryParams.push(`%${filters.shippableItemName}%`);
    countParams.push(`%${filters.shippableItemName}%`);
  }

  if (filters?.phoneNumber) {
    whereClause += whereClause ? " AND " : " WHERE ";
    whereClause += " Users.phoneNumber LIKE ?";
    queryParams.push(`%${filters.phoneNumber}%`);
    countParams.push(`%${filters.phoneNumber}%`);
  }

  if (filters?.email) {
    whereClause += whereClause ? " AND " : " WHERE ";
    whereClause += " Users.email LIKE ?";
    queryParams.push(`%${filters.email}%`);
    countParams.push(`%${filters.email}%`);
  }

  if (filters?.shipperRequestCreatedByRoleId) {
    whereClause += whereClause ? " AND " : " WHERE ";
    whereClause += " ShipperRequest.shipperRequestCreatedByRoleId = ?";
    queryParams.push(filters.shipperRequestCreatedByRoleId);
    countParams.push(filters.shipperRequestCreatedByRoleId);
  }

  const sqlToGetRequests = `
    SELECT 
      ShipperRequest.*, 
      Users.email,
      Users.phoneNumber,
      VehicleTypes.vehicleTypeName,
      Users.fullName
    FROM ShipperRequest 
    JOIN Users ON Users.userUniqueId = ShipperRequest.userUniqueId 
    JOIN VehicleTypes ON VehicleTypes.vehicleTypeUniqueId = ShipperRequest.vehicleTypeUniqueId
    ${whereClause}
    ORDER BY ShipperRequest.shipperRequestCreatedAt DESC 
    LIMIT ? OFFSET ?
  `;

  queryParams.push(parseInt(limit), offset);
  const executor = transactionStorage.getStore() || pool;
  const [shipperRequests] = await executor.query(sqlToGetRequests, queryParams);

  const sqlCount = `
SELECT COUNT(*) as total 
FROM ShipperRequest 
JOIN Users ON Users.userUniqueId = ShipperRequest.userUniqueId 
JOIN VehicleTypes ON VehicleTypes.vehicleTypeUniqueId = ShipperRequest.vehicleTypeUniqueId
${whereClause}
`;

  const [countResult] = await executor.query(sqlCount, countParams);
  const total = countResult[0]?.total || 0;
  const totalPages = Math.ceil(total / limit);
  const formattedData = await getDetailedJourneyData(shipperRequests);

  return {
    formattedData,
    pagination: {
      currentPage: parseInt(page),
      totalPages,
      totalItems: total,
      itemsPerPage: parseInt(limit),
      hasNext: page < totalPages,
      hasPrev: page > 1,
      ...(userUniqueId && { userId: userUniqueId }),
    },
    filters: Object.keys(filters).length > 0 ? filters : undefined,
  };
};

const updateRequestById = async (requestId, updates) => {
  const result = await updateData({
    tableName: "ShipperRequest",
    conditions: { shipperRequestId: requestId },
    updateValues: updates,
  });

  if (result.affectedRows === 0) {
    throw new AppError("Request not found or no changes made", 404);
  }

  return "Request updated successfully";
};

const deleteRequest = async (requestId) => {
  const result = await deleteData({
    tableName: "ShipperRequest",
    conditions: { shipperRequestId: requestId },
  });

  if (result.affectedRows === 0) {
    throw new AppError("Request not found", 404);
  }

  return "Request deleted successfully";
};

const cancelShipperRequest = async (body) => {
  const {
    cancellationJourneyStatusId,
    user,
    ownerUserUniqueId,
    cancellationReasonsTypeId,
    shipperRequestUniqueId,
  } = body;

  const { userUniqueId, roleId } = user;

  if (!userUniqueId || !roleId || !shipperRequestUniqueId) {
    throw new AppError(
      "Missing required fields to cancel shipper request",
      400,
    );
  }

  const shipperRequestData = await getData({
    tableName: "ShipperRequest",
    conditions: { shipperRequestUniqueId },
  });

  if (!shipperRequestData || shipperRequestData.length === 0) {
    throw new AppError("Shipper request not found", 404);
  }

  const shipperRequest = shipperRequestData[0];
  const requestOwnerUserUniqueId = shipperRequest.userUniqueId;
  const shipperRequestId = shipperRequest.shipperRequestId;

  const isOwner = requestOwnerUserUniqueId === userUniqueId;
  const isAdmin = roleId === 3 || roleId === 6;

  if (!isOwner && !isAdmin) {
    throw new AppError(
      "Unauthorized: You can only cancel your own requests or must be an admin/super admin",
      403,
    );
  }

  const journeyDecisions = await getData({
    tableName: "JourneyDecisions",
    conditions: { shipperRequestId },
  });

  const shipperData = await performJoinSelect({
    baseTable: "ShipperRequest",
    joins: [
      {
        table: "Users",
        on: "ShipperRequest.userUniqueId = Users.userUniqueId",
      },
    ],
    conditions: { shipperRequestId },
  });
  const shipper = shipperData?.[0] || null;

  const driverNotificationData = [];

  await (async () => {
    await updateData({
      tableName: "ShipperRequest",
      conditions: { shipperRequestId },
      updateValues: {
        journeyStatusId: cancellationJourneyStatusId,
      },
    });

    if (journeyDecisions.length) {
      for (const journeyDecision of journeyDecisions) {
        const { journeyDecisionUniqueId, driverRequestId } = journeyDecision;

        if (driverRequestId) {
          await updateData({
            tableName: "DriverRequest",
            conditions: { driverRequestId },
            updateValues: {
              journeyStatusId: cancellationJourneyStatusId,
              isCancellationByShipperSeenByDriver: "not seen by driver yet",
            },
          });
        }

        if (journeyDecisionUniqueId) {
          await updateData({
            tableName: "JourneyDecisions",
            conditions: { journeyDecisionUniqueId },
            updateValues: { journeyStatusId: cancellationJourneyStatusId },
          });

          await updateData({
            tableName: "Journey",
            conditions: { journeyDecisionUniqueId },
            updateValues: { journeyStatusId: cancellationJourneyStatusId },
          });
        }

        driverNotificationData.push({
          journeyDecision,
          driverRequestId,
          journeyDecisionUniqueId,
        });
      }
    }
  })();

  if (journeyDecisions.length && driverNotificationData.length) {
    const notificationPromises = driverNotificationData.map(
      async ({ journeyDecision, driverRequestId, journeyDecisionUniqueId }) => {
        const driverDataArray = await performJoinSelect({
          baseTable: "DriverRequest",
          joins: [
            {
              table: "Users",
              on: "DriverRequest.userUniqueId = Users.userUniqueId",
            },
          ],
          conditions: { driverRequestId },
        });
        const driverRequest = driverDataArray?.[0];

        if (!driverRequest?.phoneNumber) {
          return;
        }

        const driverUserUniqueId = driverRequest?.userUniqueId;

        const vehicleResult = await getVehicleDrivers({
          driverUserUniqueId,
          assignmentStatus: "active",
          limit: 1,
          page: 1,
        });
        const vehicle = vehicleResult?.data?.[0] || null;

        const documents =
          await getAttachedDocumentsByUserUniqueIdAndDocumentTypeId(
            driverUserUniqueId,
            listOfDocumentsTypeAndId.profilePhoto,
          );
        const profilePhotoData = documents?.data;
        const lastDataIndex = profilePhotoData?.length - 1;
        const driverProfilePhoto =
          profilePhotoData?.[lastDataIndex]?.attachedDocumentName;

        const [journey] = await getData({
          tableName: "Journey",
          conditions: { journeyDecisionUniqueId },
        });

        const driverInfo = {
          driver: { ...driverRequest, driverProfilePhoto },
          vehicle,
        };

        const uniqueIds = {
          driverRequestUniqueId: driverRequest?.driverRequestUniqueId,
          shipperRequestUniqueId: shipper?.shipperRequestUniqueId,
          journeyDecisionUniqueId,
          journeyUniqueId: journey?.journeyUniqueId || null,
        };

        const notificationMessage =
          userUniqueId === ownerUserUniqueId
            ? "Shipper cancelled Journey."
            : "System cancelled Journey.";

        const cancellationMessageType =
          cancellationJourneyStatusId === journeyStatusMap.cancelledByShipper
            ? messageTypes?.shipper_cancelled_request
            : messageTypes?.admin_cancelled_request;

        await sendSocketIONotificationToDriver({
          message: {
            messageTypes: cancellationMessageType,
            message: "success",
            status: cancellationJourneyStatusId,
            shipper: shipper ? [shipper] : null,
            drivers: [driverInfo],
            decisions: [journeyDecision] || null,
            journey: journey || null,
            uniqueIds,
          },
          phoneNumber: driverRequest.phoneNumber,
        });

        try {
          await sendFCMNotificationToUser({
            userUniqueId: driverUserUniqueId,
            roleId: usersRoles.driverRoleId,
            notification: {
              title: "Request canceled",
              body: notificationMessage,
            },
            data: {
              type: "driver_request_canceled",
              status: "canceled",
              shipperRequestId: String(shipperRequestId || ""),
              shipperUserUniqueId: String(ownerUserUniqueId || ""),
            },
          }).catch((e) =>
            logger.error("Error sending FCM notification to driver:", e),
          );
        } catch (e) {
          logger.error("Error sending FCM notification to driver:", e);
        }
      },
    );

    await Promise.all(notificationPromises).catch((error) => {
      logger.error("Error sending notifications after cancellation:", error);
    });
  }

  const canceledJourneyBefore = await getData({
    tableName: "CanceledJourneys",
    conditions: {
      contextId: shipperRequestId,
      contextType: "ShipperRequest",
    },
  });

  if (canceledJourneyBefore.length === 0) {
    await createCanceledJourney({
      canceledBy: userUniqueId,
      canceledTime: currentDate(),
      contextId: shipperRequestId,
      contextType: "ShipperRequest",
      cancellationReasonsTypeId,
      roleId,
      shipperUserUniqueId: requestOwnerUserUniqueId,
    });
  }
  return "You have successfully cancelled your request.";
};

// Function to get the shipper's current journey status
const getShipperJourneyStatus = async (userUniqueId) => {
  try {
    const [currentRequest] = await getData({
      tableName: "ShipperRequest",
      conditions: { userUniqueId },
      limit: 1,
      orderBy: "shipperRequestId",
      orderDirection: "desc",
    });

    const journeyStatusId = currentRequest?.journeyStatusId;
    return journeyStatusId && journeyStatusId <= journeyStatusMap.journeyStarted
      ? journeyStatusId
      : null;
  } catch (error) {
    logger.error("Error getting current journey status", {
      error: error.message,
      stack: error.stack,
    });
    return null;
  }
};
const getRecentCompletedJourney = async (user) => {
  const userUniqueId = user?.userUniqueId;
  const results = await getData({
    tableName: "ShipperRequest",
    conditions: { userUniqueId },
    limit: 7,
    orderBy: "shipperRequestId",
    orderDirection: "desc",
  });
  return { message: "success", data: results };
};
const seenByShipper = async (body) => {
  const {
    userUniqueId,
    shipperRequestUniqueId,
    journeyDecisionUniqueId,
    rating,
  } = body;

  await Promise.all([
    updateData({
      tableName: "ShipperRequest",
      conditions: { shipperRequestUniqueId },
      updateValues: { isCompletionSeen: true },
    }),
    createRating({
      ratedBy: userUniqueId,
      journeyDecisionUniqueId: journeyDecisionUniqueId,
      rating,
      comment: "",
    }),
  ]);

  return "Data seen by shipper";
};

// this function is used to get status of shipper and find driver if driver is not found.
// Get cancellation notifications for shipper
const getCancellationNotifications = async ({
  userUniqueId,
  seenStatus,
  page = 1,
  limit = 10,
}) => {
  const offset = (page - 1) * limit;

  let whereConditions = [
    "ShipperRequest.userUniqueId = ?",
    "JourneyDecisions.journeyStatusId IN (?, ?)",
  ];
  let queryParams = [
    userUniqueId,
    journeyStatusMap.cancelledByDriver,
    journeyStatusMap.cancelledByAdmin,
  ];

  if (seenStatus) {
    whereConditions.push(
      "JourneyDecisions.isCancellationByDriverSeenByShipper = ?",
    );
    queryParams.push(seenStatus);
  }

  const sql = `
      SELECT 
        ShipperRequest.shipperRequestId,
        ShipperRequest.shipperRequestUniqueId,
        ShipperRequest.userUniqueId as shipperUserUniqueId,
        ShipperRequest.vehicleTypeUniqueId,
        ShipperRequest.originLatitude as shipperOriginLatitude,
        ShipperRequest.originLongitude as shipperOriginLongitude,
        ShipperRequest.originPlace as shipperOriginPlace,
        ShipperRequest.destinationLatitude,
        ShipperRequest.destinationLongitude,
        ShipperRequest.destinationPlace,
        ShipperRequest.shipperRequestCreatedAt as shipperRequestCreatedAt,
        ShipperRequest.shippableItemName,
        ShipperRequest.shippableItemQtyInQuintal,
        ShipperRequest.shippingDate,
        ShipperRequest.deliveryDate,
        ShipperRequest.shippingCost,
        ShipperUser.fullName as shipperFullName,
        ShipperUser.phoneNumber as shipperPhoneNumber,
        ShipperUser.email as shipperEmail,
        JourneyDecisions.journeyDecisionId,
        JourneyDecisions.journeyDecisionUniqueId,
        JourneyDecisions.decisionTime,
        JourneyDecisions.decisionBy,
        JourneyDecisions.journeyStatusId,
        JourneyDecisions.isCancellationByDriverSeenByShipper,
        DriverRequest.driverRequestId,
        DriverRequest.driverRequestUniqueId,
        DriverRequest.userUniqueId as driverUserUniqueId,
        DriverRequest.originLatitude,
        DriverRequest.originLongitude,
        DriverRequest.originPlace,
        DriverRequest.driverRequestCreatedAt,
        DriverUser.fullName as driverFullName,
        DriverUser.phoneNumber as driverPhoneNumber,
        DriverUser.email as driverEmail
      FROM JourneyDecisions
      INNER JOIN ShipperRequest ON JourneyDecisions.shipperRequestId = ShipperRequest.shipperRequestId
      INNER JOIN Users as ShipperUser ON ShipperRequest.userUniqueId = ShipperUser.userUniqueId
      INNER JOIN DriverRequest ON JourneyDecisions.driverRequestId = DriverRequest.driverRequestId
      INNER JOIN Users as DriverUser ON DriverRequest.userUniqueId = DriverUser.userUniqueId
      WHERE ${whereConditions.join(" AND ")}
      ORDER BY JourneyDecisions.decisionTime DESC
      LIMIT ? OFFSET ?
    `;

  const countSql = `
      SELECT COUNT(*) as total
      FROM JourneyDecisions
      INNER JOIN ShipperRequest ON JourneyDecisions.shipperRequestId = ShipperRequest.shipperRequestId
      WHERE ${whereConditions.join(" AND ")}
    `;

  const executor = transactionStorage.getStore() || pool;
  const [countResults] = await executor.query(countSql, queryParams);
  const total = countResults[0]?.total || 0;

  const paginatedQueryParams = [
    ...queryParams,
    parseInt(limit),
    parseInt(offset),
  ];

  const [results] = await executor.query(sql, paginatedQueryParams);

  if (results.length === 0) {
    return {
      data: [],
      count: 0,
    };
  }

  const enrichedData = await Promise.all(
    results.map(async (request) => {
      let journey = null;
      if (request.journeyDecisionUniqueId) {
        const journeyData = await performJoinSelect({
          baseTable: "Journey",
          joins: [
            {
              table: "JourneyDecisions",
              on: "Journey.journeyDecisionUniqueId = JourneyDecisions.journeyDecisionUniqueId",
            },
          ],
          conditions: {
            "Journey.journeyDecisionUniqueId": request.journeyDecisionUniqueId,
          },
        });
        journey = journeyData?.[0] || null;
      }

      return {
        shipperRequest: {
          shipperRequestId: request.shipperRequestId,
          shipperRequestUniqueId: request.shipperRequestUniqueId,
          userUniqueId: request.shipperUserUniqueId,
          vehicleTypeUniqueId: request.vehicleTypeUniqueId,
          originLatitude: request.shipperOriginLatitude,
          originLongitude: request.shipperOriginLongitude,
          originPlace: request.shipperOriginPlace,
          destinationLatitude: request.destinationLatitude,
          destinationLongitude: request.destinationLongitude,
          destinationPlace: request.destinationPlace,
          shipperRequestCreatedAt: request.shipperRequestCreatedAt,
          shippableItemName: request.shippableItemName,
          shippableItemQtyInQuintal: request.shippableItemQtyInQuintal,
          shippingDate: request.shippingDate,
          deliveryDate: request.deliveryDate,
          shippingCost: request.shippingCost,
        },
        shipper: {
          userUniqueId: request.shipperUserUniqueId,
          fullName: request.shipperFullName,
          phoneNumber: request.shipperPhoneNumber,
          email: request.shipperEmail,
        },
        driverRequest: {
          driverRequestId: request.driverRequestId,
          driverRequestUniqueId: request.driverRequestUniqueId,
          userUniqueId: request.driverUserUniqueId,
          originLatitude: request.originLatitude,
          originLongitude: request.originLongitude,
          originPlace: request.originPlace,
          driverRequestCreatedAt: request.driverRequestCreatedAt,
        },
        driver: {
          userUniqueId: request.driverUserUniqueId,
          fullName: request.driverFullName,
          phoneNumber: request.driverPhoneNumber,
          email: request.driverEmail,
        },
        journeyDecision: {
          journeyDecisionId: request.journeyDecisionId,
          journeyDecisionUniqueId: request.journeyDecisionUniqueId,
          decisionTime: request.decisionTime,
          decisionBy: request.decisionBy,
          journeyStatusId: request.journeyStatusId,
          isCancellationByDriverSeenByShipper:
            request.isCancellationByDriverSeenByShipper,
        },
        journey,
      };
    }),
  );

  const validData = enrichedData.filter((item) => item !== null);
  const totalPages = Math.ceil(total / limit);

  return {
    data: validData,
    count: validData.length,
    pagination: {
      currentPage: parseInt(page),
      totalPages: totalPages,
      totalItems: total,
      itemsPerPage: parseInt(limit),
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
};

// Mark cancellation notification as seen by shipper
const markCancellationAsSeen = async ({
  journeyDecisionUniqueId,
  userUniqueId,
}) => {
  const journeyDecision = await getData({
    tableName: "JourneyDecisions",
    conditions: { journeyDecisionUniqueId },
  });

  if (!journeyDecision || journeyDecision.length === 0) {
    throw new AppError("Journey decision not found", 404);
  }

  const decisionData = journeyDecision[0];
  const shipperRequestId = decisionData.shipperRequestId;

  const shipperRequest = await getData({
    tableName: "ShipperRequest",
    conditions: { shipperRequestId },
  });

  if (!shipperRequest || shipperRequest.length === 0) {
    throw new AppError("Shipper request not found", 404);
  }

  const requestData = shipperRequest[0];
  if (requestData.userUniqueId !== userUniqueId) {
    throw new AppError(
      "Unauthorized: Journey decision does not belong to this shipper",
      403,
    );
  }

  if (
    decisionData.journeyStatusId !== journeyStatusMap.cancelledByDriver &&
    decisionData.journeyStatusId !== journeyStatusMap.cancelledByAdmin
  ) {
    throw new AppError(
      "This journey decision is not in a cancelled status",
      400,
    );
  }

  const result = await updateData({
    tableName: "JourneyDecisions",
    conditions: { journeyDecisionUniqueId },
    updateValues: {
      isCancellationByDriverSeenByShipper: "seen by shipper",
    },
  });

  if (result.affectedRows === 0) {
    throw new AppError("Failed to update cancellation seen status", 500);
  }

  return "Cancellation notification marked as seen";
};

/**
 * cancelShipperRequestBatch
 *
 * Cancels a company-targeted freight batch by updating ONE row:
 *   ShipperRequestBatch.journeyStatusId = cancelledByShipper (7) / cancelledByAdmin (10)
 *
 * WHY only the batch row — NOT the individual ShipperRequest rows?
 * ─────────────────────────────────────────────────────────────────────────────
 * ShipperRequestBatch  = SHIPPER's view of the whole order  ← we update THIS
 * ShipperRequest rows  = per-vehicle driver workflow         ← UNTOUCHED
 * JourneyDecisions       = bid/decision records                ← UNTOUCHED
 * DriverRequest          = driver-side lifecycle               ← UNTOUCHED
 *
 * The individual cancelShipperRequest() carries complex side-effects:
 * updating DriverRequest, JourneyDecisions, creating per-request
 * CanceledJourneys records, and firing socket/FCM notifications to drivers.
 * A bulk UPDATE on ShipperRequest rows bypasses all of that — leaving
 * drivers uninformed and JourneyDecisions in stale states.
 *
 * Marking the BATCH as cancelled is the safe, single-responsibility action.
 * Driver-side cancellation flows are triggered separately if needed.
 *
 * Side effects:
 *   - All submitted CompanyBidRequest rows → 'expired'
 *   - One CanceledJourneys audit record written for the batch
 */
const cancelShipperRequestBatch = async ({
  shipperRequestBatchId,
  userUniqueId,
  roleId,
  cancellationReasonsTypeId,
}) => {
  if (!shipperRequestBatchId || !userUniqueId) {
    throw new AppError(
      "shipperRequestBatchId and userUniqueId are required",
      400,
    );
  }

  const executor = transactionStorage.getStore() || pool;

  // 1. Verify batch exists + ownership via ShipperRequestBatch (not individual rows)
  const [batchResult] = await executor.query(
    `SELECT batchId, shipperUserUniqueId, journeyStatusId
       FROM ShipperRequestBatch
      WHERE batchUniqueId = ?
      LIMIT 1`,
    [shipperRequestBatchId],
  );

  const batch = batchResult[0];
  if (!batch) {
    throw new AppError("Batch not found", 404);
  }

  const isAdmin = roleId === 3 || roleId === 6;
  if (batch.shipperUserUniqueId !== userUniqueId && !isAdmin) {
    throw new AppError("Unauthorized: batch does not belong to you", 403);
  }

  if (
    batch.journeyStatusId === journeyStatusMap.cancelledByShipper ||
    batch.journeyStatusId === journeyStatusMap.cancelledByAdmin
  ) {
    throw new AppError("Batch is already cancelled", 400);
  }

  const cancellationStatusId = isAdmin
    ? journeyStatusMap.cancelledByAdmin
    : journeyStatusMap.cancelledByShipper;

  // 2. Update only the BATCH row — individual ShipperRequest rows keep their statuses
  await executor.query(
    `UPDATE ShipperRequestBatch
        SET journeyStatusId = ?,
            batchUpdatedAt  = NOW()
      WHERE batchUniqueId = ?`,
    [cancellationStatusId, shipperRequestBatchId],
  );

  // 3. Expire all submitted company bids — companies see opportunity is closed
  await executor.query(
    `UPDATE CompanyBidRequest
        SET bidStatus = 'expired'
      WHERE shipperRequestBatchId = ?
        AND bidStatus = 'submitted'`,
    [shipperRequestBatchId],
  );

  // 4. Write ONE audit record for the batch cancellation
  const [existing] = await executor.query(
    `SELECT canceledJourneyId FROM CanceledJourneys
      WHERE contextId = ? AND contextType = 'ShipperRequest'
      LIMIT 1`,
    [batch.batchId],
  );

  if (!existing[0]) {
    await createCanceledJourney({
      canceledBy: userUniqueId,
      canceledTime: new Date().toISOString().slice(0, 19).replace("T", " "),
      contextId: batch.batchId,
      contextType: "ShipperRequest",
      cancellationReasonsTypeId: cancellationReasonsTypeId || null,
      roleId,
      shipperUserUniqueId: batch.shipperUserUniqueId,
    });
  }

  return {
    message: "success",
    data: { shipperRequestBatchId, status: "cancelled" },
  };
};

// verifyShipperStatus starts here
const verifyShipperStatus = async ({
  userUniqueId,
  activeRequest,
  totalRecords,
  sendNotificationsToDrivers = false,
  pageSize,
  page,
}) => {
  if (!activeRequest || activeRequest?.length === 0) {
    const dataOfActiveRequest = await checkActiveShipperRequest({
      userUniqueId,
      pageSize,
      page,
    });
    activeRequest = dataOfActiveRequest?.activeRequests;
    totalRecords = dataOfActiveRequest?.totalRecords;
  }

  if (activeRequest?.length === 0 || !activeRequest) {
    const defaultTotalRecords = {
      totalCount: 0,
      waitingCount: 0,
      requestedCount: 0,
      acceptedByDriverCount: 0,
      acceptedByShipperCount: 0,
      journeyStartedCount: 0,
      notSeenCompletedCount: 0,
      notSeenCancelledByDriverCount: 0,
      individualWaitingCount: 0,
      companyBatchWaitingCount: 0,
      companyAuctionCount: 0,
    };

    return {
      totalRecords: totalRecords || defaultTotalRecords,
    };
  }
  const shipper = [],
    decisions = [],
    drivers = [],
    driversData = [],
    decisionsData = [];
  let journey = [];
  let driverFound = false;
  const notifiedDrivers = new Set();
  for (const shipperRequest of activeRequest) {
    const journeyStatusId = shipperRequest.journeyStatusId,
      shipperRequestId = shipperRequest.shipperRequestId;

    shipper.push(shipperRequest);

    if (journeyStatusId === journeyStatusMap?.waiting) {
      // company_target requests go through the company bid → assignment flow.
      // They must NEVER be auto-matched to individual drivers here.
      if (shipperRequest.requestMode === "company_target") {
        continue;
      }

      const nearbyDrivers = await findNearbyDrivers({ shipperRequest });
      for (const driver of nearbyDrivers) {
        const [documents, vehicle] = await Promise.all([
          getAttachedDocumentsByUserUniqueIdAndDocumentTypeId(
            driver?.userUniqueId,
            listOfDocumentsTypeAndId.profilePhoto,
          ),
          (async () => {
            const vd = await getVehicleDrivers({
              driverUserUniqueId: driver?.userUniqueId,
              assignmentStatus: "active",
              limit: 1,
              page: 1,
            });
            return vd?.data?.[0];
          })(),
        ]);
        const documentsData = documents?.data;
        const lastDataIndex = documentsData?.length - 1;
        const driverProfilePhoto =
          documentsData?.[lastDataIndex]?.attachedDocumentName;

        const journeyDecisionUniqueId = uuidv4();
        const journeyDecisionPayload = {
          journeyDecisionUniqueId,
          shipperRequestId,
          driverRequestId: driver.driverRequestId,
          journeyStatusId: journeyStatusMap.requested,
          decisionTime: currentDate(),
          decisionBy: "shipper",
          journeyDecisionCreatedBy: userUniqueId,
          journeyDecisionCreatedAt: currentDate(),
        };
        await insertData({
          tableName: "JourneyDecisions",
          colAndVal: journeyDecisionPayload,
        });
        await updateData({
          tableName: "ShipperRequest",
          conditions: {
            shipperRequestId,
          },
          updateValues: { journeyStatusId: journeyStatusMap.requested },
        });
        await updateData({
          tableName: "DriverRequest",
          conditions: { driverRequestId: driver.driverRequestId },
          updateValues: { journeyStatusId: journeyStatusMap.requested },
        });

        driver.journeyStatusId = journeyStatusMap.requested;
        shipperRequest.journeyStatusId = journeyStatusMap.requested;

        driversData.push({
          driver: { ...driver, driverProfilePhoto },
          vehicle: vehicle,
        });

        decisionsData.push(journeyDecisionPayload);

        if (driver?.phoneNumber && !notifiedDrivers.has(driver.phoneNumber)) {
          await sendSocketIONotificationToDriver({
            message: {
              messageTypes: messageTypes.driver_found_shipper_request,
              message: "success",
              status: journeyStatusMap.requested,
              shipper: shipperRequest,
              driver: {
                driver: { ...driver, driverProfilePhoto },
                vehicle: vehicle,
              },
              journey: null,
              decisions: journeyDecisionPayload,
              totalRecords: totalRecords,
              pageSize,
              page,
            },
            phoneNumber: driver?.phoneNumber,
          });
          notifiedDrivers.add(driver.phoneNumber);
        }
        driverFound = true;
      }

      drivers.push(...driversData);
      decisions.push(...decisionsData);
    } else {
      const filters = {
        shipperRequestId: shipperRequest?.shipperRequestId,
        journeyStatusIds: [
          journeyStatusMap.requested,
          journeyStatusMap.acceptedByDriver,
        ],
      };
      const decisionsDataRes = await getJourneyDecision4AllOrSingleUser({
        data: { filters },
      });

      for (let journeyDecision of decisionsDataRes?.formattedData || []) {
        decisions.push(journeyDecision);
        const journeyStatusIdInner = journeyDecision.journeyStatusId;
        if (journeyStatusIdInner >= journeyStatusMap?.journeyStarted) {
          journey = await getData({
            tableName: "Journey",
            conditions: {
              journeyDecisionUniqueId: journeyDecision?.journeyDecisionUniqueId,
            },
          });
        }

        const driverData = await performJoinSelect({
          baseTable: "DriverRequest",
          joins: [
            {
              table: "Users",
              on: "DriverRequest.userUniqueId = Users.userUniqueId",
            },
          ],
          conditions: {
            driverRequestId: journeyDecision?.driverRequestId,
          },
        });

        const driver = driverData[0];
        const documents =
          await getAttachedDocumentsByUserUniqueIdAndDocumentTypeId(
            driver?.userUniqueId,
            listOfDocumentsTypeAndId.profilePhoto,
          );

        const data = documents?.data;
        const lastDataIndex = data?.length - 1;
        const driverProfilePhoto = data?.[lastDataIndex]?.attachedDocumentName;
        const phoneNumber = driver?.phoneNumber;

        const vdResult = await getVehicleDrivers({
          driverUserUniqueId: driver?.userUniqueId,
          assignmentStatus: "active",
          limit: 1,
          page: 1,
        });
        const vehicleOfDriver = vdResult?.data;

        const driverInfo = {
          vehicleOfDriver: vehicleOfDriver?.[0],
          driver: { ...driver, driverProfilePhoto },
        };
        driversData.push(driverInfo);

        const matchingShipperRequest = shipper.find(
          (pr) => pr.shipperRequestId === journeyDecision.shipperRequestId,
        );

        const message = {
          messageTypes: messageTypes.driver_found_shipper_request,
          message: "success",
          status: driver?.journeyStatusId,
          shipper: matchingShipperRequest,
          driver: driverInfo,
          journey: journey?.length > 0 ? journey[0] : null,
          decision: journeyDecision || null,
        };
        if (
          sendNotificationsToDrivers &&
          phoneNumber &&
          !notifiedDrivers.has(phoneNumber)
        ) {
          await sendSocketIONotificationToDriver({
            message,
            phoneNumber,
          });
          notifiedDrivers.add(phoneNumber);
        }
      }
    }
  }
  if (driverFound) {
    const dataOfActiveRequest = await checkActiveShipperRequest({
      userUniqueId,
      pageSize,
      page,
    });
    activeRequest = dataOfActiveRequest?.activeRequests;
    totalRecords = dataOfActiveRequest?.totalRecords;
  }

  const cancellationNotifications = await getCancellationNotifications({
    userUniqueId,
    seenStatus: "not seen by shipper yet",
  });

  if (cancellationNotifications?.data?.length > 0) {
    const shipperUserData = await performJoinSelect({
      baseTable: "Users",
      joins: [],
      conditions: { userUniqueId },
    });
    const shipperPhoneNumber = shipperUserData?.[0]?.phoneNumber;

    for (const notification of cancellationNotifications.data) {
      if (shipperPhoneNumber) {
        const journeyStatusIdInner =
          notification.journeyDecision.journeyStatusId;
        const isDriverCancellation =
          journeyStatusIdInner === journeyStatusMap.cancelledByDriver;

        await sendSocketIONotificationToShipper({
          message: {
            messageTypes: isDriverCancellation
              ? messageTypes.driver_cancelled_request
              : messageTypes.admin_cancelled_request,
            message: "success",
            data: isDriverCancellation
              ? "Driver cancelled your request."
              : "Admin cancelled your request.",
            status: journeyStatusIdInner,
            shipper: notification.shipper ? [notification.shipper] : null,
            driver: notification.driver ? [notification.driver] : null,
            journey: notification.journey || null,
            decision: notification.journeyDecision || null,
          },
          phoneNumber: shipperPhoneNumber,
        });
      }
    }
  }

  return {
    totalRecords,
    pageSize,
    page,
  };
};

// verifyShipperStatus ends here

module.exports = {
  getRecentCompletedJourney,
  acceptDriverRequest,
  getAllActiveRequests,
  getShipperJourneyStatus,
  cancelShipperRequest,
  cancelShipperRequestBatch,
  createShipperRequest,
  updateRequestById,
  deleteRequest,
  getShipperRequestByShipperRequestId,
  rejectDriverOffer,
  getShipperRequest4allOrSingleUser,
  seenByShipper,
  verifyShipperStatus,
  getCancellationNotifications,
  markCancellationAsSeen,
};
