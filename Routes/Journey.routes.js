const express = require("express");
const router = express.Router();
const journeyController = require("../Controllers/Journey.controller");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");
const { registerRoutes } = require("../Utils/RouteUtils");

// Apply common middleware once for all routes in this router

// Route configuration
const routes = [
  {
    method: "post",
    path: "/api/journey",
    middleware: [verifyTokenOfAxios],
    handler: journeyController.createJourney,
  },
  // {
  //   method: "get",
  //   path: "/api/journey",
  //   middleware: [verifyTokenOfAxios],
  //   handler: journeyController.getAllJourneys,
  // },
  {
    method: "get",
    path: "/api/journey/:journeyUniqueId",
    middleware: [verifyTokenOfAxios],
    handler: journeyController.getJourneyByJourneyUniqueId,
  },
  {
    method: "put",
    path: "/api/journey/:journeyUniqueId",
    middleware: [verifyTokenOfAxios],
    handler: journeyController.updateJourney,
  },
  {
    method: "delete",
    path: "/api/journey/:journeyUniqueId",
    middleware: [verifyTokenOfAxios],
    handler: journeyController.deleteJourney,
  },
  {
    method: "get",
    path: "/api/user/getCompletedJourneyCountsByDate",
    middleware: [verifyTokenOfAxios],
    handler: journeyController.getCompletedJourneyCountsByDate,
  },
  {
    method: "get",
    path: "/api/user/searchCompletedJourneyByUserData",
    middleware: [verifyTokenOfAxios],
    handler: journeyController.searchCompletedJourneyByUserData,
  },
  {
    method: "get",
    path: "/api/driver/getAllCompletedJourney",
    middleware: [verifyTokenOfAxios],
    handler: journeyController.getAllCompletedJourneys,
  },
  // get ongoing journey

  // Examples and supported query parameters for GET /api/user/getOngoingJourney
  // - Basic pagination:
  //   GET /api/user/getOngoingJourney?roleId=2&ownerUserUniqueId=all&page=1&limit=10
  // - Filter by a specific owner (userUniqueId):
  //   GET /api/user/getOngoingJourney?roleId=2&ownerUserUniqueId=<userUniqueId>&page=1&limit=10
  // - Search by user full name (partial match):
  //   GET /api/user/getOngoingJourney?roleId=1&ownerUserUniqueId=all&fullName=John
  // - Filter by phone (partial match):
  //   GET /api/user/getOngoingJourney?roleId=1&ownerUserUniqueId=all&phone=09123
  // - Filter by email (partial match):
  //   GET /api/user/getOngoingJourney?roleId=1&ownerUserUniqueId=all&email=gmail.com
  // - Broad search across name/phone/email:
  //   GET /api/user/getOngoingJourney?roleId=2&ownerUserUniqueId=all&search=john
  // - Combine filters:
  //   GET /api/user/getOngoingJourney?roleId=2&ownerUserUniqueId=<userUniqueId>&fullName=John&phone=09&page=2
  // Notes:
  // - `roleId` is required and determines the join (1=passenger, 2=driver).
  // - `ownerUserUniqueId` can be a specific userUniqueId or the string `all` to include all users.
  // - `page` and `limit` control pagination. Defaults: page=1, limit=10.
  // - `fullName`, `phone`, `email`, `search` are optional and perform partial (LIKE) matches.

  {
    method: "get",
    path: "/api/user/getOngoingJourney",
    middleware: [verifyTokenOfAxios],
    handler: journeyController.getOngoingJourney,
  },

  //   Here are all the possible URLs you can use with your single unified GET method:

  // ## Basic URLs

  // ```bash
  // # Get all journeys (no filters)
  // GET /api/journey

  // # Get with pagination
  // GET /api/journey?page=2&limit=20
  // ```

  // ## Filter by Journey Status

  // ```bash
  // # Get completed journeys (status 6)
  // GET /api/journey?journeyStatusId=6

  // # Get ongoing journeys (status 5 - journeyStarted)
  // GET /api/journey?journeyStatusId=5

  // # Get accepted journeys (status 4 - acceptedByPassenger)
  // GET /api/journey?journeyStatusId=4

  // # Get waiting journeys (status 1)
  // GET /api/journey?journeyStatusId=1

  // # Get requested journeys (status 2)
  // GET /api/journey?journeyStatusId=2

  // # Get cancelled journeys (status 7, 9, 10, 12)
  // GET /api/journey?journeyStatusId=7
  // GET /api/journey?journeyStatusId=9
  // GET /api/journey?journeyStatusId=10
  // ```

  // ## Filter by Specific IDs

  // ```bash
  // # Get specific journey by unique ID
  // GET /api/journey?journeyUniqueId=journey-123

  // # Get by journey decision ID
  // GET /api/journey?journeyDecisionUniqueId=decision-456
  // ```

  // ## Filter by User Ownership & Role

  // ```bash
  // # Get journeys where current user is passenger (roleId=1)
  // GET /api/journey?roleId=1&ownerUserUniqueId=self

  // # Get journeys where current user is driver (roleId=2)
  // GET /api/journey?roleId=2&ownerUserUniqueId=self

  // # Admin: Get all passenger journeys
  // GET /api/journey?roleId=1&ownerUserUniqueId=all

  // # Admin: Get all driver journeys
  // GET /api/journey?roleId=2&ownerUserUniqueId=all

  // # Get specific user's journeys
  // GET /api/journey?ownerUserUniqueId=user-123&roleId=2
  // ```

  // ## Filter by User Details

  // ```bash
  // # Filter by passenger full name
  // GET /api/journey?fullName=John

  // # Filter by driver full name
  // GET /api/journey?fullName=Mike&roleId=2

  // # Filter by phone number (passenger or driver)
  // GET /api/journey?phone=0912345678

  // # Filter by email
  // GET /api/journey?email=john@example.com

  // # Search across all user fields and places
  // GET /api/journey?search=john
  // GET /api/journey?search=0912
  // GET /api/journey?search=addis
  // ```

  // ## Filter by Date Ranges

  // ```bash
  // # Get journeys from specific date range
  // GET /api/journey?fromDate=2024-01-01&toDate=2024-01-31

  // # Get journeys from a specific date onwards
  // GET /api/journey?fromDate=2024-01-01

  // # Get journeys up to a specific date
  // GET /api/journey?toDate=2024-01-31

  // # Get last 10 journeys (sentinel value)
  // GET /api/journey?fromDate=lastTen&toDate=lastTen
  // ```

  // ## Combined Filters (Most Powerful)

  // ```bash
  // # Completed journeys for a specific driver with pagination
  // GET /api/journey?journeyStatusId=6&roleId=2&ownerUserUniqueId=driver-123&page=1&limit=10

  // # Ongoing journeys for passengers named "John"
  // GET /api/journey?journeyStatusId=5&roleId=1&fullName=John

  // # All completed journeys in January 2024
  // GET /api/journey?journeyStatusId=6&fromDate=2024-01-01&toDate=2024-01-31

  // # Search for "Mike" in ongoing driver journeys
  // GET /api/journey?journeyStatusId=5&roleId=2&search=Mike

  // # Specific user's completed journeys with phone filter
  // GET /api/journey?journeyStatusId=6&ownerUserUniqueId=user-123&phone=0912

  // # Admin: All journeys with comprehensive search
  // GET /api/journey?ownerUserUniqueId=all&search=addis&fromDate=2024-01-01&page=2&limit=15
  // ```

  // ## Real-World Use Case Examples

  // ```bash
  // # Passenger wants to see their completed journeys
  // GET /api/journey?roleId=1&ownerUserUniqueId=self&journeyStatusId=6

  // # Driver wants to see their ongoing journeys
  // GET /api/journey?roleId=2&ownerUserUniqueId=self&journeyStatusId=5

  // # Admin monitoring all cancelled journeys
  // GET /api/journey?ownerUserUniqueId=all&journeyStatusId=7

  // # Customer support searching for a user's journeys
  // GET /api/journey?search=0922112480

  // # Analytics: All completed journeys in last month
  // GET /api/journey?journeyStatusId=6&fromDate=2024-01-01&toDate=2024-01-31&ownerUserUniqueId=all

  // # Specific journey details for tracking
  // GET /api/journey?journeyUniqueId=journey-abc123
  // ```

  // ## Response Structure for ALL URLs:
  // ```javascript
  // {
  //   "message": "success",
  //   "data": [
  //     {
  //       "passenger": { /* passenger details */ },
  //       "driver": {
  //         "driver": { /* driver details */ },
  //         "vehicle": { /* vehicle details */ }
  //       },
  //       "journey": { /* journey details */ },
  //       "decision": { /* decision details */ }
  //     }
  //   ],
  //   "pagination": { /* pagination info */ }
  // }
  // ```

  // This single endpoint replaces ALL your previous GET endpoints and provides incredible flexibility!
  {
    method: "get",
    path: "/api/journey",
    middleware: [verifyTokenOfAxios],
    handler: journeyController.getJourneys,
  },
];

// Register all routes
registerRoutes(router, routes);

module.exports = router;
