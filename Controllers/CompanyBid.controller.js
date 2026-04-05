"use strict";
const service = require("../Services/CompanyBid.service");
const ServerResponder = require("../Utils/ServerResponder");
const { executeInTransaction } = require("../Utils/DatabaseTransaction");

// ── TransportCompany ──────────────────────────────────────────────────────────

exports.createCompany = async (req, res, next) => {
  try {
    const result = await executeInTransaction(() =>
      service.createCompany({
        ...req.body,
        createdByUserUniqueId: req.user.userUniqueId,
      }),
    );
    ServerResponder(res, result, 201);
  } catch (e) {
    next(e);
  }
};

exports.getCompanies = async (req, res, next) => {
  try {
    ServerResponder(res, await service.getCompanies(req.query));
  } catch (e) {
    next(e);
  }
};

exports.updateCompany = async (req, res, next) => {
  try {
    const result = await executeInTransaction(() =>
      service.updateCompany(
        req.params.companyUniqueId,
        req.body,
        req.user.userUniqueId,
      ),
    );
    ServerResponder(res, result);
  } catch (e) {
    next(e);
  }
};

exports.approveCompany = async (req, res, next) => {
  try {
    const result = await executeInTransaction(() =>
      service.approveCompany(
        req.params.companyUniqueId,
        req.body.approvalStatus,
        req.body.approvalReason,
        req.user.userUniqueId,
      ),
    );
    ServerResponder(res, result);
  } catch (e) {
    next(e);
  }
};

exports.deleteCompany = async (req, res, next) => {
  try {
    const result = await executeInTransaction(() =>
      service.deleteCompany(req.params.companyUniqueId, req.user.userUniqueId),
    );
    ServerResponder(res, result);
  } catch (e) {
    next(e);
  }
};

// ── CompanyMembership ─────────────────────────────────────────────────────────

exports.addMember = async (req, res, next) => {
  try {
    const result = await executeInTransaction(() =>
      service.addMember({
        ...req.body,
        createdByUserUniqueId: req.user.userUniqueId,
      }),
    );
    ServerResponder(res, result, 201);
  } catch (e) {
    next(e);
  }
};

exports.getMembers = async (req, res, next) => {
  try {
    ServerResponder(res, await service.getMembers(req.query));
  } catch (e) {
    next(e);
  }
};

exports.deactivateMember = async (req, res, next) => {
  try {
    const result = await executeInTransaction(() =>
      service.deactivateMember(
        req.params.membershipUniqueId,
        req.user.userUniqueId,
      ),
    );
    ServerResponder(res, result);
  } catch (e) {
    next(e);
  }
};

exports.deleteMember = async (req, res, next) => {
  try {
    const result = await executeInTransaction(() =>
      service.deleteMember(
        req.params.membershipUniqueId,
        req.user.userUniqueId,
      ),
    );
    ServerResponder(res, result);
  } catch (e) {
    next(e);
  }
};

// ── CompanyVehicle ────────────────────────────────────────────────────────────

exports.assignVehicle = async (req, res, next) => {
  try {
    const result = await executeInTransaction(() =>
      service.assignVehicle({
        ...req.body,
        createdByUserUniqueId: req.user.userUniqueId,
      }),
    );
    ServerResponder(res, result, 201);
  } catch (e) {
    next(e);
  }
};

exports.getCompanyVehicles = async (req, res, next) => {
  try {
    ServerResponder(res, await service.getCompanyVehicles(req.query));
  } catch (e) {
    next(e);
  }
};

exports.removeVehicle = async (req, res, next) => {
  try {
    const result = await executeInTransaction(() =>
      service.removeVehicle(
        req.params.companyVehicleUniqueId,
        req.user.userUniqueId,
      ),
    );
    ServerResponder(res, result);
  } catch (e) {
    next(e);
  }
};

// ── CompanyBidRequest ─────────────────────────────────────────────────────────

exports.submitBid = async (req, res, next) => {
  try {
    const result = await executeInTransaction(() =>
      service.submitBid({
        ...req.body,
        bidSubmittedByUserUniqueId: req.user.userUniqueId,
      }),
    );
    ServerResponder(res, result, 201);
  } catch (e) {
    next(e);
  }
};

exports.getBids = async (req, res, next) => {
  try {
    ServerResponder(res, await service.getBids(req.query));
  } catch (e) {
    next(e);
  }
};

exports.updateBidStatus = async (req, res, next) => {
  try {
    const result = await executeInTransaction(() =>
      service.updateBidStatus(
        req.params.companyBidRequestUniqueId,
        req.body.bidStatus,
        req.user.userUniqueId,
      ),
    );
    ServerResponder(res, result);
  } catch (e) {
    next(e);
  }
};

exports.deleteBid = async (req, res, next) => {
  try {
    const result = await executeInTransaction(() =>
      service.deleteBid(
        req.params.companyBidRequestUniqueId,
        req.user.userUniqueId,
      ),
    );
    ServerResponder(res, result);
  } catch (e) {
    next(e);
  }
};

// ── CompanyBidVehicleAssignment ───────────────────────────────────────────────

exports.createAssignment = async (req, res, next) => {
  try {
    const result = await executeInTransaction(() =>
      service.createAssignment({
        ...req.body,
        createdByUserUniqueId: req.user.userUniqueId,
      }),
    );
    ServerResponder(res, result, 201);
  } catch (e) {
    next(e);
  }
};

exports.getAssignments = async (req, res, next) => {
  try {
    ServerResponder(res, await service.getAssignments(req.query));
  } catch (e) {
    next(e);
  }
};

exports.updateAssignmentStatus = async (req, res, next) => {
  try {
    const result = await executeInTransaction(() =>
      service.updateAssignmentStatus(
        req.params.assignmentUniqueId,
        req.body.assignmentStatus,
        req.user.userUniqueId,
      ),
    );
    ServerResponder(res, result);
  } catch (e) {
    next(e);
  }
};

exports.deleteAssignment = async (req, res, next) => {
  try {
    const result = await executeInTransaction(() =>
      service.deleteAssignment(
        req.params.assignmentUniqueId,
        req.user.userUniqueId,
      ),
    );
    ServerResponder(res, result);
  } catch (e) {
    next(e);
  }
};
