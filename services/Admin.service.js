const { performJoinSelect } = require("../CRUD/Read/ReadData");
const { pool } = require("../Middleware/Database.config");
const {
  verifyUsersDocumentStatus,
  getAttachedDocumentsByUser,
} = require("./attachedDocuments.service");

const adminServices = {
  // Service to get users by roleId (1 for passengers, 2 for drivers)
  getUsersByRole: async (roleId) => {
    const users = await performJoinSelect({
      baseTable: "Users",
      joins: [
        {
          table: "UserRole",
          on: "Users.userUniqueId = UserRole.userUniqueId",
        },
      ],
      conditions: {
        "UserRole.roleId": roleId, // Filter users based on roleId (1 for passengers, 2 for drivers)
      },
    });

    return users;
  },
  // Fetch all cancellations
  getAllCancellations: async (req) => {
    const query = `
    SELECT 
      jd.*,
      dw.*,
      pr.*,
      di.*,
      p.*
    FROM 
      journeyDecisions jd
    INNER JOIN 
      driverWaits dw ON jd.driverWaitUniqueId = dw.waitUniqueId
    INNER JOIN 
      PassengerRequest pr ON jd.passengerRequestUniqueId = pr.requestUniqueId
    INNER JOIN 
      Users di ON dw.driverUniqueId = di.driverUniqueId
    INNER JOIN 
      passenger p ON pr.userUniqueId = p.userUniqueId
    WHERE 
      jd.decision IN ('cancelled by passenger', 'cancelled by driver')
    ORDER BY 
      jd.decisionTime DESC
  `;
    const [results] = await pool.query(query);
    return results;
  },

  // Fetch cancellations by drivers
  getCanceledByDrivers: async (req) => {
    const query = `
    SELECT 
      journeyDecisions.*, 
      Users.*, 
      driverWaits.*, 
      Users.*
    FROM 
      journeyDecisions
    JOIN 
      driverWaits ON journeyDecisions.driverWaitUniqueId = driverWaits.waitUniqueId
    JOIN 
      Users ON driverWaits.driverUniqueId = Users.driverUniqueId
    JOIN 
      PassengerRequest ON journeyDecisions.passengerRequestUniqueId = PassengerRequest.requestUniqueId
    JOIN 
      passenger ON PassengerRequest.userUniqueId = Users.userUniqueId
    WHERE 
      journeyDecisions.decision = 'cancelled by driver'
    ORDER BY 
      journeyDecisions.decisionTime DESC;
  `;
    const [results] = await pool.query(query);
    return results;
  },

  // Fetch cancellations by passengers
  getCanceledByPassenger: async (req) => {
    const query = `
    SELECT 
      journeyDecisions.*, 
      Users.*, 
      driverWaits.*, 
      Users.*
    FROM 
      journeyDecisions
    JOIN 
      driverWaits ON journeyDecisions.driverWaitUniqueId = driverWaits.waitUniqueId
    JOIN 
      Users ON driverWaits.driverUniqueId = Users.driverUniqueId
    JOIN 
      PassengerRequest ON journeyDecisions.passengerRequestUniqueId = PassengerRequest.requestUniqueId
    JOIN 
      passenger ON PassengerRequest.userUniqueId = Users.userUniqueId
    WHERE 
      journeyDecisions.decision = 'cancelled by passenger'
    ORDER BY 
      journeyDecisions.decisionTime DESC;
  `;
    const [results] = await pool.query(query);
    return results;
  },
  // Fetch cancellations by a specific passenger
  getCanceledByPassengerById: async (userUniqueId, req) => {
    const query = `
    SELECT 
      journeyDecisions.*, 
      Users.*, 
      driverWaits.*, 
      Users.*
    FROM 
      journeyDecisions
    JOIN 
      driverWaits ON journeyDecisions.driverWaitUniqueId = driverWaits.waitUniqueId
    JOIN 
      Users ON driverWaits.driverUniqueId = Users.driverUniqueId
    JOIN 
      PassengerRequest ON journeyDecisions.passengerRequestUniqueId = PassengerRequest.requestUniqueId
    JOIN 
      passenger ON PassengerRequest.userUniqueId = Users.userUniqueId
    WHERE 
      journeyDecisions.decision = 'cancelled by passenger'
      AND Users.userUniqueId = ?
    ORDER BY 
      journeyDecisions.decisionTime DESC;
  `;
    const [results] = await pool.query(query, [userUniqueId]);
    return results;
  },

  // Fetch cancellations by a specific driver
  getCanceledByDriverById: async (driverId, req) => {
    const query = `
    SELECT 
      journeyDecisions.*, 
      Users.*, 
      driverWaits.*, 
      Users.*
    FROM 
      journeyDecisions
    JOIN 
      driverWaits ON journeyDecisions.driverWaitUniqueId = driverWaits.waitUniqueId
    JOIN 
      Users ON driverWaits.driverUniqueId = Users.driverUniqueId
    JOIN 
      PassengerRequest ON journeyDecisions.passengerRequestUniqueId = PassengerRequest.requestUniqueId
    JOIN 
      passenger ON PassengerRequest.userUniqueId = Users.userUniqueId
    WHERE 
      journeyDecisions.decision = 'cancelled by driver'
      AND Users.driverUniqueId = ?
    ORDER BY 
      journeyDecisions.decisionTime DESC;
  `;
    const [results] = await pool.query(query, [driverId]);
    return results;
  },

  // Fetch completed journeys
  getCompletedJourney: async (req) => {
    const query = `
    SELECT 
      journeyDecisions.*, 
      Users.*, 
      driverWaits.*, 
      Users.*
    FROM 
      journeyDecisions
    JOIN 
      driverWaits ON journeyDecisions.driverWaitUniqueId = driverWaits.waitUniqueId
    JOIN 
      Users ON driverWaits.driverUniqueId = Users.driverUniqueId
    JOIN 
      PassengerRequest ON journeyDecisions.passengerRequestUniqueId = PassengerRequest.requestUniqueId
    JOIN 
      passenger ON PassengerRequest.userUniqueId = Users.userUniqueId
    WHERE 
      journeyDecisions.decision = 'completed'
    ORDER BY 
      journeyDecisions.decisionTime DESC;
  `;
    const [results] = await pool.query(query);
    return results;
  },

  // Get completed journeys by passengerId
  getCompletedJourneyByPassenger: async (passengerId) => {
    const query = `
      SELECT 
        journeyDecisions.*, 
        Users.*, 
        driverWaits.*, 
        Users.*
      FROM 
        journeyDecisions
      JOIN 
        driverWaits ON journeyDecisions.driverWaitUniqueId = driverWaits.waitUniqueId
      JOIN 
        Users ON driverWaits.driverUniqueId = Users.driverUniqueId
      JOIN 
        PassengerRequest ON journeyDecisions.passengerRequestUniqueId = PassengerRequest.requestUniqueId
      JOIN 
        passenger ON PassengerRequest.userUniqueId = Users.userUniqueId
      WHERE 
        journeyDecisions.decision = 'completed'
        AND Users.userUniqueId = ?
      ORDER BY 
        journeyDecisions.decisionTime DESC;
    `;
    const [results] = await pool.query(query, [passengerId]);
    return results;
  },

  // Get completed journeys by driverId
  getCompletedJourneyByDriver: async (driverId) => {
    const query = `
      SELECT 
        journeyDecisions.*, 
        Users.*, 
        driverWaits.*, 
        Users.*
      FROM 
        journeyDecisions
      JOIN 
        driverWaits ON journeyDecisions.driverWaitUniqueId = driverWaits.waitUniqueId
      JOIN 
        Users ON driverWaits.driverUniqueId = Users.driverUniqueId
      JOIN 
        PassengerRequest ON journeyDecisions.passengerRequestUniqueId = PassengerRequest.requestUniqueId
      JOIN 
        passenger ON PassengerRequest.userUniqueId = Users.userUniqueId
      WHERE 
        journeyDecisions.decision = 'completed'
        AND Users.driverUniqueId = ?
      ORDER BY 
        journeyDecisions.decisionTime DESC;
    `;
    const [results] = await pool.query(query, [driverId]);
    return results;
  },

  // Fetch cancellations by a specific date
  getCancellationsByDate: async (date, req) => {
    const query = `
    SELECT 
      journeyDecisions.*, 
      Users.*, 
      driverWaits.*, 
      Users.*
    FROM 
      journeyDecisions
    JOIN 
      driverWaits ON journeyDecisions.driverWaitUniqueId = driverWaits.waitUniqueId
    JOIN 
      Users ON driverWaits.driverUniqueId = Users.driverUniqueId
    JOIN 
      PassengerRequest ON journeyDecisions.passengerRequestUniqueId = PassengerRequest.requestUniqueId
    JOIN 
      passenger ON PassengerRequest.userUniqueId = Users.userUniqueId
    WHERE 
      DATE(journeyDecisions.decisionTime) = ?
      AND journeyDecisions.decision IN ('cancelled by passenger', 'cancelled by driver')
    ORDER BY 
      journeyDecisions.decisionTime DESC;
  `;
    const [results] = await pool.query(query, [date]);
    return results;
  },

  // Update the cancellation reason for a specific cancellation ID
  updateCancellationReason: async (cancellationId, reason, req) => {
    const query = `
      UPDATE journeyDecisions 
      SET reason = ?
      WHERE decisionId = ?;
    `;
    const [results] = await pool.query(query, [reason, cancellationId]);
    return results;
  },

  // Delete a specific cancellation record
  deleteCancellation: async (cancellationId, req) => {
    const query = `
      DELETE FROM journeyDecisions 
      WHERE decisionId = ?;
    `;
    const [results] = await pool.query(query, [cancellationId]);
    return results;
  },
  getunAuthorizedDriver: async () => {
    // Fetch unauthorized users using a join query
    const sql = `select * from Users ,UserRole, UserRoleStatusCurrent where Users.userUniqueId = UserRole.userUniqueId and UserRole.userRoleId = UserRoleStatusCurrent.userRoleId and UserRoleStatusCurrent.statusId !=?`;
    const [unAuthorizedUsers] = await pool.query(sql, [1]);

    // console.log("unAuthorizedUsers", unAuthorizedUsers);
    // return unAuthorizedUsers;

    // Use Promise.all to wait for all verifyUsersDocumentStatus calls to resolve
    const usersWithDocuments = await Promise.all(
      unAuthorizedUsers.map(async (user) => {
        const ownerUserUniqueId = user.userUniqueId;
        const documents = await getAttachedDocumentsByUser(ownerUserUniqueId);
        return { ...user, documents }; // Return user along with documents
      })
    );

    return usersWithDocuments; // Return the array of users with their documents
  },
};

module.exports = adminServices;
