const { pool } = require("../Middleware/Database.config");
const { v4: uuidv4 } = require("uuid");

// Create Gift
const createFreeGiftToDriver = async ({
  driverUniqueId,
  subscriptionPlanUniqueId,
  giftAmount,
  giftTime,
}) => {
  const freeGiftUniqueId = uuidv4();

  const sql = `
    INSERT INTO FreeGiftToDriver 
    (freeGiftUniqueId, driverUniqueId, subscriptionPlanUniqueId, giftAmount, giftTime)
    VALUES (?, ?, ?, ?, ?)
  `;
  const values = [
    freeGiftUniqueId,
    driverUniqueId,
    subscriptionPlanUniqueId,
    giftAmount,
    giftTime,
  ];

  const [result] = await pool.query(sql, values);
  return result.affectedRows > 0
    ? {
        message: "success",
        data: { freeGiftUniqueId, driverUniqueId, giftAmount, giftTime },
      }
    : { message: "error", error: "Failed to save free gift record" };
};

// Get All
const getAllFreeGiftToDrivers = async () => {
  const sql = `SELECT * FROM FreeGiftToDriver ORDER BY createdAt DESC`;
  const [result] = await pool.query(sql);
  return { message: "success", data: result };
};

// Get by ID
const getFreeGiftToDriverByUniqueId = async (freeGiftUniqueId) => {
  const sql = `SELECT * FROM FreeGiftToDriver WHERE freeGiftUniqueId = ?`;
  const [result] = await pool.query(sql, [freeGiftUniqueId]);
  return result.length > 0
    ? { message: "success", data: result[0] }
    : { message: "error", error: "Gift not found" };
};

// Get by Driver
const getFreeGiftToDriverByDriverId = async (driverUniqueId) => {
  const sql = `SELECT * FROM FreeGiftToDriver WHERE driverUniqueId = ? ORDER BY createdAt DESC`;
  const [result] = await pool.query(sql, [driverUniqueId]);
  return { message: "success", data: result };
};

// Delete
const deleteFreeGiftToDriverByUniqueId = async (freeGiftUniqueId) => {
  const sql = `DELETE FROM FreeGiftToDriver WHERE freeGiftUniqueId = ?`;
  const [result] = await pool.query(sql, [freeGiftUniqueId]);
  return result.affectedRows > 0
    ? {
        message: "success",
        data: `Gift ${freeGiftUniqueId} deleted successfully`,
      }
    : { message: "error", error: "Failed to delete gift" };
};

module.exports = {
  createFreeGiftToDriver,
  getAllFreeGiftToDrivers,
  getFreeGiftToDriverByUniqueId,
  getFreeGiftToDriverByDriverId,
  deleteFreeGiftToDriverByUniqueId,
};
