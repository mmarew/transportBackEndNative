const ServerResponder = require("../Utils/ServerResponder");
const {
  createVehicleDriver,
  getVehicleDrivers,
  updateVehicleDriverByUniqueId,
  deleteVehicleDriverByUniqueId,
} = require("../Services/VehicleDriver.service");
const { accountStatus } = require("../Services/Account");
const { usersRoles } = require("../Utils/ListOfSeedData");
const logger = require("../Utils/logger");
const { executeInTransaction } = require("../Utils/DatabaseTransaction");
const { HTTP_STATUS } = require("../Utils/Constants");

// Shared helper — recalculates driver status on pool AFTER transaction is done.
// Must be called outside executeInTransaction to avoid holding write locks.
const refreshDriverStatus = async (driverUserUniqueId) => {
  if (!driverUserUniqueId) {return;}
  try {
    await accountStatus({
      ownerUserUniqueId: driverUserUniqueId,
      body: { roleId: usersRoles.driverRoleId },
    });
  } catch (err) {
    logger.warn("Driver status refresh failed (non-critical)", {
      driverUserUniqueId,
      error: err.message,
    });
  }
};

// POST /api/vehicleDriver
const createVehicleDriverController = async (req, res, next) => {
  try {
    const body = req.body || {};
    const vehicleDriverCreatedBy = req.user?.userUniqueId;

    // ── 1. Write only: transaction commits and releases connection immediately
    const result = await executeInTransaction(async () => {
      return await createVehicleDriver({ ...body, vehicleDriverCreatedBy });
    });

    // ── 2. Status recalc AFTER commit — uses a fresh pool connection, no locks
    await refreshDriverStatus(body.driverUserUniqueId);

    ServerResponder(res, result, HTTP_STATUS.CREATED);
  } catch (error) {
    next(error);
  }
};

// GET /api/vehicleDriver
const getVehicleDriversController = async (req, res, next) => {
  try {
    const filters = req.query || {};
    const driverUserUniqueId = req?.query?.driverUserUniqueId;
    if (driverUserUniqueId === "self") {
      filters.driverUserUniqueId = req?.user?.userUniqueId;
    } else if (driverUserUniqueId === "all") {
      delete filters.driverUserUniqueId;
    } else if (driverUserUniqueId) {
      filters.driverUserUniqueId = driverUserUniqueId;
    }
    // Note: if driverUserUniqueId is not provided at all, we keep the filters as is (which might include it from req.query)
    logger.info("@getVehicleDriversController filters", filters);
    const result = await getVehicleDrivers(filters);
    ServerResponder(res, result, HTTP_STATUS.OK);
  } catch (error) {
    next(error);
  }
};

// PUT /api/vehicleDriver/:vehicleDriverUniqueId
const updateVehicleDriverController = async (req, res, next) => {
  try {
    const { vehicleDriverUniqueId } = req.params;
    const body = req.body || {};

    // ── 1. Write only transaction
    const result = await executeInTransaction(async () => {
      return await updateVehicleDriverByUniqueId(vehicleDriverUniqueId, body);
    });

    // ── 2. Status recalc after commit using driverUserUniqueId returned by service
    await refreshDriverStatus(result?.data?.driverUserUniqueId);

    ServerResponder(res, result, HTTP_STATUS.OK);
  } catch (error) {
    next(error);
  }
};

// DELETE /api/vehicleDriver/:vehicleDriverUniqueId
const deleteVehicleDriverController = async (req, res, next) => {
  try {
    const { vehicleDriverUniqueId } = req.params;

    // ── 1. Write only transaction
    const result = await executeInTransaction(async () => {
      return await deleteVehicleDriverByUniqueId(vehicleDriverUniqueId);
    });

    // ── 2. Status recalc after commit
    await refreshDriverStatus(result?.data?.driverUserUniqueId);

    ServerResponder(res, result, HTTP_STATUS.OK);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createVehicleDriverController,
  getVehicleDriversController,
  updateVehicleDriverController,
  deleteVehicleDriverController,
};
