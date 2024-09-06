const { pool } = require("../../Middleware/Database.config");

/**
 * Verifies the existence of data in a table using specified conditions.
 *
 * @param {Object} params - The parameters for the function.
 * @param {string} params.tableName - The name of the table to query.
 * @param {Object} params.conditions - An object containing column-value pairs for the conditions.
 * @param {string} [params.operator='AND'] - The logical operator to use between conditions ('AND' or 'OR').
 * @returns {Promise} - A promise that resolves with the first matching row or undefined if no match is found.
 */
const getData = async ({ tableName, conditions, operator = "AND" }) => {
  // Validate the operator
  if (operator !== "AND" && operator !== "OR") {
    throw new Error('Invalid operator. Only "AND" and "OR" are allowed.');
  }

  // Build the WHERE clause dynamically based on the conditions object
  const whereClause = Object.keys(conditions)
    .map((col) => {
      const value = conditions[col];
      if (Array.isArray(value)) {
        // If the value is an array, use the IN clause
        const placeholders = value.map(() => "?").join(", ");
        return `${col} IN (${placeholders})`;
      } else {
        // Otherwise, use the standard equality check
        return `${col} = ?`;
      }
    })
    .join(` ${operator} `);
  // Flatten the values array, since some elements might be arrays themselves
  const values = Object.values(conditions).flat();
  const sqlQuery = `SELECT * FROM ${tableName} WHERE ${whereClause}`;
  try {
    const [result] = await pool.query(sqlQuery, values);
    return result; // Return the result set
  } catch (error) {
    console.error("Error querying data:", error);
    throw error;
  }
};

const findDriverForPassenger = async (userUniqueId) => {
  // find driver who is in waiting
  const driverRequestData = await getData({
    tableName: "Requests",
    conditions: { journeyStatusId: 1, requestType: "DRIVER" },
    operator: "AND",
  });
  let driverUserUniqueId = null,
    userDriverInfo = null;
  // if driver found
  if (driverRequestData.length > 0) {
    driverUserUniqueId = driverRequestData[0]?.userUniqueId;
    // find detailes of driver
    userDriverInfo = await getData({
      tableName: "Users",
      conditions: { userUniqueId: driverUserUniqueId },
      operator: "AND",
    });
    return { ...userDriverInfo[0], ...driverRequestData[0] };
  } else {
    console.log("no driver found");
    return null;
  }
};
const findPassengerForDriver = async (userUniqueId) => {
  const driverData = await getData({
    tableName: "Requests",
    conditions: { journeyStatusId: 1, requestType: "PASSENGER" },
    operator: "AND",
  });
  return driverData[0];
};
const performJoinSelect = async ({
  baseTable,
  joins = [],
  conditions = {},
  operator = "AND",
}) => {
  // Validate the operator
  if (operator !== "AND" && operator !== "OR") {
    throw new Error('Invalid operator. Only "AND" and "OR" are allowed.');
  }

  // Build the WHERE clause dynamically based on the conditions object
  const whereClause = Object.keys(conditions)
    .map((col) => {
      const value = conditions[col];
      if (Array.isArray(value)) {
        // If the value is an array, use the IN clause
        const placeholders = value.map(() => "?").join(", ");
        return `${col} IN (${placeholders})`;
      } else {
        // Otherwise, use the standard equality check
        return `${col} = ?`;
      }
    })
    .join(` ${operator} `);

  // Flatten the values array, since some elements might be arrays themselves
  const values = Object.values(conditions).flat();

  // Build the JOIN clauses dynamically
  const joinClauses = joins
    .map(({ table, on }) => `JOIN ${table} ON ${on}`)
    .join(" ");

  // Combine everything into a complete SQL query
  const sqlQuery = `SELECT * FROM ${baseTable} ${joinClauses} WHERE ${whereClause}`;

  try {
    const [result] = await pool.query(sqlQuery, values);
    return result; // Return the result set
  } catch (error) {
    console.error("Error querying data:", error);
    throw error;
  }
};
// const result = await performJoinSelect({
//   baseTable: "Requests",
//   joins: [
//     {
//       table: "Users",
//       on: "Requests.userUniqueId = Users.userUniqueId",
//     },
//     // You can add more joins if needed
//   ],
//   conditions: {
//     "Users.userUniqueId": "some-unique-id",
//     "Requests.requestType": "PASSENGER",
//     "Requests.journeyStatusId": [1, 2, 3], // Multiple values using IN
//   },
// });

module.exports = {
  performJoinSelect,
  findDriverForPassenger,
  findPassengerForDriver,
  getData,
};
