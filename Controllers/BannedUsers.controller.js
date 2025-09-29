const bannedUsersService = require("../Services/BannedUsers.service");
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

// Ban a user
const banUser = async (req, res) => {
  const user = req.user;
  const data = {
    ...req.body,
    bannedBy: user.userUniqueId,
  };

  await handleServiceResponse(bannedUsersService.banUser(data), res);
};

// Get all banned users with pagination and filtering
const getBannedUsers = async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const filters = { ...req.query };

  await handleServiceResponse(bannedUsersService.getBannedUsers(filters), res);
};

// Get a specific banned user by ID
const getBannedUserById = async (req, res) => {
  const { banUniqueId } = req.params;

  await handleServiceResponse(
    bannedUsersService.getBannedUserById(banUniqueId),
    res
  );
};

// Update a banned user record
const updateBannedUser = async (req, res) => {
  const { banUniqueId } = req.params;
  const data = req.body;

  await handleServiceResponse(
    bannedUsersService.updateBannedUser(banUniqueId, data),
    res
  );
};

// Unban a user (delete banned record)
const unbanUser = async (req, res) => {
  const { banUniqueId } = req.params;

  await handleServiceResponse(bannedUsersService.unbanUser(banUniqueId), res);
};

// Get banned user by user ID
const getBannedUserByUserId = async (req, res) => {
  const { userUniqueId } = req.params;

  await handleServiceResponse(
    bannedUsersService.getBannedUserByUserId(userUniqueId),
    res
  );
};

// Check if a user is currently banned
const checkIfUserIsBanned = async (req, res) => {
  const { userUniqueId } = req.params;

  await handleServiceResponse(
    bannedUsersService.checkIfUserIsBanned(userUniqueId),
    res
  );
};

// Get banned users statistics
const getBannedUsersStats = async (req, res) => {
  await handleServiceResponse(bannedUsersService.getBannedUsersStats(), res);
};

module.exports = {
  banUser,
  getBannedUsers,
  getBannedUserById,
  updateBannedUser,
  unbanUser,
  getBannedUserByUserId,
  checkIfUserIsBanned,
  getBannedUsersStats,
};
