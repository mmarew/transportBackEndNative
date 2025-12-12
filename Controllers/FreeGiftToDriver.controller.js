// const service = require("../Services/FreeGiftToDriver.service");
// const ServerResponder = require("../Utils/ServerResponder");

// exports.createFreeGiftToDriver = async (req, res) => {
//   try {
//     let driverUniqueId = req.params.driverUniqueId;
//     const { subscriptionPlanUniqueId, giftStartDate, giftEndDate } = req.body;

//     if (driverUniqueId === "self") {
//       driverUniqueId = req.user.userUniqueId;
//     }

//     const result = await service.createFreeGiftToDriver({
//       driverUniqueId,
//       subscriptionPlanUniqueId,
//       giftStartDate,
//     });

//     ServerResponder(res, result);
//   } catch (error) {
//     console.error("Error creating free gift:", error);
//     ServerResponder(res, {
//       message: "error",
//       error: "Failed to create gift",
//     });
//   }
// };

// exports.getAllFreeGiftToDrivers = async (req, res) => {
//   try {
//     const result = await service.getAllFreeGiftToDrivers();
//     ServerResponder(res, result);
//   } catch (error) {
//     console.error("Error fetching free gifts:", error);
//     ServerResponder(res, {
//       message: "error",
//       error: "Failed to fetch data",
//     });
//   }
// };

// exports.getFreeGiftToDriverByUniqueId = async (req, res) => {
//   try {
//     const { freeGiftUniqueId } = req.params;
//     const result = await service.getFreeGiftToDriverByUniqueId(
//       freeGiftUniqueId
//     );
//     ServerResponder(res, result);
//   } catch (error) {
//     console.error("Error fetching gift by ID:", error);
//     ServerResponder(res, {
//       message: "error",
//       error: "Gift not found",
//     });
//   }
// };

// exports.getFreeGiftToDriverByDriverId = async (req, res) => {
//   try {
//     let driverUniqueId = req.params.driverUniqueId;
//     if (driverUniqueId === "self") {
//       driverUniqueId = req.user.userUniqueId;
//     }
//     const result = await service.getFreeGiftToDriverByDriverId(driverUniqueId);
//     ServerResponder(res, result);
//   } catch (error) {
//     console.error("Error fetching gift by driver ID:", error);
//     ServerResponder(res, {
//       message: "error",
//       error: "Driver data not found",
//     });
//   }
// };
// exports.getFreeGiftToDriverByPlanUniqueIdAndDriverUniqueId = async (
//   req,
//   res
// ) => {
//   try {
//     const { subscriptionPlanUniqueId } = req.params;
//     let driverUniqueId = req.params.driverUniqueId;
//     const user = req.user;
//     if (!user || !user.userUniqueId) {
//       return ServerResponder(res, {
//         message: "error",
//         error: "Unauthorized request",
//       });
//     }
//     if (driverUniqueId === "self") {
//       driverUniqueId = user.userUniqueId;
//     }
//     if (!subscriptionPlanUniqueId || !driverUniqueId) {
//       return ServerResponder(res, {
//         message: "error",
//         error: "Subscription plan and driver unique IDs are required",
//       });
//     }
//     console.log("driverUniqueId", driverUniqueId);

//     const result =
//       await service.getFreeGiftToDriverByPlanUniqueIdAndDriverUniqueId({
//         subscriptionPlanUniqueId,
//         driverUniqueId,
//       });
//     ServerResponder(res, result);
//   } catch (error) {
//     console.error("Error fetching gift by plan and driver ID:", error);
//     ServerResponder(res, {
//       message: "error",
//       error: "Failed to fetch data",
//     });
//   }
// };
// exports.deleteFreeGiftToDriverByUniqueId = async (req, res) => {
//   try {
//     const { freeGiftUniqueId } = req.params;
//     const user = req.user;
//     if (!user || !user.userUniqueId) {
//       return ServerResponder(res, {
//         message: "error",
//         error: "Unauthorized request",
//       });
//     }
//     const userUniqueId = user.userUniqueId;
//     const result = await service.deleteFreeGiftToDriverByUniqueId({
//       freeGiftUniqueId,
//       userUniqueId,
//     });
//     ServerResponder(res, result);
//   } catch (error) {
//     console.error("Error deleting gift:", error);
//     ServerResponder(res, {
//       message: "error",
//       error: "Failed to delete gift",
//     });
//   }
// };
// exports.updateFreeGiftToDriverByUniqueId = async (req, res) => {
//   try {
//     const { freeGiftUniqueId } = req.params;
//     const {
//       giftStartDate,
//       giftEndDate,
//       subscriptionPlanUniqueId,
//       driverUniqueId,
//     } = req.body;
//     const updatedBy = req.user && req.user.userUniqueId;

//     if (!freeGiftUniqueId) {
//       return ServerResponder(res, {
//         message: "error",
//         error: "Free gift unique ID is required",
//       });
//     }

//     const result = await service.updateFreeGiftToDriverByUniqueId({
//       ...req.body,
//     });

//     ServerResponder(res, result);
//   } catch (error) {
//     console.error("Error updating free gift:", error);
//     ServerResponder(res, {
//       message: "error",
//       error: "Failed to update gift",
//     });
//   }
// };

const service = require("../Services/FreeGiftToDriver.service");
const ServerResponder = require("../Utils/ServerResponder");

// Consolidated GET method with filtering
exports.getFreeGiftToDriversWithFilters = async (req, res) => {
  try {
    // Extract all possible query parameters
    const {
      page = 1,
      limit = 10,

      // ID filters
      freeGiftUniqueId,

      subscriptionPlanUniqueId,

      // Status filters
      isActive,
      isExpired,
      isUpcoming,
      isFreeGiftDeleted,

      // Date filters
      giftStartDateBefore,
      giftStartDateAfter,
      giftEndDateBefore,
      giftEndDateAfter,
      giftCreatedAtStart,
      giftCreatedAtEnd,

      // Plan filters
      planName,
      isFree,

      // Pricing filters
      minPrice,
      maxPrice,
      durationInDays,

      // User filters
      createdBy,
      updatedBy,
      deletedBy,

      // Sorting
      sortBy = "giftCreatedAt",
      sortOrder = "DESC",

      // Aggregation
      countOnly = false,

      // Special role-based access
      selfOnly = false,
    } = req.query;

    const user = req.user;
    let driverUniqueId = req?.query.driverUniqueId;
    // Handle self lookup
    if (selfOnly === "true" || driverUniqueId === "self") {
      if (!user || !user.userUniqueId) {
        return ServerResponder(res, {
          message: "error",
          error: "Unauthorized: User not authenticated",
        });
      }
      driverUniqueId = user.userUniqueId;
    }

    // Build filter object
    const filters = {
      page: parseInt(page),
      limit: parseInt(limit),

      // ID filters
      freeGiftUniqueId,
      driverUniqueId,
      subscriptionPlanUniqueId,

      // Status filters
      isActive: isActive ? isActive === "true" : undefined,
      isExpired: isExpired ? isExpired === "true" : undefined,
      isUpcoming: isUpcoming ? isUpcoming === "true" : undefined,
      isFreeGiftDeleted: isFreeGiftDeleted
        ? isFreeGiftDeleted === "true"
        : undefined,

      // Date filters
      giftStartDateBefore,
      giftStartDateAfter,
      giftEndDateBefore,
      giftEndDateAfter,
      giftCreatedAtStart,
      giftCreatedAtEnd,

      // Plan filters
      planName,
      isFree: isFree ? isFree === "true" : undefined,

      // Pricing filters
      minPrice: minPrice ? parseFloat(minPrice) : undefined,
      maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
      durationInDays: durationInDays ? parseInt(durationInDays) : undefined,

      // User filters
      createdBy,
      updatedBy,
      deletedBy,

      // Sorting
      sortBy,
      sortOrder: sortOrder.toUpperCase(),

      // Aggregation
      countOnly: countOnly ? countOnly === "true" : false,
    };

    // If freeGiftUniqueId is provided, get single record
    if (freeGiftUniqueId) {
      const result = await service.getFreeGiftToDriverByUniqueId(
        freeGiftUniqueId
      );
      return ServerResponder(res, result);
    }

    // If countOnly is true, return count only
    if (filters.countOnly) {
      const result = await service.getFreeGiftToDriversCount(filters);
      return ServerResponder(res, result);
    }

    // Default: get filtered free gifts
    const result = await service.getFreeGiftToDriversWithFilters(filters);
    ServerResponder(res, result);
  } catch (error) {
    console.error("Error fetching free gifts:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to fetch free gifts",
      details: error.message,
    });
  }
};

// Keep other controller methods
exports.createFreeGiftToDriver = async (req, res) => {
  try {
    let driverUniqueId = req.params.driverUniqueId;
    const { subscriptionPlanUniqueId, giftStartDate, giftEndDate } = req.body;

    if (driverUniqueId === "self") {
      driverUniqueId = req.user.userUniqueId;
    }

    const result = await service.createFreeGiftToDriver({
      driverUniqueId,
      subscriptionPlanUniqueId,
      giftStartDate,
    });

    ServerResponder(res, result);
  } catch (error) {
    console.error("Error creating free gift:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to create gift",
    });
  }
};

exports.deleteFreeGiftToDriverByUniqueId = async (req, res) => {
  try {
    const { freeGiftUniqueId } = req.params;
    const user = req.user;
    if (!user || !user.userUniqueId) {
      return ServerResponder(res, {
        message: "error",
        error: "Unauthorized request",
      });
    }
    const userUniqueId = user.userUniqueId;
    const result = await service.deleteFreeGiftToDriverByUniqueId({
      freeGiftUniqueId,
      userUniqueId,
    });
    ServerResponder(res, result);
  } catch (error) {
    console.error("Error deleting gift:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to delete gift",
    });
  }
};

exports.updateFreeGiftToDriverByUniqueId = async (req, res) => {
  try {
    const { freeGiftUniqueId } = req.params;
    const {
      giftStartDate,
      giftEndDate,
      subscriptionPlanUniqueId,
      driverUniqueId,
    } = req.body;
    const updatedBy = req.user && req.user.userUniqueId;

    if (!freeGiftUniqueId) {
      return ServerResponder(res, {
        message: "error",
        error: "Free gift unique ID is required",
      });
    }

    const result = await service.updateFreeGiftToDriverByUniqueId({
      ...req.body,
    });

    ServerResponder(res, result);
  } catch (error) {
    console.error("Error updating free gift:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to update gift",
    });
  }
};
