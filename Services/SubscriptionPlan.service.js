const { pool } = require("../Middleware/Database.config");
const { v4: uuidv4 } = require("uuid");

// Create
const createSubscriptionPlan = async (
  planName,
  description,
  isTrial = false
) => {
  const checkSql = `SELECT * FROM SubscriptionPlan WHERE planName = ?`;
  const [existing] = await pool.query(checkSql, [planName]);
  if (existing.length > 0) {
    return { message: "success", data: existing };
  }

  const subscriptionPlanUniqueId = uuidv4();
  const insertSql = `
    INSERT INTO SubscriptionPlan (subscriptionPlanUniqueId, planName, description, isTrial)
    VALUES (?, ?, ?, ?)
  `;
  const [result] = await pool.query(insertSql, [
    subscriptionPlanUniqueId,
    planName,
    description,
    isTrial,
  ]);

  return {
    message: "success",
    data: [
      {
        subscriptionPlanUniqueId,
        planName,
        description,
        isTrial,
      },
    ],
  };
};

// Get all
const getAllSubscriptionPlans = async () => {
  const sql = `SELECT * FROM SubscriptionPlan ORDER BY createdAt DESC`;
  const [result] = await pool.query(sql);
  return { message: "success", data: result };
};

// Get by uniqueId
const getSubscriptionPlanByUniqueId = async (uniqueId) => {
  const sql = `SELECT * FROM SubscriptionPlan WHERE subscriptionPlanUniqueId = ?`;
  const [result] = await pool.query(sql, [uniqueId]);

  return result.length > 0
    ? { message: "success", data: result[0] }
    : { message: "error", error: "Subscription plan not found" };
};

// Update by uniqueId
const updateSubscriptionPlan = async (
  uniqueId,
  planName,
  description,
  isTrial
) => {
  const sql = `
    UPDATE SubscriptionPlan
    SET planName = ?, description = ?, isTrial = ?
    WHERE subscriptionPlanUniqueId = ?
  `;
  const [result] = await pool.query(sql, [
    planName,
    description,
    isTrial,
    uniqueId,
  ]);

  return result.affectedRows > 0
    ? {
        message: "success",
        data: {
          subscriptionPlanUniqueId: uniqueId,
          planName,
          description,
          isTrial,
        },
      }
    : { message: "error", error: "Failed to update subscription plan" };
};

// Delete by uniqueId
const deleteSubscriptionPlan = async (uniqueId) => {
  const sql = `DELETE FROM SubscriptionPlan WHERE subscriptionPlanUniqueId = ?`;
  const [result] = await pool.query(sql, [uniqueId]);

  return result.affectedRows > 0
    ? {
        message: "success",
        data: `Subscription plan ${uniqueId} deleted successfully`,
      }
    : { message: "error", error: "Failed to delete subscription plan" };
};

module.exports = {
  createSubscriptionPlan,
  getAllSubscriptionPlans,
  getSubscriptionPlanByUniqueId,
  updateSubscriptionPlan,
  deleteSubscriptionPlan,
};
