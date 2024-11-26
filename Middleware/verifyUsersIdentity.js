const { getData, performJoinSelect } = require("../CRUD/Read/ReadData");

// Verify if the user is an Admin and is in an active status
const verifyAdminsIdentity = async (req, res, next) => {
  const userUniqueId = req?.user?.userUniqueId;

  // Step 1: Check if the user exists
  const user = await getData({
    tableName: "Users",
    conditions: { userUniqueId },
  });

  if (!user[0]) {
    return res.status(500).json({
      message: "error",
      error: "User admin not found",
      status: null,
    });
  }

  // Step 2: Verify if the user has an Admin role
  const userRoles = await getData({
    tableName: "UserRole",
    conditions: { userUniqueId, roleId: 3 }, // 3 indicates the Admin role
  });

  if (!userRoles?.length) {
    return res.status(500).json({
      message: "error",
      error: "User admin role not found",
      status: null,
    });
  }

  // Step 3: Check if the Admin is in an active status
  const adminRole = userRoles[0];
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
        error: "User driver role not found",
        status: null,
      });
    }

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

    const statusId = userRoleStatus[0]?.statusId;
    if (statusId !== 1) {
      return res.status(403).json({
        message: "error",
        status: "Driver in inactive status",
        userRoleStatus: userRoleStatus[0],
      });
    }

    // Proceed to the next middleware if the Driver is valid and active
    next();
  } catch (error) {
    return res.status(500).json({
      message: "error",
      error: error.message,
      status: null,
    });
  }
};

// Verify if the user is a Passenger and is in an active status
const verifyPassengersIdentity = async (req, res, next) => {
  const userUniqueId = req?.user.userUniqueId;

  // Step 1: Check if the user exists
  const user = await getData({
    tableName: "Users",
    conditions: { userUniqueId },
  });

  if (!user[0]) {
    return res.status(500).json({
      message: "error",
      error: "User passenger not found",
      status: null,
    });
  }

  // Step 2: Verify if the user has a Passenger role
  const userRoles = await getData({
    tableName: "UserRole",
    conditions: { userUniqueId, roleId: 1 }, // 1 indicates the Passenger role
  });

  if (!userRoles?.length) {
    return res.status(500).json({
      message: "error",
      error: "User passenger role not found",
      status: null,
    });
  }

  // Step 3: Check if the Passenger is in an active status
  const passengerRole = userRoles[0];
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
  verifyAdminsIdentity,
  verifyDriversIdentity,
  verifyPassengersIdentity,
};
