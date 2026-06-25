"use strict";

const {
  performJoinSelect,
  
} = require("../../CRUD/Read/ReadData");
const {
  pool
} = require("../../Middleware/Database.config");



const {
  transactionStorage
} = require("../../Utils/TransactionContext");

// Helper function for database queries

// Helper function for database queries
const query = async (sql, values = []) => {
  const executor = transactionStorage.getStore() || pool;
  const [result] = await executor.query(sql, values);
  return result;
};

// Helper function to get journey data by context type

// Helper function to get journey data by context type
const getJourneyDataByContextType = async ({
  contextType,
  contextId
}) => {
  const dataHandlers = {
    JourneyDecisions: async () => {
      const [shipperData, driverData] = await Promise.all([getShipperDataByJourneyDecision(contextId), getDriverDataByJourneyDecision(contextId)]);
      return {
        driver: driverData,
        shipper: shipperData
      };
    },
    Journey: async () => {
      const [shipperData, driverData] = await Promise.all([getShipperDataByJourney(contextId), getDriverDataByJourney(contextId)]);
      return {
        driver: driverData,
        shipper: shipperData
      };
    },
    DriverRequest: async () => {
      const driverData = await getDriverRequest(contextId);
      return {
        driver: driverData,
        shipper: null
      };
    },
    ShipperRequest: async () => {
      const shipperData = await getShipperRequest(contextId);
      return {
        driver: null,
        shipper: shipperData
      };
    }
  };
  const handler = dataHandlers[contextType];
  if (!handler) {
    throw new Error(`Unsupported context type: ${contextType}`);
  }
  const data = await handler();
  return {
    ...data,
    contextType
  };
};

// Create a new canceled journey

// Helper functions for data retrieval (keep existing ones)
const getShipperDataByJourneyDecision = journeyDecisionId => performJoinSelect({
  baseTable: "JourneyDecisions",
  joins: [{
    table: "ShipperRequest",
    on: "JourneyDecisions.shipperRequestId = ShipperRequest.shipperRequestId"
  }, {
    table: "Users",
    on: "ShipperRequest.userUniqueId = Users.userUniqueId"
  }],
  conditions: {
    "JourneyDecisions.journeyDecisionId": journeyDecisionId
  }
});

const getDriverDataByJourneyDecision = journeyDecisionId => performJoinSelect({
  baseTable: "JourneyDecisions",
  joins: [{
    table: "DriverRequest",
    on: "JourneyDecisions.driverRequestId = DriverRequest.driverRequestId"
  }, {
    table: "Users",
    on: "DriverRequest.userUniqueId = Users.userUniqueId"
  }],
  conditions: {
    "JourneyDecisions.journeyDecisionId": journeyDecisionId
  }
});

const getShipperDataByJourney = async journeyId => {
  const record = await performJoinSelect({
    baseTable: "Journey",
    joins: [{
      table: "JourneyDecisions",
      on: "JourneyDecisions.journeyDecisionUniqueId = Journey.journeyDecisionUniqueId"
    }, {
      table: "ShipperRequest",
      on: "JourneyDecisions.shipperRequestId = ShipperRequest.shipperRequestId"
    }, {
      table: "Users",
      on: "ShipperRequest.userUniqueId = Users.userUniqueId"
    }],
    conditions: {
      "Journey.journeyId": journeyId
    }
  });
  return record;
};

const getDriverDataByJourney = async journeyId => await performJoinSelect({
  baseTable: "Journey",
  joins: [{
    table: "JourneyDecisions",
    on: "JourneyDecisions.journeyDecisionUniqueId = Journey.journeyDecisionUniqueId"
  }, {
    table: "DriverRequest",
    on: "JourneyDecisions.driverRequestId = DriverRequest.driverRequestId"
  }, {
    table: "Users",
    on: "DriverRequest.userUniqueId = Users.userUniqueId"
  }],
  conditions: {
    "Journey.journeyId": journeyId
  }
});

const getShipperRequest = shipperRequestId => query(`SELECT * FROM ShipperRequest 
     JOIN Users ON Users.userUniqueId = ShipperRequest.userUniqueId 
     WHERE shipperRequestId = ?`, [shipperRequestId]);

const getDriverRequest = driverRequestId => query(`SELECT * FROM DriverRequest 
     JOIN Users ON Users.userUniqueId = DriverRequest.userUniqueId 
     WHERE driverRequestId = ?`, [driverRequestId]);

module.exports = {
  query,
  getJourneyDataByContextType,
  getShipperDataByJourneyDecision,
  getDriverDataByJourneyDecision,
  getShipperDataByJourney,
  getDriverDataByJourney,
  getShipperRequest,
  getDriverRequest
};
