const commissionService = require("../Services/Commission.service");
const ServerResponder = require("../Utils/ServerResponder");

// Create a new commission record
exports.createCommission = async (req, res) => {
  try {
    const result = await commissionService.createCommission(req.body);
    ServerResponder(res, result);
  } catch (error) {
    ServerResponder(res, {
      message: "error",
      error: "Failed to create commission record",
    });
  }
};

// Get all commission records
exports.getAllCommissions = async (req, res) => {
  try {
    const result = await commissionService.getAllCommissions();
    ServerResponder(res, result);
  } catch (error) {
    console.log("@");
    ServerResponder(res, {
      message: "error",
      error: "Failed to retrieve commission records",
    });
  }
};

// Get a commission record by ID
exports.getCommissionByUserUniqueId = async (req, res) => {
  try {
    let userUniqueId = req?.params?.userUniqueId;
    const user = req?.user;
    console.log(
      "@getCommissionByUserUniqueId userUniqueId   =====================> ",
      userUniqueId,
      " user",
      user
    );
    if (userUniqueId == "self") userUniqueId = user?.userUniqueId;
    const result = await commissionService.getCommissionByUserUniqueId(
      userUniqueId
    );
    console.log(
      "@getCommissionByUserUniqueId userUniqueId   =====================> ",
      userUniqueId,
      "result",
      result
    );
    if (result) {
      ServerResponder(res, result);
    } else {
      ServerResponder(res, {
        message: "error",
        error: "Commission record not found",
      });
    }
  } catch (error) {
    console.log("@getCommissionByUserUniqueId error", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to retrieve commission record",
    });
  }
};

// Update a commission record by ID
exports.updateCommission = async (req, res) => {
  try {
    const result = await commissionService.updateCommission(
      req.params.id,
      req.body
    );
    rServerResponder(res, result);
  } catch (error) {
    ServerResponder(res, {
      message: "Failed to update commission record",
      error,
    });
  }
};

// Delete a commission record by ID
exports.deleteCommission = async (req, res) => {
  try {
    const result = await commissionService.deleteCommission(req.params.id);
    ServerResponder(res, result);
  } catch (error) {
    ServerResponder(res, {
      message: "Failed to delete commission record",
      error,
    });
  }
};
