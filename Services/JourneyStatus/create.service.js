"use strict";

const {
  v4: uuidv4
} = require("uuid");
const {
  pool
} = require("../../Middleware/Database.config");
const {
  getData
} = require("../../CRUD/Read/ReadData");


const {
  insertData
} = require("../../CRUD/Create/CreateData");
const {
  currentDate
} = require("../../Utils/CurrentDate");



const AppError = require("../../Utils/AppError");


// Create a new journey status

// Create a new journey status
const createJourneyStatus = async (body, user) => {
  const {
    journeyStatusName,
    journeyStatusDescription
  } = body;
  const journeyStatusUniqueId = body.journeyStatusUniqueId || uuidv4();
  const createdBy = user?.userUniqueId || journeyStatusUniqueId;

  // Check if the journey status already exists
  const existingJourneyStatus = await getData({
    tableName: "JourneyStatus",
    conditions: {
      journeyStatusName
    }
  });
  if (existingJourneyStatus.length > 0) {
    throw new AppError("Journey status already exists", 400);
  }
  const newJourneyStatus = {
    journeyStatusUniqueId,
    journeyStatusName,
    journeyStatusDescription,
    journeyStatusCreatedBy: createdBy,
    journeyStatusCreatedAt: currentDate()
  };
  if (body.journeyStatusId) {
    newJourneyStatus.journeyStatusId = body.journeyStatusId;
  }
  const result = await insertData({
    tableName: "JourneyStatus",
    colAndVal: newJourneyStatus
  });
  if (result.affectedRows > 0) {
    return {
      message: "Journey status created successfully",
      data: null
    };
  } else {
    throw new AppError("Failed to create journey status", 500);
  }
};

// Update a journey status by unique ID (dynamic)

module.exports = {
  createJourneyStatus
};
