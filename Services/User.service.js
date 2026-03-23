"use strict";

const authService = require("./User/User.auth.service");
const registryService = require("./User/User.registry.service");
const manageService = require("./User/User.manage.service");

module.exports = {
  // Auth
  loginUser: authService.loginUser,
  verifyUserByOTP: authService.verifyUserByOTP,
  handleExistingUser: authService.handleExistingUser,

  // Registry
  createUser: registryService.createUser,
  createUserSystem: registryService.createUserSystem,
  createUserByAdminOrSuperAdmin: registryService.createUserByAdminOrSuperAdmin,
  registerNewUser: registryService.registerNewUser,
  ensureCredentialForUser: registryService.ensureCredentialForUser,
  handleUserRoleStatus: registryService.handleUserRoleStatus,

  // Management
  getUserByUserUniqueId: manageService.getUserByUserUniqueId,
  getUsersByRoleUniqueId: manageService.getUsersByRoleUniqueId,
  getUserByFilterDetailed: manageService.getUserByFilterDetailed,
  updateUser: manageService.updateUser,
  deleteUser: manageService.deleteUser,
  verifyEmailByToken: authService.verifyEmailByToken,
  reportMisdirectedEmail: authService.reportMisdirectedEmail,
};
