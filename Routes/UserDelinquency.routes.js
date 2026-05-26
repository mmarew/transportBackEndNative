const express = require("express");
const router = express.Router();
const userDelinquencyController = require("../Controllers/UserDelinquency.controller");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");
const { registerRoutes } = require("../Utils/RouteUtils");

const { validator } = require("../Middleware/Validator");
const {
  createUserDelinquency,
  userDelinquencyParams,
  userRoleParams,
} = require("../Validations/UserDelinquency.schema");
const { USER_DELINQUENCY_ENDPOINTS } = require("./EndPoints/userDelinquency.endpoints");

const routes = [
  {
    path: USER_DELINQUENCY_ENDPOINTS.CREATE_DELINQUENCY,
    method: "post",
    middleware: [verifyTokenOfAxios, validator(createUserDelinquency)],
    handler: userDelinquencyController.createUserDelinquency,
  },
  {
    path: USER_DELINQUENCY_ENDPOINTS.GET_ALL_DELINQUENCIES,
    method: "get",
    middleware: [verifyTokenOfAxios],
    handler: userDelinquencyController.getUserDelinquencies,
  },
  {
    path: USER_DELINQUENCY_ENDPOINTS.UPDATE_DELINQUENCY,
    method: "put",
    middleware: [
      verifyTokenOfAxios,
      validator(userDelinquencyParams, "params"),
    ],
    handler: userDelinquencyController.updateUserDelinquency,
  },
  {
    path: USER_DELINQUENCY_ENDPOINTS.DELETE_DELINQUENCY,
    method: "delete",
    middleware: [
      verifyTokenOfAxios,
      validator(userDelinquencyParams, "params"),
    ],
    handler: userDelinquencyController.deleteUserDelinquency,
  },
  {
    path: "/api/admin/check-automatic-ban/:userRoleUniqueId",
    method: "get",
    middleware: [verifyTokenOfAxios, validator(userRoleParams, "params")],
    handler: userDelinquencyController.checkAutomaticBan,
  },
];

registerRoutes(router, routes);
module.exports = router;
