const { pool } = require("../Middleware/Database.config");
const { v4: uuidv4 } = require("uuid");

// Create new pricing
const createPricing = async (
  subscriptionPlanUniqueId,
  price,
  durationInDays,
  effectiveFrom,
  effectiveTo
) => {
  const subscriptionPlanPricingUniqueId = uuidv4();

  const sql = `
    INSERT INTO SubscriptionPlanPricing 
    (subscriptionPlanPricingUniqueId, subscriptionPlanUniqueId, price, durationInDays, effectiveFrom, effectiveTo)
    VALUES (?, ?, ?, ?, ?, ?)
  `;

  const values = [
    subscriptionPlanPricingUniqueId,
    subscriptionPlanUniqueId,
    price,
    durationInDays,
    effectiveFrom,
    effectiveTo,
  ];

  const [result] = await pool.query(sql, values);

  return {
    message: "success",
    data: {
      subscriptionPlanPricingUniqueId,
      subscriptionPlanUniqueId,
      price,
      durationInDays,
      effectiveFrom,
      effectiveTo,
    },
  };
};

const getAllPricings = async () => {
  const sql = `
    SELECT * FROM SubscriptionPlanPricing
    ORDER BY createdAt DESC
  `;
  const [result] = await pool.query(sql);
  return { message: "success", data: result };
};

// Get pricing by unique ID
const getPricingByUniqueId = async (subscriptionPlanPricingUniqueId) => {
  const sql = `SELECT * FROM SubscriptionPlanPricing WHERE subscriptionPlanPricingUniqueId = ?`;
  const [result] = await pool.query(sql, [subscriptionPlanPricingUniqueId]);

  return result.length > 0
    ? { message: "success", data: result[0] }
    : { message: "error", error: "Pricing not found" };
};

// Get all pricings for a plan
const getAllPricingsByPlanId = async (subscriptionPlanUniqueId) => {
  const sql = `
    SELECT * FROM SubscriptionPlanPricing 
    WHERE subscriptionPlanUniqueId = ?
    ORDER BY createdAt DESC
  `;
  const [result] = await pool.query(sql, [subscriptionPlanUniqueId]);

  return { message: "success", data: result };
};
const getActiveSubscriptionPlanningPrice = async ({
  subscriptionPlanUniqueId,
  toDay,
}) => {
  const sql = `
    SELECT * FROM SubscriptionPlanPricing 
    WHERE subscriptionPlanUniqueId = ? and effectiveFrom>=? and effectiveTo is null
    ORDER BY createdAt DESC limit 1
  `;
  const [result] = await pool.query(sql, [subscriptionPlanUniqueId, toDay]);

  return { message: "success", data: result };
};
// Update by unique pricing ID
const updatePricingByUniqueId = async (
  subscriptionPlanPricingUniqueId,
  price,
  durationInDays,
  effectiveFrom,
  effectiveTo
) => {
  const sql = `
    UPDATE SubscriptionPlanPricing 
    SET price = ?, durationInDays = ?, effectiveFrom = ?, effectiveTo = ?
    WHERE subscriptionPlanPricingUniqueId = ?
  `;

  const [result] = await pool.query(sql, [
    price,
    durationInDays,
    effectiveFrom,
    effectiveTo,
    subscriptionPlanPricingUniqueId,
  ]);

  return result.affectedRows > 0
    ? {
        message: "success",
        data: {
          subscriptionPlanPricingUniqueId,
          price,
          durationInDays,
          effectiveFrom,
          effectiveTo,
        },
      }
    : { message: "error", error: "Failed to update pricing" };
};

// Delete by unique pricing ID
const deletePricingByUniqueId = async (subscriptionPlanPricingUniqueId) => {
  const sql = `
    DELETE FROM SubscriptionPlanPricing 
    WHERE subscriptionPlanPricingUniqueId = ?
  `;
  const [result] = await pool.query(sql, [subscriptionPlanPricingUniqueId]);

  return result.affectedRows > 0
    ? {
        message: "success",
        data: `Pricing ${subscriptionPlanPricingUniqueId} deleted successfully`,
      }
    : { message: "error", error: "Failed to delete pricing" };
};

module.exports = {
  getActiveSubscriptionPlanningPrice,
  getAllPricings,
  createPricing,
  getPricingByUniqueId,
  getAllPricingsByPlanId,
  updatePricingByUniqueId,
  deletePricingByUniqueId,
};
