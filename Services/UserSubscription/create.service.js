"use strict";

const { pool } = require("../../Middleware/Database.config");
const { v4: uuidv4 } = require("uuid");
const { currentDate } = require("../../Utils/CurrentDate");
const {
  prepareAndCreateNewBalance,
} = require("../UserBalance.service/UserBalance.post.service");
const { getPricingWithFilters } = require("../SubscriptionPlanPricing.service");
const AppError = require("../../Utils/AppError");
const logger = require("../../Utils/logger");
const { transactionStorage } = require("../../Utils/TransactionContext");
const { getUserSubscriptionsWithFilters } = require("./read.service");
const { getDaysBetweenDates, addDays } = require("./helpers.service");

// Create subscription
const createUserSubscription = async ({
  driverUniqueId,
  subscriptionPlanPricingUniqueId,
  userSubscriptionCreatedBy,
}) => {
  const userSubscriptionUniqueId = uuidv4();
  const today = currentDate();
  const activePricing = await getPricingWithFilters({
    subscriptionPlanPricingUniqueId,
    isActive: true,
  });
  const activePricingData = activePricing?.data?.[0];
  logger.debug("@activePricingData", {
    activePricingData,
    subscriptionPlanPricingUniqueId,
  });
  if (!activePricingData) {
    throw new AppError("There is no such kind of plan pricing.", 400);
  }
  const isFree = activePricingData?.isFree;
  const price = activePricingData?.price;
  const effectiveFrom = activePricingData?.effectiveFrom;
  const effectiveTo = activePricingData?.effectiveTo;

  // Use durationInDays from pricing when available; only compute from dates if BOTH are set
  let durationInDays = activePricingData?.durationInDays;
  if (
    durationInDays === null ||
    durationInDays === undefined ||
    durationInDays <= 0
  ) {
    if (effectiveFrom && effectiveTo) {
      durationInDays = getDaysBetweenDates(effectiveFrom, effectiveTo);
    } else {
      throw new AppError(
        "durationInDays is missing for this pricing configuration.",
        400,
      );
    }
  }
  let savedEndDate = null,
    savedStartDate = null;
  if (isFree) {
    const allSubs = await getUserSubscriptionsWithFilters({ driverUniqueId });
    const hasFreeBefore = (allSubs?.data || []).some(
      (s) => s.isFree === 1 || s.isFree === true,
    );
    if (hasFreeBefore) {
      throw new AppError(
        "You have already used your free trial.",
        400,
      );
    }
  }
  const activeSubscription = await getUserSubscriptionsWithFilters({
    driverUniqueId,
    limit: 1,
  });
  const activeSubscriptionData = activeSubscription?.data?.[0];
  if (activeSubscriptionData) {
    savedEndDate = activeSubscriptionData?.endDate;
    savedStartDate = savedEndDate;
  }
  const executor = transactionStorage.getStore() || pool;
  const payLoadOfSubscription = {
    addOrDeduct: activePricingData?.isFree ? "add" : "deduct",
    amount: price,
    driverUniqueId,
    transactionUniqueId: userSubscriptionUniqueId,
    transactionType: "Subscription",
    isFree,
    userBalanceCreatedBy: driverUniqueId,
  };
  logger.debug(
    "createUserSubscription ~ payLoadOfSubscription:",
    payLoadOfSubscription,
  );
  // 1. Deduct/add balance for subscription
  // Note: prepareAndCreateNewBalance now throws AppError
  const balanceResult = await prepareAndCreateNewBalance(payLoadOfSubscription);
  logger.debug("@balanceResult", balanceResult);

  // 2. Insert subscription record
  const nextDate = addDays(savedEndDate ? savedEndDate : today, durationInDays);
  const sql = `
    INSERT INTO UserSubscription 
    (userSubscriptionUniqueId, driverUniqueId, subscriptionPlanPricingUniqueId, startDate, endDate, userSubscriptionCreatedBy, userSubscriptionCreatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;
  const values = [
    userSubscriptionUniqueId,
    driverUniqueId,
    subscriptionPlanPricingUniqueId,
    savedStartDate ? savedStartDate : today,
    nextDate,
    userSubscriptionCreatedBy || driverUniqueId,
    currentDate(),
  ];
  const [insertResult] = await executor.query(sql, values);
  if (insertResult.affectedRows === 0) {
    throw new AppError("Failed to create subscription", 500);
  }
  const result = {
    userSubscriptionUniqueId,
    driverUniqueId,
    subscriptionPlanPricingUniqueId,
  };

  // Fetch the newly created subscription with full plan details
  const newSubscription = await getUserSubscriptionsWithFilters({
    userSubscriptionUniqueId,
    limit: 1,
  });
  return {
    message: "success",
    data: [newSubscription?.data?.[0] || result],
    // Return as array to match GET
    pagination: {
      currentPage: 1,
      itemsPerPage: 1,
      totalItems: newSubscription?.pagination?.totalItems || 1,
      totalPages: 1,
      hasNext: false,
      hasPrev: false,
    },
    filters: {
      userSubscriptionUniqueId,
      driverUniqueId,
    },
  };
};

// Update by UUID - Dynamic update (only updates provided fields)

module.exports = {
  createUserSubscription,
};
