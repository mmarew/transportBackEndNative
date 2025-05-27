const { pool } = require("../Middleware/Database.config");
const { v4: uuidv4 } = require("uuid");
const {
  getActiveSubscriptionPlanningPrice,
} = require("./SubscriptionPlanPricing.service");
const currentDate = require("../Utils/CurrentDate");
const modifyDateTime = require("../Utils/adjustDateTime");
const {
  prepareAndCreateNewBalance,
} = require("./DriverBalance.service/DriverBalance.post.service");

// Create subscription
const createDriverSubscription = async (
  driverUniqueId,
  subscriptionPlanUniqueId,
  startDate,
  endDate
) => {
  // const activeSubscription=await ()
  const driverSubscriptionUniqueId = uuidv4();
  const today = currentDate();
  // there are old and outdated pricing data so we need active one only
  const activePricing = await getActiveSubscriptionPlanningPrice({
    subscriptionPlanUniqueId,
    today,
  });

  const activePricingData = activePricing?.data?.[0];
  console.log("@activePricingData", activePricingData);
  // if there is no active pricing and planning return error
  if (!activePricingData)
    return {
      message: "error",
      error: "You can't create subscription using this plan.",
    };

  const price = activePricingData?.price;
  const durationInDays = activePricingData?.durationInDays;
  // check if the user already have this subscription
  const getActiveSubscription =
    await getSubscriptionBydriverUniqueIdAndPlanUniqueId({
      driverUniqueId,
      subscriptionPlanUniqueId,
    });

  const activeSubscriptionData = getActiveSubscription?.data?.[0];

  console.log("@getActiveSubscription", getActiveSubscription);
  // return;
  let savedEndDate = null,
    savedStartDate = null;
  // prevent recreate double free trial
  if (activeSubscriptionData) {
    if (activeSubscriptionData?.isTrial) {
      return {
        message: "error",
        error: "You have already registered for a free trial once.",
      };
    } else {
      savedEndDate = activeSubscriptionData?.endDate;
      // the end of previous is begining of today, so we assigned the end date to starting date
      savedStartDate = savedEndDate;
    }
  } else {
  }
  console.log("@savedEndDate", savedEndDate);
  // return;
  // If there is savedEndDate add next purchase on savedEndDate
  const nextDate = modifyDateTime(savedEndDate ? savedEndDate : today, {
    days: durationInDays,
  });

  const sql = `
    INSERT INTO DriverSubscription 
    (driverSubscriptionUniqueId, driverUniqueId, subscriptionPlanUniqueId, startDate, endDate)
    VALUES (?, ?, ?, ?, ?)
  `;
  const values = [
    driverSubscriptionUniqueId,
    driverUniqueId,
    subscriptionPlanUniqueId,
    savedStartDate ? savedStartDate : today,
    nextDate,
  ];
  const [result] = await pool.query(sql, values);
  console.log("@DriverSubscription result", result);
  if (result.affectedRows > 0) {
    // deduct balance if subscription was free trial because it is already added above in balance so deduct it now
    // if (activePricingData?.isTrial) {
    const newBalanceInDeductionOfFreeTrial = await prepareAndCreateNewBalance({
      addOrDeduct: "deduct",
      amount: price,
      driverUniqueId,
      // create new uuidv4 for new data
      transactionUniqueId: uuidv4(), // driverSubscriptionUniqueId,
      transactionType: "Subscription",
    });
    console.log(
      "@newBalanceInDeductionOfFreeTrial",
      newBalanceInDeductionOfFreeTrial
    );
  }

  return {
    message: "success",
    data: {
      driverSubscriptionUniqueId,
      driverUniqueId,
      subscriptionPlanUniqueId,
      startDate,
      endDate,
    },
  };
};

// Get all
const getAllDriverSubscriptions = async () => {
  const sql = `SELECT * FROM DriverSubscription ORDER BY createdAt DESC`;
  const [result] = await pool.query(sql);
  return { message: "success", data: result };
};
// Get subscriptions by driverUniqueId
const getAllOrActiveDriverSubscriptionsByDriverUUId = async ({
  driverUniqueId,
  isActive,
}) => {
  const today = currentDate();
  let sql = `SELECT * FROM DriverSubscription WHERE driverUniqueId = ?`;
  const params = [driverUniqueId];
  if (isActive) {
    sql += ` AND endDate > ?`;
    params.push(today);
  }
  const [result] = await pool.query(sql, params);

  return {
    message: "success",
    data: result,
  };
};
// Get By Plan UUIDV4
const getDriverSubscriptionsByPlanUniqueId = async (
  subscriptionPlanUniqueId
) => {
  const sql = `
    SELECT 
      ds.*, 
      spp.*, 
      sp.planName, 
      sp.description, 
      sp.isTrial
    FROM DriverSubscription ds
    JOIN SubscriptionPlan sp 
      ON ds.subscriptionPlanUniqueId = sp.subscriptionPlanUniqueId
    LEFT JOIN SubscriptionPlanPricing spp 
      ON spp.subscriptionPlanUniqueId = sp.subscriptionPlanUniqueId
    WHERE sp.subscriptionPlanUniqueId = ?
    ORDER BY ds.createdAt DESC
  `;

  const [result] = await pool.query(sql, [subscriptionPlanUniqueId]);

  return {
    message: "success",
    data: result,
  };
};

const getSubscriptionBydriverUniqueIdAndPlanUniqueId = async ({
  driverUniqueId,
  subscriptionPlanUniqueId,
}) => {
  const sql = `
    SELECT * FROM DriverSubscription join SubscriptionPlan on DriverSubscription.subscriptionPlanUniqueId=SubscriptionPlan.subscriptionPlanUniqueId
    WHERE driverUniqueId = ? AND SubscriptionPlan.subscriptionPlanUniqueId = ?
    ORDER BY DriverSubscription.createdAt DESC 
  `;
  const [result] = await pool.query(sql, [
    driverUniqueId,
    subscriptionPlanUniqueId,
  ]);
  return { message: "success", data: result };
};
// Get by driver subscription UUIDV4(driverSubscriptionUniqueId)
const getDriverSubscriptionByUniqueId = async (driverSubscriptionUniqueId) => {
  const sql = `SELECT * FROM DriverSubscription join SubscriptionPlanPricing on DriverSubscription.subscriptionPlanUniqueId=SubscriptionPlanPricing.subscriptionPlanUniqueId WHERE driverSubscriptionUniqueId = ?`;
  const [result] = await pool.query(sql, [driverSubscriptionUniqueId]);

  return result.length > 0
    ? { message: "success", data: result[0] }
    : { message: "error", error: "Driver subscription not found" };
};

// Update by UUID
const updateDriverSubscriptionByUniqueId = async (
  driverSubscriptionUniqueId,
  startDate,
  endDate,
  subscriptionPlanUniqueId
) => {
  const sql = `
    UPDATE DriverSubscription 
    SET startDate = ?, endDate = ?, subscriptionPlanUniqueId = ?
    WHERE driverSubscriptionUniqueId = ?
  `;
  const [result] = await pool.query(sql, [
    startDate,
    endDate,
    subscriptionPlanUniqueId,
    driverSubscriptionUniqueId,
  ]);

  return result.affectedRows > 0
    ? {
        message: "success",
        data: {
          driverSubscriptionUniqueId,
          startDate,
          endDate,
          subscriptionPlanUniqueId,
        },
      }
    : { message: "error", error: "Failed to update subscription " };
};

// Delete by UUID
const deleteDriverSubscriptionByUniqueId = async (
  driverSubscriptionUniqueId
) => {
  const sql = `DELETE FROM DriverSubscription WHERE driverSubscriptionUniqueId = ?`;
  const [result] = await pool.query(sql, [driverSubscriptionUniqueId]);

  return result.affectedRows > 0
    ? {
        message: "success",
        data: `Subscription ${driverSubscriptionUniqueId} deleted successfully`,
      }
    : { message: "error", error: "Failed to delete subscription" };
};

module.exports = {
  getSubscriptionBydriverUniqueIdAndPlanUniqueId,
  getAllOrActiveDriverSubscriptionsByDriverUUId,
  getDriverSubscriptionsByPlanUniqueId,
  createDriverSubscription,
  getAllDriverSubscriptions,
  getDriverSubscriptionByUniqueId,
  updateDriverSubscriptionByUniqueId,
  deleteDriverSubscriptionByUniqueId,
};
