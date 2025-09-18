const { pool } = require("../Middleware/Database.config");
const { v4: uuidv4 } = require("uuid");
const currentDate = require("../Utils/CurrentDate");
const {
  getActiveSubscriptionPlanningPrice,
} = require("./SubscriptionPlanPricing.service");
const modifyDateTime = require("../Utils/adjustDateTime");
const {
  prepareAndCreateNewBalance,
} = require("./DriverBalance.service/DriverBalance.post.service");

// Create Free Gift
const createFreeGiftToDriver = async ({
  driverUniqueId,
  subscriptionPlanUniqueId,
  giftStartDate,
}) => {
  const freeGiftUniqueId = uuidv4();
  let giftEndDate = null;

  if (!driverUniqueId || !subscriptionPlanUniqueId || !giftStartDate) {
    return {
      message: "error",
      error: "Missing required fields to create free gift",
    };
  }
  if (giftStartDate < new Date().toISOString().slice(0, 10)) {
    return { message: "error", error: "Gift start date cannot be in the past" };
  }
  // get plan and its price
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
      error: "You can't create free gift using this plan.",
    };
  // check if the user has this gift already
  const existingGift = await getFreeGiftToDriverByPlanUniqueIdAndDriverUniqueId(
    {
      subscriptionPlanUniqueId,
      driverUniqueId,
    }
  );
  console.log("@existingGift", existingGift);
  const giftData = existingGift?.data?.[0];
  if (giftData) {
    return {
      message: "error",
      error: "You already have a free gift for this plan.",
      data: giftData,
    };
  }
  // prepare giftEndDate based on plan duration
  if (activePricingData?.durationInDays) {
    giftEndDate = modifyDateTime(
      giftStartDate,
      activePricingData?.durationInDays
    );
  }
  if (giftEndDate && giftEndDate < new Date().toISOString().slice(0, 10))
    return { message: "error", error: "Gift end date cannot be in the past" };
  if (giftEndDate && !giftStartDate)
    return { message: "error", error: "Gift start date is required" };
  if (!giftEndDate && giftStartDate)
    return { message: "error", error: "Gift end date is required" };

  if (giftEndDate && giftEndDate < giftStartDate) {
    return {
      message: "error",
      error: "Gift end date cannot be before start date",
    };
  }
  const sql = `
    INSERT INTO FreeGiftToDriver 
    (freeGiftUniqueId, driverUniqueId, subscriptionPlanUniqueId, giftStartDate, giftEndDate)
    VALUES (?, ?, ?, ?, ?)
  `;
  const values = [
    freeGiftUniqueId,
    driverUniqueId,
    subscriptionPlanUniqueId,
    giftStartDate,
    giftEndDate,
  ];

  const [result] = await pool.query(sql, values);
  // If there is free gifts balance must increase
  const price = activePricingData?.price;
  const newBalance = await prepareAndCreateNewBalance({
    addOrDeduct: "add",
    amount: price,
    driverUniqueId,
    transactionUniqueId: freeGiftUniqueId,
    transactionType: "freeGift",
  });

  return result.affectedRows > 0
    ? {
        message: "success",
        data: {
          freeGiftUniqueId,
          driverUniqueId,
          subscriptionPlanUniqueId,
          giftStartDate,
          giftEndDate,
        },
      }
    : { message: "error", error: "Failed to save free gift record" };
};

// Get All
const getAllFreeGiftToDrivers = async () => {
  const sql = `SELECT *
FROM FreeGiftToDriver
JOIN SubscriptionPlan
  ON FreeGiftToDriver.subscriptionPlanUniqueId = SubscriptionPlan.subscriptionPlanUniqueId
JOIN SubscriptionPlanPricing
  ON SubscriptionPlan.subscriptionPlanUniqueId = SubscriptionPlanPricing.subscriptionPlanUniqueId where isFreeGiftDeleted=?
ORDER BY FreeGiftToDriver.giftCreatedAt DESC;
`;
  const [result] = await pool.query(sql, false);
  return { message: "success", data: result };
};
const getFreeGiftToDriverByPlanUniqueIdAndDriverUniqueId = async ({
  subscriptionPlanUniqueId,
  driverUniqueId,
}) => {
  console.log(
    "@getFreeGiftToDriverByPlanUniqueIdAndDriverUniqueId subscriptionPlanUniqueId",
    subscriptionPlanUniqueId,
    "driverUniqueId",
    driverUniqueId
  );
  const sql = `SELECT * FROM FreeGiftToDriver join SubscriptionPlan on FreeGiftToDriver.subscriptionPlanUniqueId=SubscriptionPlan.subscriptionPlanUniqueId WHERE FreeGiftToDriver.subscriptionPlanUniqueId = ? AND FreeGiftToDriver.driverUniqueId = ? `;
  const [result] = await pool.query(sql, [
    subscriptionPlanUniqueId,
    driverUniqueId,
  ]);
  return { data: result, message: "success" };
};

// Get by Unique ID
const getFreeGiftToDriverByUniqueId = async (freeGiftUniqueId) => {
  const sql = `SELECT * FROM FreeGiftToDriver join SubscriptionPlan on FreeGiftToDriver.subscriptionPlanUniqueId=SubscriptionPlan.subscriptionPlanUniqueId join SubscriptionPlanPricing on SubscriptionPlanPricing.subscriptionPlanUniqueId=SubscriptionPlan.subscriptionPlanUniqueId  WHERE freeGiftUniqueId = ? and isFreeGiftDeleted=?`;
  const [result] = await pool.query(sql, [freeGiftUniqueId, false]);
  return result.length > 0
    ? { message: "success", data: result[0] }
    : { message: "error", error: "Gift not found" };
};

// Get by Driver
const getFreeGiftToDriverByDriverId = async (driverUniqueId) => {
  const sql = `SELECT * FROM FreeGiftToDriver join SubscriptionPlan on FreeGiftToDriver.subscriptionPlanUniqueId=SubscriptionPlan.subscriptionPlanUniqueId  WHERE FreeGiftToDriver.driverUniqueId = ? and isFreeGiftDeleted=? ORDER BY giftCreatedAt DESC`;
  const [result] = await pool.query(sql, [driverUniqueId, false]);
  return { message: "success", data: result };
};

// Delete
const deleteFreeGiftToDriverByUniqueId = async ({
  freeGiftUniqueId,
  userUniqueId,
}) => {
  const today = currentDate();
  if (!freeGiftUniqueId) {
    return { message: "error", error: "Free gift unique ID is required" };
  }

  const sql = `update FreeGiftToDriver set isFreeGiftDeleted=?,freeGiftDeletedAt=?,freeGiftDeletedBy=?  WHERE freeGiftUniqueId = ?`;
  const [result] = await pool.query(sql, [
    true,
    today,
    userUniqueId,
    freeGiftUniqueId,
  ]);
  return result.affectedRows > 0
    ? {
        message: "success",
        data: `Gift deleted successfully`,
      }
    : { message: "error", error: "Failed to delete gift" };
};
const updateFreeGiftToDriverByUniqueId = async (body) => {
  const { freeGiftUniqueId, ...updateFields } = body;

  if (!freeGiftUniqueId || Object.keys(updateFields).length === 0) {
    return {
      message: "error",
      error: "Missing required fields to update free gift",
    };
  }

  const fields = [];
  const values = [];

  for (const [key, value] of Object.entries(updateFields)) {
    fields.push(`${key} = ?`);
    values.push(value);
  }

  // ✅ Push WHERE clause value
  values.push(freeGiftUniqueId);

  const sql = `UPDATE FreeGiftToDriver SET ${fields.join(
    ", "
  )} WHERE freeGiftUniqueId = ?`;

  const [result] = await pool.query(sql, values);

  return result.affectedRows > 0
    ? { message: "success", data: "Gift updated successfully" }
    : { message: "error", error: "Failed to update gift" };
};

module.exports = {
  updateFreeGiftToDriverByUniqueId,
  getFreeGiftToDriverByPlanUniqueIdAndDriverUniqueId,
  createFreeGiftToDriver,
  getAllFreeGiftToDrivers,
  getFreeGiftToDriverByUniqueId,
  getFreeGiftToDriverByDriverId,
  deleteFreeGiftToDriverByUniqueId,
};
