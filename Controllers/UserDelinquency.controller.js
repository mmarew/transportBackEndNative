const userDelinquencyService = require("../Services/UserDelinquency.service");
const ServerResponder = require("../Utils/ServerResponder");

// Helper function to handle service responses
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

// Create a new user delinquency record
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

// Get all user delinquencies with pagination and filtering
const getUserDelinquencies = async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const filters = { ...req.query };

  await handleServiceResponse(
    userDelinquencyService.getUserDelinquencies(filters),
    res
  );
};

// Get a specific user delinquency by ID
const getUserDelinquencyById = async (req, res) => {
  const { userDelinquencyUniqueId } = req.params;

  await handleServiceResponse(
    userDelinquencyService.getUserDelinquencyById(userDelinquencyUniqueId),
    res
  );
};

// Update a user delinquency record
const updateUserDelinquency = async (req, res) => {
  const { userDelinquencyUniqueId } = req.params;
  const data = req.body;

  await handleServiceResponse(
    userDelinquencyService.updateUserDelinquency(userDelinquencyUniqueId, data),
    res
  );
};

// Delete a user delinquency record
const deleteUserDelinquency = async (req, res) => {
  const { userDelinquencyUniqueId } = req.params;

  await handleServiceResponse(
    userDelinquencyService.deleteUserDelinquency(userDelinquencyUniqueId),
    res
  );
};

// Get delinquencies by specific user
const getUserDelinquenciesByUser = async (req, res) => {
  const { userUniqueId } = req.params;
  const { page = 1, limit = 10 } = req.query;

  await handleServiceResponse(
    userDelinquencyService.getUserDelinquenciesByUser(userUniqueId, {
      page: parseInt(page),
      limit: parseInt(limit),
    }),
    res
  );
};

// Get delinquency statistics
const getUserDelinquencyStats = async (req, res) => {
  await handleServiceResponse(
    userDelinquencyService.getUserDelinquencyStats(),
    res
  );
};

module.exports = {
  createUserDelinquency,
  getUserDelinquencies,
  getUserDelinquencyById,
  updateUserDelinquency,
  deleteUserDelinquency,
  getUserDelinquenciesByUser,
  getUserDelinquencyStats,
};
