"use strict";

const { journeyStatusMap } = require("../../Utils/ListOfSeedData");
const { updateJourneyStatus } = require("../JourneyStatus");
const { createJourney } = require("./journeyCreate.service");
const { currentDate } = require("../../Utils/CurrentDate");
const AppError = require("../../Utils/AppError");

/**
 * Promotes an accepted order to acceptedByShipper (4) and creates the Journey
 * immediately with the agreed fare.
 *
 * Used by flows where the price is ALREADY AGREED up front — queue dispatch
 * orders (fixed price set by the queue org) and company assignments — which
 * SKIP the 1→2→3→4→5 negotiation flow that nearby-matching uses. For those
 * flows, the driver accepting (or confirming) is the final agreement, so the
 * Journey is born at status 4 instead of waiting for the shipper to pick.
 *
 * @param {Object} params
 * @param {string} params.journeyDecisionUniqueId - Decision linking order + driver
 * @param {string} params.driverRequestUniqueId - Driver request unique id
 * @param {string} params.shipperRequestUniqueId - Order unique id (optional for
 *   company flow where the row is already at status 4)
 * @param {number} [params.shippingCostByDriver] - Agreed price (fixed queue
 *   price / company bid price)
 * @param {string} params.journeyCreatedBy - Real user id of the actor
 *   (driver, or dispatcher for company flow)
 * @param {Object} [params.connection] - Transaction connection (optional; uses
 *   ambient transactionStorage when present)
 * @returns {Promise<Object>} Result of createJourney ({ message, data: [...] })
 */
const promoteToAcceptedByShipperAndCreateJourney = async ({
  journeyDecisionUniqueId,
  driverRequestUniqueId,
  shipperRequestUniqueId,
  shippingCostByDriver,
  journeyCreatedBy,
  connection,
}) => {
  if (!journeyDecisionUniqueId || !driverRequestUniqueId) {
    throw new AppError(
      "Missing journey decision or driver request identifiers",
      AppError.BAD_REQUEST,
    );
  }

  // Status → 4 (acceptedByShipper) across JourneyDecisions / ShipperRequest /
  // DriverRequest. updateJourneyStatus runs on the ambient transaction
  // connection when one exists (both callers are inside executeInTransaction).
  await updateJourneyStatus({
    journeyDecisionUniqueId,
    driverRequestUniqueId,
    shipperRequestUniqueId,
    journeyStatusId: journeyStatusMap.acceptedByShipper,
    shippingCostByDriver,
    connection,
  });

  // Create the Journey immediately — fare = the agreed price.
  const journey = await createJourney(
    {
      journeyDecisionUniqueId,
      startTime: currentDate(),
      endTime: null,
      fare: shippingCostByDriver ?? 0,
      journeyStatusId: journeyStatusMap.acceptedByShipper,
      journeyCreatedBy,
    },
    connection,
  );

  return journey;
};

module.exports = { promoteToAcceptedByShipperAndCreateJourney };
