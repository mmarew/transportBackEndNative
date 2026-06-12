// Vehicles E2E Tests Export

const { testVehicleTypeWorkflow, testGetVehicleTypes } = require("./VehicleType");
const { testVehicleStatusTypeWorkflow, testGetVehicleStatusTypes } = require("./VehicleStatusType");
const { testVehicleOwnershipWorkflow, testGetVehicleOwnerships } = require("./VehicleOwnership");
const { testVehicleDriverWorkflow, testGetVehicleDrivers } = require("./VehicleDriver");

module.exports = {
  testVehicleTypeWorkflow,
  testGetVehicleTypes,
  testVehicleStatusTypeWorkflow,
  testGetVehicleStatusTypes,
  testVehicleOwnershipWorkflow,
  testGetVehicleOwnerships,
  testVehicleDriverWorkflow,
  testGetVehicleDrivers,
};
