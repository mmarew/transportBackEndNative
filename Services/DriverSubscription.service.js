const { pool } = require("../Middleware/Database.config");
const { v4: uuidv4 } = require("uuid");
const {
  getActiveSubscriptionPlanningPrice,
} = require("./SubscriptionPlanPricing.service");
const currentDate = require("../Utils/CurrentDate");
const modifyDateTime = require("../Utils/adjustDateTime");
const { prepareAndCreateNewBalance } = require("../Utils/PrepareNewBalance");

// Create subscription
const createDriverSubscription = async (
  driverUniqueId,
  subscriptionPlanUniqueId,
  startDate,
  endDate
) => {
  const driverSubscriptionUniqueId = uuidv4();
  const today = currentDate();

  const activePricing = await getActiveSubscriptionPlanningPrice({
    subscriptionPlanUniqueId,
    today,
  });

  const activePricingData = activePricing?.data;
  console.log("@activePricingData", activePricingData);
  if (activePricingData.length == 0)
    return {
      message: "error",
      error: "You can't create subscription using this plan.",
    };
  const price = activePricingData?.[0]?.price;
  const durationInDays = activePricingData?.[0]?.durationInDays;
  const nextDate = modifyDateTime(today, { days: durationInDays });

  const newBalance = await prepareAndCreateNewBalance({
    addOrDeduct: "deduct",
    amount: price,
    driverUniqueId,
    transactionUniqueId: driverSubscriptionUniqueId,
    transactionType: "Subscription",
  });
  console.log("@createDriverSubscription newNetBalance", newBalance);
  if (newBalance.message == "error") return newBalance;
  const sql = `
    INSERT INTO DriverSubscription 
    (driverSubscriptionUniqueId, driverUniqueId, subscriptionPlanUniqueId, startDate, endDate)
    VALUES (?, ?, ?, ?, ?)
  `;
  const values = [
    driverSubscriptionUniqueId,
    driverUniqueId,
    subscriptionPlanUniqueId,
    today,
    nextDate,
  ];
  const [result] = await pool.query(sql, values);

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
const getDriverSubscriptionsByDriverId = async (driverUniqueId) => {
  const sql = `SELECT * FROM DriverSubscription WHERE driverUniqueId = ? ORDER BY createdAt DESC`;
  const [result] = await pool.query(sql, [driverUniqueId]);

  return {
    message: "success",
    data: result,
  };
};

// Get subscriptions by subscriptionPlanId
const getDriverSubscriptionsByPlanUniqueId = async (
  subscriptionPlanUniqueId
) => {
  const sql = `SELECT * FROM DriverSubscription WHERE subscriptionPlanUniqueId = ? ORDER BY createdAt DESC`;
  const [result] = await pool.query(sql, [subscriptionPlanUniqueId]);

  return {
    message: "success",
    data: result,
  };
};
// Get by UUID
const getDriverSubscriptionByUniqueId = async (driverSubscriptionUniqueId) => {
  const sql = `SELECT * FROM DriverSubscription WHERE driverSubscriptionUniqueId = ?`;
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
  getDriverSubscriptionsByDriverId,
  getDriverSubscriptionsByPlanUniqueId,
  createDriverSubscription,
  getAllDriverSubscriptions,
  getDriverSubscriptionByUniqueId,
  updateDriverSubscriptionByUniqueId,
  deleteDriverSubscriptionByUniqueId,
};
