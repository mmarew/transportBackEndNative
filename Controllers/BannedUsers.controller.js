const bannedUsersService = require("../Services/BannedUsers.service");
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

const banUser = async (req, res) => {
  const user = req.user;
  const data = {
    ...req.body,
    bannedBy: user.userUniqueId,
  };

  await handleServiceResponse(bannedUsersService.banUser(data), res);
};

const getBannedUsers = async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const filters = { ...req.query };

  await handleServiceResponse(bannedUsersService.getBannedUsers(filters), res);
};

const getBannedUserById = async (req, res) => {
  const { banUniqueId } = req.params;

  await handleServiceResponse(
    bannedUsersService.getBannedUserById(banUniqueId),
    res
  );
};

const updateBannedUser = async (req, res) => {
  const { banUniqueId } = req.params;
  const data = req.body;

  await handleServiceResponse(
    bannedUsersService.updateBannedUser(banUniqueId, data),
    res
  );
};

const unbanUser = async (req, res) => {
  const { banUniqueId } = req.params;

  await handleServiceResponse(bannedUsersService.unbanUser(banUniqueId), res);
};

const getBannedUserByUserRole = async (req, res) => {
  const { userRoleUniqueId } = req.params;

  await handleServiceResponse(
    bannedUsersService.getBannedUserByUserRole(userRoleUniqueId),
    res
  );
};

const checkIfUserRoleIsBanned = async (req, res) => {
  const { userRoleUniqueId } = req.params;

  await handleServiceResponse(
    bannedUsersService.checkIfUserRoleIsBanned(userRoleUniqueId),
    res
  );
};

const deactivateBan = async (req, res) => {
  const { banUniqueId } = req.params;

  await handleServiceResponse(
    bannedUsersService.deactivateBan(banUniqueId),
    res
  );
};

const getBannedUsersStats = async (req, res) => {
  await handleServiceResponse(bannedUsersService.getBannedUsersStats(), res);
};

module.exports = {
  banUser,
  getBannedUsers,
  getBannedUserById,
  updateBannedUser,
  unbanUser,
  getBannedUserByUserRole,
  checkIfUserRoleIsBanned,
  deactivateBan,
  getBannedUsersStats,
};
