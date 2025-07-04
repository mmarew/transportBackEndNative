const { getData, performJoinSelect } = require("../CRUD/Read/ReadData");

// Verify if the user is an Admin and is in an active status
const verifyAdminsIdentity = async (req, res, next) => {
  const userUniqueId = req?.user?.userUniqueId;

  // Step 2: Verify if the user has an Admin role
  const userRole = await getData({
    tableName: "UserRole",
    conditions: { userUniqueId, roleId: 3 }, // 3 indicates the Admin role
  });

  if (!userRole?.length) {
    return res.status(500).json({
      message: "error",
      error: "User admin role not found",
      status: null,
    });
  }
  req.userRole = userRole;
  // Step 3: Check if the Admin is in an active status
  const adminRole = userRole[0];
  const userRoleStatus = await performJoinSelect({
    baseTable: "UserRoleStatusCurrent",
    joins: [
      {
        table: "Statuses",
        on: "Statuses.statusId = UserRoleStatusCurrent.statusId",
      },
    ],
    conditions: {
      "UserRoleStatusCurrent.userRoleId": adminRole.userRoleId,
    },
    orderBy: "userRoleStatusCreatedAt",
    orderDirection: "DESC",
    limit: 1,
  });

  if (userRoleStatus.length === 0) {
    return res.status(500).json({
      message: "error",
      error: "Admin's user role status not found",
      status: null,
    });
  }
  req.userRoleStatus = userRoleStatus;
  // Step 4: Check if the Admin is in Active status
  const statusId = userRoleStatus[0]?.statusId;
  if (statusId !== 1) {
    return res.status(403).json({
      message: "error",
      status: "Admin in inactive status",
      userRoleStatus: userRoleStatus[0],
    });
  }

  // Proceed to the next middleware if the Admin is valid and active
  next();
};

// Verify if the user is a Driver and is in an active status
const verifyDriversIdentity = async (req, res, next) => {
  try {
    const userUniqueId = req?.user?.userUniqueId;
    // Step 2: Verify if the user has a Driver role
    const userRoles = await getData({
      tableName: "UserRole",
      conditions: { userUniqueId, roleId: 2 }, // 2 indicates the Driver role
    });

    if (!userRoles?.length) {
      return res.status(500).json({
        message: "error",
        error: "Sorry, you are not a valid driver.",
        status: null,
      });
    }
    req.userRole = userRoles[0];
    // Step 3: Check if the Driver is in an active status
    const driverRole = userRoles[0];
    const userRoleStatus = await performJoinSelect({
      baseTable: "UserRoleStatusCurrent",
      joins: [
        {
          table: "Statuses",
          on: "Statuses.statusId = UserRoleStatusCurrent.statusId",
        },
      ],
      conditions: {
        "UserRoleStatusCurrent.userRoleId": driverRole.userRoleId,
      },
    });
    if (userRoleStatus.length === 0) {
      return res.status(500).json({
        message: "error",
        error: "User role status of driver not found",
        status: null,
      });
    }
    req.userRoleStatus = userRoleStatus[0];
    const statusId = userRoleStatus[0]?.statusId;
    if (statusId !== 1) {
      return res.status(403).json({
        message: "error",
        error: "Driver in inactive status",
        userRoleStatus: userRoleStatus[0],
      });
    }

    // Proceed to the next middleware if the Driver is valid and active
    next();
  } catch (error) {
    console.log("@verifyDriversIdentity error", error);
    return res.status(500).json({
      message: "error",
      error: error.message,
      status: null,
    });
  }
};
// Verify if the user is NOT a Driver
const verifyIfOperationIsAllowedByUserDriver = async (req, res, next) => {
  try {
    const userUniqueId = req?.user?.userUniqueId;
    // You can get the full URL using req.originalUrl or req.baseUrl + req.path
    // For example:
    const fullUrl = req.originalUrl;
    console.log("Request URL:", fullUrl);
    // Step 1: Check if the user has a Driver role
    const userRoles = await getData({
      tableName: "UserRole",
      conditions: { userUniqueId, roleId: 2 }, // 2 indicates the Driver role
    });

    // If user has driver role, reject the request
    if (userRoles?.length > 0) {
      if (fullUrl == "/api/user/updateUser/self") {
        return next();
      }
      console.log("@not allowed action to driver");
      return res.status(403).json({
        message: "error",
        error: "This action is not allowed for drivers.",
        status: null,
      });
    }

    // If user doesn't have driver role, proceed to next middleware
    next();
  } catch (error) {
    console.log("@verifyIfUserIsNotDriver error", error);
    return res.status(500).json({
      message: "error",
      error: error.message,
      status: null,
    });
  }
}; // Verify if the user is a Passenger and is in an active status
const verifyPassengersIdentity = async (req, res, next) => {
  const userUniqueId = req?.user.userUniqueId;

  // Step 2: Verify if the user has a Passenger role
  const userRole = await getData({
    tableName: "UserRole",
    conditions: { userUniqueId, roleId: 1 }, // 1 indicates the Passenger role
  });

  if (!userRole?.length) {
    return res.status(500).json({
      message: "error",
      error: "User passenger role not found",
      status: null,
    });
  }
  req.userRole = userRole;

  // Step 3: Check if the Passenger is in an active status
  const passengerRole = userRole[0];
  const userRoleStatus = await performJoinSelect({
    baseTable: "UserRoleStatusCurrent",
    joins: [
      {
        table: "Statuses",
        on: "Statuses.statusId = UserRoleStatusCurrent.statusId",
      },
    ],
    conditions: {
      "UserRoleStatusCurrent.userRoleId": passengerRole.userRoleId,
    },
    orderBy: "userRoleStatusCreatedAt",
    orderDirection: "DESC",
    limit: 1,
  });

  if (userRoleStatus.length === 0) {
    return res.status(500).json({
      message: "error",
      error: "User passenger role status not found",
      status: null,
    });
  }
  req.userRoleStatus = userRoleStatus;
  const statusId = userRoleStatus[0]?.statusId;
  if (statusId !== 1) {
    return res.status(403).json({
      message: "error",
      status: "Passenger in inactive status",
      userRoleStatus: userRoleStatus[0],
    });
  }

  // Proceed to the next middleware if the Passenger is valid and active
  next();
};

module.exports = {
  verifyIfOperationIsAllowedByUserDriver,
  verifyAdminsIdentity,
  verifyDriversIdentity,
  verifyPassengersIdentity,
};
