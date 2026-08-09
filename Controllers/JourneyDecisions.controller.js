const journeyDecisionsService = require("../Services/JourneyDecisions.service");
const ServerResponder = require("../Utils/ServerResponder");
const AppError = require("../Utils/AppError");
const { executeInTransaction } = require("../Utils/DatabaseTransaction");

// Create a new journey decision
exports.createJourneyDecision = async (req, res, next) => {
  try {
    const {
      shipperRequestId,
      driverRequestId,
      journeyStatusId,
      decisionTime,
      decisionBy,
      shippingDateByDriver,
      deliveryDateByDriver,
      shippingCostByDriver,
    } = req.body;
    const result = await executeInTransaction(async () => {
      return await journeyDecisionsService.createJourneyDecision({
        shipperRequestId,
        driverRequestId,
        journeyStatusId,
        decisionTime,
        decisionBy,
        shippingDateByDriver,
        deliveryDateByDriver,
        shippingCostByDriver,
      });
    });
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

exports.getJourneyDecision4AllOrSingleUser = async (req, res, next) => {
  try {
    const {
      target,
      decidersUserUniqueId,
      roleId,
      page = 1,
      limit = 10,
      journeyDecisionUniqueId,
      driverRequestUniqueId,
      shipperRequestUniqueId,
      journeyStatusId,
      journeyStatusIds,
      decisionBy,
      decisionBys,
      startDate,
      endDate,
      shipperRequestId,
      driverRequestId,
      minShippingCost,
      maxShippingCost,
      hasShippingCost,
      unreferenced,
      sortBy,
      sortOrder,
    } = req.query;

    const { userUniqueId } = req?.user || {};

    // Build filters object from query parameters
    const filters = {};
    if (journeyDecisionUniqueId) {
      filters.journeyDecisionUniqueId = journeyDecisionUniqueId;
    }
    if (driverRequestUniqueId) {
      filters.driverRequestUniqueId = driverRequestUniqueId;
    }
    if (shipperRequestUniqueId) {
      filters.shipperRequestUniqueId = shipperRequestUniqueId;
    }
    if (journeyStatusId) {
      filters.journeyStatusId = parseInt(journeyStatusId);
    }
    if (journeyStatusIds) {
      filters.journeyStatusIds = Array.isArray(journeyStatusIds)
        ? journeyStatusIds.map((id) => parseInt(id))
        : journeyStatusIds.split(",").map((id) => parseInt(id.trim()));
    }
    if (decisionBy) {
      filters.decisionBy = decisionBy;
    }
    if (decisionBys) {
      filters.decisionBys = Array.isArray(decisionBys)
        ? decisionBys
        : decisionBys.split(",").map((d) => d.trim());
    }
    if (startDate) {
      filters.startDate = startDate;
    }
    if (endDate) {
      filters.endDate = endDate;
    }
    if (shipperRequestId) {
      filters.shipperRequestId = parseInt(shipperRequestId);
    }
    if (driverRequestId) {
      filters.driverRequestId = parseInt(driverRequestId);
    }
    if (minShippingCost !== undefined) {
      filters.minShippingCost = parseFloat(minShippingCost);
    }
    if (maxShippingCost !== undefined) {
      filters.maxShippingCost = parseFloat(maxShippingCost);
    }
    if (hasShippingCost !== undefined) {
      filters.hasShippingCost =
        hasShippingCost === "true" || hasShippingCost === true;
    }
    if (unreferenced !== undefined) {
      filters.unreferenced = unreferenced === "true" || unreferenced === true;
    }
    if (sortBy) {
      filters.sortBy = sortBy;
    }
    if (sortOrder) {
      filters.sortOrder = sortOrder;
    }

    const data = {
      target: target || "all",
      userUniqueId:
        decidersUserUniqueId === "self" ? userUniqueId : decidersUserUniqueId,
      roleId,
      page: parseInt(page),
      limit: parseInt(limit),
      filters,
    };

    const result =
      await journeyDecisionsService.getJourneyDecision4AllOrSingleUser({
        data,
      });
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

// Update a specific journey decision by ID
exports.updateJourneyDecision = async (req, res, next) => {
  try {
    const { id, journeyDecisionUniqueId } = req.query;
    const { updateValues, conditions } = req.body;
    const { userUniqueId } = req?.user || {};

    // Build conditions from params or body
    const whereConditions = conditions || {};

    // Support both journeyDecisionId and journeyDecisionUniqueId from params
    if (id) {
      whereConditions.journeyDecisionId = id;
    }
    if (journeyDecisionUniqueId) {
      whereConditions.journeyDecisionUniqueId = journeyDecisionUniqueId;
    }

    // If no conditions provided, return error
    if (Object.keys(whereConditions).length === 0) {
      return next(
        new AppError(
          "Either id or journeyDecisionUniqueId must be provided in params, or conditions in body",
          AppError.BAD_REQUEST,
        ),
      );
    }

    // Use updateValues from body, or build from legacy fields for backward compatibility
    const updateData = updateValues || {};

    // Legacy support: if old fields are provided, use them
    if (req.body.journeyStatusId !== undefined) {
      updateData.journeyStatusId = req.body.journeyStatusId;
    }
    if (req.body.decisionTime !== undefined) {
      updateData.decisionTime = req.body.decisionTime;
    }
    if (req.body.decisionBy !== undefined) {
      updateData.decisionBy = req.body.decisionBy;
    }
    if (req.body.shippingDateByDriver !== undefined) {
      updateData.shippingDateByDriver = req.body.shippingDateByDriver;
    }
    if (req.body.deliveryDateByDriver !== undefined) {
      updateData.deliveryDateByDriver = req.body.deliveryDateByDriver;
    }
    if (req.body.shippingCostByDriver !== undefined) {
      updateData.shippingCostByDriver = req.body.shippingCostByDriver;
    }
    if (req.body.isNotSelectedSeenByDriver !== undefined) {
      updateData.isNotSelectedSeenByDriver = req.body.isNotSelectedSeenByDriver;
    }

    // If no update values provided, return error
    if (Object.keys(updateData).length === 0) {
      return next(new AppError("Update values are required", AppError.BAD_REQUEST));
    }

    const result = await executeInTransaction(async () => {
      return await journeyDecisionsService.updateJourneyDecision({
        conditions: whereConditions,
        updateValues: updateData,
        userUniqueId, // Pass userUniqueId for validation when updating isNotSelectedSeenByDriver
      });
    });
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

// Delete a specific journey decision by ID
exports.deleteJourneyDecision = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await executeInTransaction(async () => {
      return await journeyDecisionsService.deleteJourneyDecision(id);
    });
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};
