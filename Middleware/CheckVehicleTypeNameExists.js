const AppError = require("../Utils/AppError");
const { getData } = require("../CRUD/Read/ReadData");

const checkVehicleTypeNameExists = async (req, res, next) => {
  try {
    const vehicleTypeName = req?.body?.vehicleTypeName;

    if (!vehicleTypeName) {
      return next();
    }

    const existing = await getData({
      tableName: "VehicleTypes",
      conditions: { vehicleTypeName },
    });

    if (existing?.length > 0) {
      return next(
        new AppError(
          {
            message: "Vehicle type already exists",
            code: "VEHICLE_TYPE_ALREADY_EXISTS",
            details: [{ field: "vehicleTypeName", message: "Already exists" }],
          },
          AppError.BAD_REQUEST,
        ),
      );
    }

    return next();
  } catch (error) {
    return next(
      new AppError(
        {
          message: "Unable to validate vehicle type name",
          code: "VEHICLE_TYPE_NAME_CHECK_FAILED",
          details: { error: error?.message },
        },
        AppError.INTERNAL_SERVER_ERROR,
      ),
    );
  }
};

module.exports = checkVehicleTypeNameExists;
