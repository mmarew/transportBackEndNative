const { redis } = require("../Config/redis.config");
const logger = require("./logger");

// ── Last known driver location store ────────────────────────────────────────
// The shipper's map must show the truck the moment the shipper (re)opens the
// app, even if the driver hasn't pushed a fix since. Every locationUpdateToShipper
// payload is kept here briefly (TTL 30 min) and replayed to the shipper the
// moment their socket connects. Falls back to in-memory when Redis is down
// (mirrors WsConnectionStore's pattern).

// eslint-disable-next-line no-magic-numbers
const TTL_SECONDS = 30 * 60; // keep last-known fixes for 30 minutes

// journeyDecisionUniqueId -> { payload, shipperPhoneNumber, updatedAt }
const inMemory = new Map();
// shipperPhoneNumber -> Set<journeyDecisionUniqueId>
const inMemoryByShipper = new Map();

const cleanPhone = phone => String(phone || "").replace(/\D/g, "");

/**
 * Remember the latest live-location payload for a journey.
 * @param {{payload: Object, shipperPhoneNumber?: string}} args
 */
const saveLastLocation = async ({ payload, shipperPhoneNumber } = {}) => {
  try {
    const id = payload?.journeyDecisionUniqueId;
    const phone = cleanPhone(shipperPhoneNumber || payload?.shipperPhoneNumber);
    if (!id || !phone) {
      return;
    }
    const record = { payload, shipperPhoneNumber: phone, updatedAt: Date.now() };

    // In-memory (single-server / test mode)
    inMemory.set(id, record);
    if (!inMemoryByShipper.has(phone)) {
      inMemoryByShipper.set(phone, new Set());
    }
    inMemoryByShipper.get(phone).add(id);

    // Redis (multi-server)
    if (redis && redis.status === "ready") {
      await redis.set(`lastLoc:${id}`, JSON.stringify(record), "EX", TTL_SECONDS);
      const rawIdx = await redis.get(`lastLocIdx:${phone}`).catch(() => null);
      const ids = rawIdx ? JSON.parse(rawIdx) : [];
      if (!ids.includes(id)) {
        ids.push(id);
      }
      await redis.set(`lastLocIdx:${phone}`, JSON.stringify(ids), "EX", TTL_SECONDS);
    }
  } catch (error) {
    logger.debug("saveLastLocation failed", { error: error.message });
  }
};

/**
 * All recent locations for a shipper's phone, newest first (memory then Redis,
 * deduplicated by journeyDecisionUniqueId).
 * @param {string} phoneNumber
 * @returns {Promise<Array<Object>>} the stored payloads.
 */
const getLastLocationsForShipper = async phoneNumber => {
  const phone = cleanPhone(phoneNumber);
  const results = [];
  const seen = new Set();

  // In-memory first (fast path, always present in single-server mode)
  const ids = inMemoryByShipper.get(phone);
  if (ids) {
    for (const id of ids) {
      const record = inMemory.get(id);
      if (record && !seen.has(id)) {
        seen.add(id);
        results.push(record.payload);
      }
    }
  }

  // Redis (multi-server)
  if (redis && redis.status === "ready") {
    try {
      const rawIdx = await redis.get(`lastLocIdx:${phone}`);
      const redisIds = rawIdx ? JSON.parse(rawIdx) : [];
      for (const id of redisIds) {
        if (seen.has(id)) {
          continue;
        }
        const recordRaw = await redis.get(`lastLoc:${id}`);
        if (recordRaw) {
          try {
            const record = JSON.parse(recordRaw);
            seen.add(id);
            results.push(record.payload);
          } catch (parseError) {
            logger.debug("Invalid lastLoc record in Redis", {
              id,
              error: parseError.message,
            });
          }
        }
      }
    } catch (error) {
      logger.debug("getLastLocationsForShipper redis failed", {
        error: error.message,
      });
    }
  }

  return results;
};

/**
 * Drop a journey's stored location (e.g. journey completed/cancelled).
 * @param {string} journeyDecisionUniqueId
 */
const removeLastLocation = async journeyDecisionUniqueId => {
  try {
    const record = inMemory.get(journeyDecisionUniqueId);
    inMemory.delete(journeyDecisionUniqueId);
    if (record?.shipperPhoneNumber) {
      inMemoryByShipper.get(record.shipperPhoneNumber)?.delete(journeyDecisionUniqueId);
    }
    if (redis && redis.status === "ready") {
      await redis.del(`lastLoc:${journeyDecisionUniqueId}`);
    }
  } catch (error) {
    logger.debug("removeLastLocation failed", { error: error.message });
  }
};

module.exports = {
  saveLastLocation,
  getLastLocationsForShipper,
  removeLastLocation,
};
