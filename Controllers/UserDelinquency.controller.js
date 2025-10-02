const userDelinquencyService = require("../Services/UserDelinquency.service");
const ServerResponder = require("../Utils/ServerResponder");

const handleServiceResponse = async (serviceCall, res) => {
  try {
    const result = await serviceCall;
    ServerResponder(res, result);
  } catch (error) {
    console.error("Error:", error);
    ServerResponder(res, {
      message: "error",
      error: error.message || "Operation failed",
    });
  }
};

const createUserDelinquency = async (req, res) => {
  const user = req.user;
  const data = {
    ...req.body,
    delinquencyCreatedBy: user.userUniqueId,
  };

  await handleServiceResponse(
    userDelinquencyService.createUserDelinquency(data),
    res
  );
};

const getUserDelinquencies = async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const filters = { ...req.query };

  await handleServiceResponse(
    userDelinquencyService.getUserDelinquencies(filters),
    res
  );
};


const updateUserDelinquency = async (req, res) => {
  const { userDelinquencyUniqueId } = req.params;
  const data = req.body;

  await handleServiceResponse(
    userDelinquencyService.updateUserDelinquency(userDelinquencyUniqueId, data),
    res
  );
};

const deleteUserDelinquency = async (req, res) => {
  const { userDelinquencyUniqueId } = req.params;

  await handleServiceResponse(
    userDelinquencyService.deleteUserDelinquency(userDelinquencyUniqueId),
    res
  );
};



const checkAutomaticBan = async (req, res) => {
  const { userRoleUniqueId } = req.params;

  await handleServiceResponse(
    userDelinquencyService.checkAutomaticBan(userRoleUniqueId),
    res
  );
};

module.exports = {
  createUserDelinquency,
  getUserDelinquencies,
  updateUserDelinquency,
  deleteUserDelinquency,
  checkAutomaticBan,
};
