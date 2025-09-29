const express = require("express");
const router = express.Router();
const delinquencyTypesController = require("../Controllers/DelinquencyTypes.controller");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");
const { registerRoutes } = require("../Utils/RouteUtils");

const routes = [
  {
    path: "/api/admin/delinquency-types",
    method: "post",
    middleware: [verifyTokenOfAxios],
    handler: delinquencyTypesController.createDelinquencyType,
  },
  {
    path: "/api/admin/delinquency-types",
    method: "get",
    middleware: [verifyTokenOfAxios],
    handler: delinquencyTypesController.getDelinquencyTypes,
  },
  {
    path: "/api/admin/delinquency-types/:delinquencyTypeUniqueId",
    method: "get",
    middleware: [verifyTokenOfAxios],
    handler: delinquencyTypesController.getDelinquencyTypeById,
  },
  {
    path: "/api/admin/delinquency-types/:delinquencyTypeUniqueId",
    method: "put",
    middleware: [verifyTokenOfAxios],
    handler: delinquencyTypesController.updateDelinquencyType,
  },
  {
    path: "/api/admin/delinquency-types/:delinquencyTypeUniqueId",
    method: "delete",
    middleware: [verifyTokenOfAxios],
    handler: delinquencyTypesController.deleteDelinquencyType,
  },
  {
    path: "/api/admin/delinquency-types/role/:roleUniqueId",
    method: "get",
    middleware: [verifyTokenOfAxios],
    handler: delinquencyTypesController.getDelinquencyTypesByRole,
  },
  {
    path: "/api/admin/delinquency-types/:delinquencyTypeUniqueId/toggle-active",
    method: "patch",
    middleware: [verifyTokenOfAxios],
    handler: delinquencyTypesController.toggleDelinquencyTypeActive,
  },
];

registerRoutes(router, routes);
module.exports = router;
