const VEHICLE_ENDPOINTS = {
  CREATE_VEHICLE: "/api/user/vehicles/driverUserUniqueId/:driverUserUniqueId",
  GET_ALL_VEHICLES: "/api/vehicles",
  UPDATE_VEHICLE: "/api/user/vehicles/:vehicleUniqueId",
  DELETE_VEHICLE: "/api/user/vehicles/:vehicleUniqueId",
};

module.exports = {
  VEHICLE_ENDPOINTS,
};
