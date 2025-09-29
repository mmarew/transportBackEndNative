const express = require("express");
const router = express.Router();
const bannedUsersController = require("../Controllers/BannedUsers.controller");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");
const { registerRoutes } = require("../Utils/RouteUtils");

const routes = [
  {
    path: "/api/admin/banned-users",
    method: "post",
    middleware: [verifyTokenOfAxios],
    handler: bannedUsersController.banUser,
  },
  {
    path: "/api/admin/banned-users",
    method: "get",
    middleware: [verifyTokenOfAxios],
    handler: bannedUsersController.getBannedUsers,
  },
  {
    path: "/api/admin/banned-users/:banUniqueId",
    method: "get",
    middleware: [verifyTokenOfAxios],
    handler: bannedUsersController.getBannedUserById,
  },
  {
    path: "/api/admin/banned-users/:banUniqueId",
    method: "put",
    middleware: [verifyTokenOfAxios],
    handler: bannedUsersController.updateBannedUser,
  },
  {
    path: "/api/admin/banned-users/:banUniqueId",
    method: "delete",
    middleware: [verifyTokenOfAxios],
    handler: bannedUsersController.unbanUser,
  },
  {
    path: "/api/admin/banned-users/user-role/:userRoleUniqueId",
    method: "get",
    middleware: [verifyTokenOfAxios],
    handler: bannedUsersController.getBannedUserByUserRole,
  },
  {
    path: "/api/admin/banned-users/user-role/:userRoleUniqueId/check",
    method: "get",
    middleware: [verifyTokenOfAxios],
    handler: bannedUsersController.checkIfUserRoleIsBanned,
  },
  {
    path: "/api/admin/banned-users/:banUniqueId/deactivate",
    method: "patch",
    middleware: [verifyTokenOfAxios],
    handler: bannedUsersController.deactivateBan,
  },
  {
    path: "/api/admin/banned-users-stats",
    method: "get",
    middleware: [verifyTokenOfAxios],
    handler: bannedUsersController.getBannedUsersStats,
  },
];

registerRoutes(router, routes);
module.exports = router;
