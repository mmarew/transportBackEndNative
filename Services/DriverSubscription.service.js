const { pool } = require("../Middleware/Database.config");
const { v4: uuidv4 } = require("uuid");
const {
  getDriverLastBalance,
  prepareAndCreateNewBalance,
} = require("./DriverBalance.service");
const { getSubscriptionPlanByUniqueId } = require("./SubscriptionPlan.service");
const {
  getActiveSubscriptionPlanningPrice,
} = require("./SubscriptionPlanPricing.service");
const currentDate = require("../Utils/CurrentDate");

// Create subscription
const createDriverSubscription = async (
  driverUniqueId,
  subscriptionPlanUniqueId,
  startDate,
  endDate
) => {
  const driverSubscriptionUniqueId = uuidv4();
  const sql = `
    INSERT INTO DriverSubscription 
    (driverSubscriptionUniqueId, driverUniqueId, subscriptionPlanUniqueId, startDate, endDate)
    VALUES (?, ?, ?, ?, ?)
  `;
  const values = [
    driverSubscriptionUniqueId,
    driverUniqueId,
    subscriptionPlanUniqueId,
    startDate,
    endDate,
  ];
  const [result] = await pool.query(sql, values);
  const activePricing = await getActiveSubscriptionPlanningPrice({
    subscriptionPlanUniqueId,
    toDay: currentDate(),
  });
  const price = activePricing?.data?.price;
  const newNetBalance = await prepareAndCreateNewBalance({
    addOrDeduct: "deduct",
    amount: price,
    driverUniqueId,
    transactionUniqueId,
    driverSubscriptionUniqueId,
  });
  console.log("@createDriverSubscription newNetBalance", newNetBalance);
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
const getDriverSubscriptionsByPlanId = async (subscriptionPlanId) => {
  const sql = `SELECT * FROM DriverSubscription WHERE subscriptionPlanId = ? ORDER BY createdAt DESC`;
  const [result] = await pool.query(sql, [subscriptionPlanId]);

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
  subscriptionPlanId
) => {
  const sql = `
    UPDATE DriverSubscription 
    SET startDate = ?, endDate = ?, subscriptionPlanId = ?
    WHERE driverSubscriptionUniqueId = ?
  `;
  const [result] = await pool.query(sql, [
    startDate,
    endDate,
    subscriptionPlanId,
    driverSubscriptionUniqueId,
  ]);

  return result.affectedRows > 0
    ? {
        message: "success",
        data: {
          driverSubscriptionUniqueId,
          startDate,
          endDate,
          subscriptionPlanId,
        },
      }
    : { message: "error", error: "Failed to update subscription" };
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
  getDriverSubscriptionsByPlanId,
  createDriverSubscription,
  getAllDriverSubscriptions,
  getDriverSubscriptionByUniqueId,
  updateDriverSubscriptionByUniqueId,
  deleteDriverSubscriptionByUniqueId,
};
