"use strict";

const { currentDate } = require("../../../Utils/CurrentDate");
const AppError = require("../../../Utils/AppError");
const { db } = require("../../CompanyHelper.service");
const { journeyStatusMap } = require("../../../Utils/ListOfSeedData");
const logger = require("../../../Utils/logger");
const { getFullAssignmentData } = require("../assignmentHelper");
const {
  handleDriverRejectionOrCancellation,
  handleDriverConfirmation,
  handleJourneyProgressSync,
  handleBatchCompletionCheck,
} = require("./transitions");

exports.updateAssignmentStatus = async (
  assignmentUniqueId,
  assignmentStatus,
  updatedBy,
  payload = {},
) => {
  // Acquire an exclusive lock on the assignment to prevent race conditions
  // (e.g. multiple concurrent "confirm" requests leading to duplicate inserts)
  const [rows] = await db().query(
    "SELECT * FROM CompanyBidVehicleAssignment WHERE assignmentUniqueId = ? LIMIT 1 FOR UPDATE",
    [assignmentUniqueId],
  );

  if (!rows || rows.length === 0) {
    throw new AppError("Assignment not found", AppError.NOT_FOUND);
  }

  const assignment = rows[0];

  if (assignment.assignmentDeletedAt) {
    throw new AppError("Assignment has been deleted", AppError.BAD_REQUEST);
  }

  // Fetch full assignment with joins — matches GET /api/company/assignments shape
  let fullAssignment = null;
  try {
    fullAssignment = await getFullAssignmentData(assignmentUniqueId);
  } catch (e) {
    logger.warn("Failed to fetch full assignment data", {
      error: e.message,
      assignmentUniqueId,
    });
  }

  assignmentStatus = await handleDriverRejectionOrCancellation({
    assignment,
    assignmentStatus,
    assignmentUniqueId,
    updatedBy,
    fullAssignment,
  });

  const setParts = [
    "assignmentStatus = ?",
    "assignmentUpdatedBy = ?",
    "assignmentUpdatedAt = ?",
  ];
  const vals = [assignmentStatus, updatedBy, currentDate()];

  // On driver confirmation → ensure the JourneyDecision is at status 4
  let journeyDecisionUniqueId = assignment.journeyDecisionUniqueId;

  const confirmResult = await handleDriverConfirmation({
    assignment,
    assignmentStatus,
    assignmentUniqueId,
    updatedBy,
    payload,
    fullAssignment,
    setParts,
    vals,
    journeyDecisionUniqueId,
  });
  if (confirmResult?.message) {
    return confirmResult;
  }
  journeyDecisionUniqueId = confirmResult;

  await handleJourneyProgressSync({
    assignment,
    assignmentStatus,
    assignmentUniqueId,
    fullAssignment,
  });

  vals.push(assignmentUniqueId);
  await db().query(
    `UPDATE CompanyBidVehicleAssignment SET ${setParts.join(", ")} WHERE assignmentUniqueId = ?`,
    vals,
  );

  await handleBatchCompletionCheck({
    assignmentStatus,
    assignment,
    assignmentUniqueId,
  });

  return {
    message: "Assignment status updated",
    data: {
      assignmentStatus,
      journeyDecisionUniqueId:
        journeyDecisionUniqueId || assignment.journeyDecisionUniqueId,
      // When the driver confirms (price already agreed), the decision is
      // promoted to acceptedByShipper (4); the Journey is created later when
      // the driver heads to the loading place (goToLoadingPlace = 5).
      ...(assignmentStatus === "confirmed_by_driver" && {
        status: journeyStatusMap.acceptedByShipper,
        journeyUniqueId: null,
      }),
    },
  };
};
