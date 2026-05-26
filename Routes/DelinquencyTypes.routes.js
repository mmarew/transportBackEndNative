const express = require("express");
const router = express.Router();
const delinquencyTypesController = require("../Controllers/DelinquencyTypes.controller");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");
const { registerRoutes } = require("../Utils/RouteUtils");

const { validator } = require("../Middleware/Validator");
const {
  createDelinquencyType,
  updateDelinquencyType,
  delinquencyTypeParams,
  roleParams,
  getDelinquencyTypesQuery,
} = require("../Validations/DelinquencyTypes.schema");
const { DELINQUENCY_TYPES_ENDPOINTS } = require("./EndPoints/delinquencyTypes.endpoints");

const routes = [
  {
    path: DELINQUENCY_TYPES_ENDPOINTS.CREATE_DELINQUENCY_TYPE,
    method: "post",
    middleware: [verifyTokenOfAxios, validator(createDelinquencyType)],
    handler: delinquencyTypesController.createDelinquencyType,
  },
  {
    path: DELINQUENCY_TYPES_ENDPOINTS.GET_DELINQUENCY_TYPES,
    method: "get",
    middleware: [
      verifyTokenOfAxios,
      validator(getDelinquencyTypesQuery, "query"),
    ],
    handler: delinquencyTypesController.getDelinquencyTypes,
  },
  {
    path: DELINQUENCY_TYPES_ENDPOINTS.UPDATE_DELINQUENCY_TYPE,
    method: "put",
    middleware: [
      verifyTokenOfAxios,
      validator(delinquencyTypeParams, "params"),
      validator(updateDelinquencyType),
    ],
    handler: delinquencyTypesController.updateDelinquencyType,
  },
  {
    path: DELINQUENCY_TYPES_ENDPOINTS.DELETE_DELINQUENCY_TYPE,
    method: "delete",
    middleware: [
      verifyTokenOfAxios,
      validator(delinquencyTypeParams, "params"),
    ],
    handler: delinquencyTypesController.deleteDelinquencyType,
  },
  {
    path: DELINQUENCY_TYPES_ENDPOINTS.GET_DELINQUENCY_TYPES_BY_ROLE,
    method: "get",
    middleware: [verifyTokenOfAxios, validator(roleParams, "params")],
    handler: delinquencyTypesController.getDelinquencyTypesByRole,
  },
  {
    path: DELINQUENCY_TYPES_ENDPOINTS.TOGGLE_DELINQUENCY_TYPE_ACTIVE,
    method: "patch",
    middleware: [
      verifyTokenOfAxios,
      validator(delinquencyTypeParams, "params"),
    ],
    handler: delinquencyTypesController.toggleDelinquencyTypeActive,
  },
];

registerRoutes(router, routes);
module.exports = router;
