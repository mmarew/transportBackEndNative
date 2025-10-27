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
  /**
   * @swagger
   * /api/admin/banned-users:
   *   get:
   *     summary: Get a list of banned users with extensive filtering, stats, or check a user's ban status.
   *     description: >
   *       This single endpoint can be used to:
   *       1. Fetch a paginated list of banned users with various filters.
   *       2. Get aggregate statistics about banned users.
   *       3. Check if a specific user is currently banned.
   *     parameters:
   *       - in: query
   *         name: page
   *         schema:
   *           type: integer
   *           default: 1
   *         description: The page number for pagination.
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           default: 10
   *         description: The number of items per page.
   *       - in: query
   *         name: userRoleUniqueId
   *         schema:
   *           type: string
   *         description: Filter by a specific user role's unique ID.
   *       - in: query
   *         name: banUniqueId
   *         schema:
   *           type: string
   *         description: Get a single banned user by their ban unique ID.
   *       - in: query
   *         name: bannedBy
   *         schema:
   *           type: string
   *         description: Filter by the unique ID of the user who issued the ban.
   *       - in: query
   *         name: isActive
   *         schema:
   *           type: boolean
   *         description: Filter by active or inactive bans.
   *       - in: query
   *         name: startDate
   *         schema:
   *           type: string
   *           format: date
   *         description: Filter for bans issued on or after this date.
   *       - in: query
   *         name: endDate
   *         schema:
   *           type: string
   *           format: date
   *         description: Filter for bans issued on or before this date.
   *       - in: query
   *         name: roleId
   *         schema:
   *           type: string
   *         description: Filter by one or more role IDs. Can be a single ID, a comma-separated list (e.g., '1,2,3'), or repeated query parameters (e.g., 'roleId=1&roleId=2').
   *       - in: query
   *         name: sortBy
   *         schema:
   *           type: string
   *           default: banAt
   *         description: The field to sort the results by.
   *       - in: query
   *         name: sortOrder
   *         schema:
   *           type: string
   *           default: DESC
   *         description: The order to sort the results in (ASC or DESC).
   *       - in: query
   *         name: stats
   *         schema:
   *           type: boolean
   *         description: If true, returns aggregate statistics about banned users instead of a list.
   *       - in: query
   *         name: check
   *         schema:
   *           type: boolean
   *         description: If true, checks if a user is banned. Requires one of `userRoleUniqueId`, `email`, or `phoneNumber` to identify the user.
   *       - in: query
   *         name: email
   *         schema:
   *           type: string
   *         description: The user's email (used with `check=true`).
   *       - in: query
   *         name: phoneNumber
   *         schema:
   *           type: string
   *         description: The user's phone number (used with `check=true`).
   *     responses:
   *       200:
   *         description: A successful response, returning a list of banned users, stats, or a ban check result.
   *       500:
   *         description: Internal server error.
   */
  {
    path: "/api/admin/banned-users",
    method: "get",
    middleware: [verifyTokenOfAxios],
    handler: bannedUsersController.getBannedUsers,
  },
  {
    path: "/api/admin/banned-users/:banUniqueId",
    method: "put",
    middleware: [verifyTokenOfAxios],
    handler: bannedUsersController.updateBannedUser,
  },
  {
    path: "/api/admin/banned-users",
    method: "delete",
    middleware: [verifyTokenOfAxios],
    handler: bannedUsersController.unbanUser,
  },
  {
    path: "/api/admin/banned-users/:banUniqueId/deactivate",
    method: "patch",
    middleware: [verifyTokenOfAxios],
    handler: bannedUsersController.deactivateBan,
  },
];

registerRoutes(router, routes);
module.exports = router;
