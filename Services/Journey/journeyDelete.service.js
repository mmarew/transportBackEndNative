"use strict";

const AppError = require("../../Utils/AppError");

const { query } = require("./journeyHelper");

// Delete a specific journey by unique ID
// Removes dependent records in FK-safe order so the delete cannot be
// blocked by referential integrity (JourneyNotifications references Journey,
// and Journey/decision-based records reference JourneyDecisions).
const deleteJourney = async (journeyUniqueId) => {
  const journeys = await query(
    "SELECT journeyUniqueId, journeyDecisionUniqueId FROM Journey WHERE journeyUniqueId = ?",
    [journeyUniqueId],
  );

  if (!journeys || journeys.length === 0) {
    throw new AppError("Failed to delete journey", AppError.INTERNAL_SERVER_ERROR);
  }

  const { journeyDecisionUniqueId } = journeys[0];

  await query("DELETE FROM JourneyNotifications WHERE journeyUniqueId = ?", [
    journeyUniqueId,
  ]);

  const result = await query(
    "DELETE FROM Journey WHERE journeyUniqueId = ?",
    [journeyUniqueId],
  );

  if (result.affectedRows === 0) {
    throw new AppError("Failed to delete journey", AppError.INTERNAL_SERVER_ERROR);
  }

  if (journeyDecisionUniqueId) {
    await query("DELETE FROM Commission WHERE journeyDecisionUniqueId = ?", [
      journeyDecisionUniqueId,
    ]);
    await query(
      "DELETE FROM CompanyBidVehicleAssignment WHERE journeyDecisionUniqueId = ?",
      [journeyDecisionUniqueId],
    );
    await query(
      "DELETE FROM CompanyDelinquency WHERE journeyDecisionUniqueId = ?",
      [journeyDecisionUniqueId],
    );
    await query("DELETE FROM UserDelinquency WHERE journeyDecisionUniqueId = ?", [
      journeyDecisionUniqueId,
    ]);
    await query("DELETE FROM Ratings WHERE journeyDecisionUniqueId = ?", [
      journeyDecisionUniqueId,
    ]);
    await query("DELETE FROM JourneyPayments WHERE journeyDecisionUniqueId = ?", [
      journeyDecisionUniqueId,
    ]);
    await query("DELETE FROM JourneyRoutePoints WHERE journeyDecisionUniqueId = ?", [
      journeyDecisionUniqueId,
    ]);
    await query("DELETE FROM JourneyDecisions WHERE journeyDecisionUniqueId = ?", [
      journeyDecisionUniqueId,
    ]);
  }

  return {
    message: `Journey with ID ${journeyUniqueId} deleted successfully`,
    data: null,
  };
};

module.exports = {
  deleteJourney,
};
