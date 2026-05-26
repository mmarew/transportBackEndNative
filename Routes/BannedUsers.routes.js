const express = require("express");
const router = express.Router();
const bannedUsersController = require("../Controllers/BannedUsers.controller");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");
const { registerRoutes } = require("../Utils/RouteUtils");

const { validator } = require("../Middleware/Validator");
const {
  banUser,
  updateBan,
  banParams,
  getBannedUsersQuery,
} = require("../Validations/BannedUsers.schema");
const { BANNED_USERS_ENDPOINTS } = require("./utils/bannedUsers.utils");

const routes = [
  {
    path: BANNED_USERS_ENDPOINTS.BAN_USER,
    method: "post",
    middleware: [verifyTokenOfAxios, validator(banUser)],
    handler: bannedUsersController.banUser,
  },
  {
    path: BANNED_USERS_ENDPOINTS.GET_BANNED_USERS,
    method: "get",
    middleware: [verifyTokenOfAxios, validator(getBannedUsersQuery, "query")],
    handler: bannedUsersController.getBannedUsers,
  },
  {
    path: BANNED_USERS_ENDPOINTS.UPDATE_BANNED_USER,
    method: "put",
    middleware: [
      verifyTokenOfAxios,
      validator(banParams, "params"),
      validator(updateBan),
    ],
    handler: bannedUsersController.updateBannedUser,
  },
  {
    path: BANNED_USERS_ENDPOINTS.UNBAN_USER,
    method: "delete",
    middleware: [verifyTokenOfAxios], // Usually delete by ID, but route is path root? check controller later. Assuming body or query for now, leaving as is to avoid breaking without deeper check.
    handler: bannedUsersController.unbanUser,
  },
  {
    path: BANNED_USERS_ENDPOINTS.DEACTIVATE_BAN,
    method: "patch",
    middleware: [verifyTokenOfAxios, validator(banParams, "params")],
    handler: bannedUsersController.deactivateBan,
  },
];

registerRoutes(router, routes);
module.exports = router;
