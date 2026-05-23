"use strict";

const { v4: uuidv4 } = require("uuid");
const { pool } = require("../../Middleware/Database.config");
const { transactionStorage } = require("../../Utils/TransactionContext");





const { currentDate} = require("../../Utils/CurrentDate");


// @param {Object} connection - Optional database connection for transaction support
const = async (data, connection = null) => {
  const {
    journeyDecisionUniqueId,
    startTime,
    endTime,
    fare,
    journeyStatusId,
    journeyCreatedBy,
  } = data;

  // Use transaction storage for transaction support, or fall back to provided connection or pool
  const queryExecutor = transactionStorage.getStore() || connection || pool;

  // Check if journey already exists
  const checkSql = `SELECT * FROM Journey WHERE journeyDecisionUniqueId = ?`;
  const [existingData] = await queryExecutor.query(checkSql, [
    journeyDecisionUniqueId,
  ]);

  if (existingData.length > 0) {
    return { message: "success", data: existingData };
  }

  const journeyUniqueId = uuidv4();
  const sql = `
    INSERT INTO Journey (journeyUniqueId, journeyDecisionUniqueId, startTime, endTime, fare, journeyStatusId, journeyCreatedBy, journeyCreatedAt) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const values = [
    journeyUniqueId,
    journeyDecisionUniqueId,
    startTime,
    endTime,
    fare,
    journeyStatusId,
    journeyCreatedBy,
    currentDate(),
  ];

  const [result] = await queryExecutor.query(sql, values);

  return {
    message: "success",
    data: [
      {
        journeyUniqueId,
        journeyDecisionUniqueId,
        startTime,
        endTime,
        fare,
        journeyStatusId,
        journeyId: result.insertId,
      },
    ],
  };
};
