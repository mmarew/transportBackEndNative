const path = require("path");
const { v4: uuidv4 } = require("uuid");
const vehicleTypeService = require("../Services/VehicleType.service");
const ServerResponder = require("../Utils/ServerResponder");
const { uploadToFTP } = require("../Utils/FTPHandler");
const AppError = require("../Utils/AppError");
const { executeInTransaction } = require("../Utils/DatabaseTransaction");

exports.createVehicleType = async (req, res, next) => {
  try {
    if (!req.file) {
      return next(new AppError("Please attach vehicle type icon", 400));
    }

    const user = req.user;
    req.body.user = user;

    const fileExtension = path.extname(req.file.originalname);
    const uniqueFilename = `vehicle_${uuidv4()}${fileExtension}`;

    const result = await executeInTransaction(async () => {
      // 🔎 Check DB for duplicate name or icon
      await vehicleTypeService.checkVehicleTypeDuplicate({
        vehicleTypeName: req.body.vehicleTypeName,
        vehicleTypeIconName: fileUrl,
      });

      // 📤 Upload after confirming
      const uploadedUrl = await uploadToFTP(req.file.buffer, uniqueFilename);

      const data = {
        ...req.body,
        vehicleTypeIconName: uploadedUrl,
      };
      return await vehicleTypeService.createVehicleType(data);
    });

    return ServerResponder(res, result, 201);
  } catch (error) {
    next(error);
  }
};

exports.getVehicleTypesByfilter = async (req, res, next) => {
  try {
    const vehicleTypes = await vehicleTypeService.getVehicleTypesByfilter(req.query);
    ServerResponder(res, vehicleTypes);
  } catch (error) {
    next(error);
  }
};

exports.updateVehicleType = async (req, res, next) => {
  try {
    const data = {
      ...req.body,
      vehicleTypeUpdatedBy: req?.user?.userUniqueId,
    };

    const result = await executeInTransaction(async () => {
      return await vehicleTypeService.updateVehicleType(
        req.params.vehicleTypeUniqueId,
        data,
        req.file || null,
      );
    });

    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

exports.deleteVehicleType = async (req, res, next) => {
  try {
    const result = await executeInTransaction(async () => {
      return await vehicleTypeService.deleteVehicleType(
        req.params.vehicleTypeUniqueId,
        req?.user?.userUniqueId,
      );
    });
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};
